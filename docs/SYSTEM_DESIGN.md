# SYSTEM_DESIGN.md

Deep-dive on data model, algorithms, performance, failure modes and the "what if this were 1000× bigger" story. Read `DOMAIN.md` first for definitions.

## 1. Data model (in-memory, from Parquet)

**`actuals`** (index: `start_time` UTC, unique, sorted)
| col | type | note |
|---|---|---|
| `start_time` | datetime64[ns, UTC] | period start |
| `actual_mw` | float64 | FUELHH WIND `generation` |

**`forecasts`** (sorted by `start_time`, then `horizon_h` ascending)
| col | type | note |
|---|---|---|
| `start_time` | datetime64[ns, UTC] | target period |
| `publish_time` | datetime64[ns, UTC] | when forecast was made |
| `forecast_mw` | float64 | WINDFOR `generation` |
| `horizon_h` | float32 | `(start_time − publish_time)/1h`, precomputed |

Unique key: `(start_time, publish_time)`. Rows with `horizon_h < 0` (published after the period started, i.e. retrocasts) are dropped at ingest and recorded as **`quality.retrocast_rows_dropped`** (informational, expected BMRS publication artifact).

`manifest.json`: `{snapshot_id, ingested_at, code_version, sources:[{dataset, url_template, params, row_count, sha256}], quality:{...}}`.

Expected size: ~744 hourly targets/month × ~20–30 vintages ≈ 15k–35k forecast rows, plus ~2,976 half-hourly actuals for 2 months. Trivial in memory (<10 MB Parquet). Observed max horizon reaches ~66.5 h.

## 2. Ingestion pipeline (`app/ingest`)

```
plan windows ──▶ fetch (async, bounded concurrency=4) ──▶ normalize ──▶ validate ──▶ write parquet + manifest
```
- **Windowing**: split `[warmup_start, end]` into ≤7-day chunks (probe may allow more). WINDFOR chunks by `publishDateTime*`, **starting early enough to include forecasts for 1 Jan targets** (publishTime from `2025-12-01`, ends after the last Jan target). FUELHH by `settlementDate*`.
- **Resilience**: `httpx.AsyncClient(timeout=30)`, exponential backoff with jitter on 429/5xx/timeouts (max 5), honour `Retry-After`. Fail the run loudly if any chunk exhausts retries (never write a partial snapshot silently).
- **Normalize**: parse ISO times → UTC; rename to snake_case; keep only needed columns; filter `fuelType == "WIND"`; compute `horizon_h`.
- **Validate**: dedupe `(start_time, publish_time)`; drop non-finite/negative generation (count); assert 30-min grid on actuals; assert `start_time` coverage of Jan 2026 for actuals (every period present, or report gaps).
- **Idempotent & deterministic**: same inputs → byte-identical-ish output (sorted, fixed dtypes, fixed Parquet compression); manifest records SHA-256.
- **CLI**: `python -m app.ingest.cli --from 2025-12-01 --to 2026-02-01 --out backend/data/snapshot` (+ `--dry-run`, `--chunk-days`). Offline test mode uses recorded fixtures (no network in CI).

## 3. Request lifecycle

```
GET /api/v1/day-ahead/2026-01-15?cutoff=09:00&risk_quantile=0.9
 → middleware: assign request_id, start timer
 → router: validate params (Pydantic) 
 → service.day_ahead(): 
     sel = selection.day_ahead(store.forecasts, cutoff)      # cached per cutoff
     errs = errors_for_all_days(sel, store.actuals)           # cached per cutoff
     sample = risk.sample(errs, D, window_days)               # slice days ≤ D−2
     band = risk.band(sel[D], sample, q)
     assemble DayAheadResponse
 → middleware: log {route, status, latency_ms, request_id, snapshot_id}
```

### 4. Selection algorithms (the heart; vectorised, leakage-free)
Note: Selection operates on hourly forecast targets (`start_time`), inner joined with `:00` actuals per ADR-011.

### 4.1 `lead_time` (min horizon H)
```python
def select_lead_time(fc: DataFrame, H: float) -> DataFrame:
    # fc is sorted by (start_time, horizon_h asc)
    m = fc[fc.horizon_h >= H]                      # only forecasts made ≥ H hours ahead
    return m.drop_duplicates("start_time", keep="first")   # smallest horizon ≥ H == latest publish_time
```
O(N) per H. Cache results per `H` (LRU, key = H rounded to 1 h) **on the full snapshot**; slice the date range afterwards (selection is independent per target, so slicing after is equivalent).

### 4.2 `day_ahead` (cutoff c)
```python
def select_day_ahead(fc, cutoff_local: time, tz="Europe/London") -> DataFrame:
    d = delivery_date_local(fc.start_time)                    # London local date of the target
    cutoff_utc = to_utc(local_dt(d - 1 day, cutoff_local))    # vectorised via tz-aware ops
    m = fc[fc.publish_time <= cutoff_utc]
    return m.sort_values(["start_time","publish_time"]).drop_duplicates("start_time", keep="last")
```
Property tests (hypothesis): ∀ rows selected, `publish_time ≤ cutoff(D)`; no other row for that target satisfies the cutoff and has a later `publish_time`.

### 4.3 Accuracy vs horizon without O(H·N) pain
For each integer `H ∈ [0, max_horizon_hours]`: run 4.1, align with actuals, compute MAE/RMSE/bias/P90 with numpy. Total ≈ 67 × ~25k-row operations ≈ well under 500 ms; cache the full by-horizon table for the full snapshot, then recompute only for custom date ranges (still < 400 ms). Don't parallelise prematurely; measure first.

### 4.4 Risk band
`errors_by_day` = per-delivery-day error arrays under the chosen cutoff (cached). For D: concatenate days in `[D−1−window_days, D−2]` ∩ available. `np.quantile(sample, [1−q, q], method="linear")`. Vectorised across all D for the calibration endpoint (loop over ≤31 days is fine — clarity over cleverness).

## 5. Performance budgets (measure in CI with a smoke benchmark; fail on 3× regression)
| Endpoint | Cold | Warm |
|---|---|---|
| `/meta` | < 20 ms | < 5 ms |
| `/series` (31 days) | < 300 ms | < 100 ms |
| `/day-ahead/{d}` | < 300 ms | < 80 ms |
| `/metrics/by-horizon` (0–66h) | < 1.5 s | < 400 ms |
| Others | < 300 ms | < 100 ms |
| Frontend: slider drag → chart repaint | — | < 100 ms perceived, no jank (<16 ms main-thread chunks) |
| Frontend initial JS (gzipped) | — | < 350 KB (ECharts imported modularly — tree-shake! `echarts/core`) |

## 6. Failure modes & handling
| Failure | Handling |
|---|---|
| Snapshot file missing/corrupt at startup | App starts, `/ready` = 503, `/api/*` = 503 problem+json, loud log; CI checksum guard prevents shipping it |
| Elexon down during ingest | Retry w/ backoff, then fail run with non-zero exit; snapshot untouched |
| Missing periods | Reported in `coverage`; excluded from metrics; UI shows a "gaps" badge |
| Requested range outside coverage | 422 with allowed range in `detail` |
| Cutoff yields no forecasts for a day | `forecast_mw: null` periods; day flagged `incomplete` |
| Vercel cold start | Snapshot load < 1 s; heavy computations lazy+cached; frontend shows skeletons |
| Clock/DST bugs | All internal UTC; DST test day in suite |

## 7. If this were real (scaling story for the tech-lead review)
- **Data volume ↑** (years, regions, many forecast providers): move to Postgres/Timescale or Parquet-on-object-store + DuckDB; keep `domain/` unchanged (it takes DataFrames).
- **Ingestion at scale / backfills**: orchestrate with Celery/Ray/Prefect — each `(dataset, window)` chunk is an independent idempotent task (already designed that way).
- **Live operation**: scheduled ingestion every 30 min; snapshot_id changes → ETag changes → clients refresh.
- **Heavy analytics** (many cutoffs × quantiles): precompute and persist, or vectorise further; consider Ray/Dask only when measurements justify it.
- **Probabilistic forecasting**: replace the empirical-quantile risk band with quantile regression / conformal prediction conditional on forecast level and hour.
- **LLM layer (stretch)**: structured-output "daily briefing" with cost/latency caps, evals against known days — only after v1 ships.
