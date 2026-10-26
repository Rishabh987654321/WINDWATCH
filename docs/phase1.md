# PHASE 1 PROMPT — paste everything below into Antigravity

---

You are the AI coder for **WindWatch**. Phase 0 is done and reviewed. Re-read `AGENTS.md`, `docs/DOMAIN.md`, `docs/SYSTEM_DESIGN.md` §1–2, `docs/DECISIONS.md` (ADR-002), `docs/TESTING.md` §2 (Ingestion), `docs/PHASES.md` (Phase 1). Work on branch `phase-1-ingest`. **Do not commit or push** — I'll do that myself; at the end give me the suggested Conventional Commit messages grouped by file. I'm on Windows: every command you add must work on Windows (use `python -m ...`, no bash-only syntax; keep `make.bat` in sync).

## Step 0 — Sync docs with the Phase 0 probe findings (do this first, minimal edits)

The probe proved the data differs from our docs' assumptions. Apply these changes, and add **ADR-011** and **ADR-012** to `docs/DECISIONS.md`:

1. **Evaluation grid is HOURLY, not half-hourly.** WINDFOR targets are hourly (`:00`), FUELHH actuals are 30-min. Metrics are computed on the inner join, i.e. only `:00` timestamps → **24 periods/day** (23/25 on DST days). The `:30` actuals are stored but **not used** in metrics and **not synthesised/forward-filled** for forecasts. (ADR-011: reason = we don't know whether a WINDFOR hour value is an instantaneous or hour-average figure, so we make no assumption; alternative "average the two half-hours" recorded as a considered option.)
   - `DOMAIN.md` §3 ("48 periods/day"), §4.3, §4.4 (MWh = MW × **1 h**, not 0.5 h).
   - `API.md`: all examples and rules that mention 48 points/periods, `n_expected` 96/1488, `error_sample_size` 672 (→ **14 × 24 = 336**), MWh = Σ MW × 1 h; `/meta.data.resolution_minutes` → **60** (add `actual_resolution_minutes: 30`); `/metrics/by-hour` `n` per hour; `/series` expected-point counts (≈ 744 for 31 days).
   - `SYSTEM_DESIGN.md` §1 sizes, §4 (`select_*` operate on hourly targets), §5 perf notes.
   - `DESIGN.md` ("48 half-hours" → "24 hourly periods"), `TESTING.md`/`PHASES.md` wording where "48" refers to periods per day. **Keep** "48 h" only where it meant forecast horizon and replace it by `max_horizon_hours` (≈ 66 h observed).
2. **Forecast horizon observed range: −25.5 h … +66.5 h.** ~20 % of rows have **negative horizon** (retrocasts: `startTime < publishTime`). They are _expected_, not a data-quality problem: drop them at ingest and record `retrocast_rows_dropped` (rename/alias of `dropped_negative_horizon`) in the manifest as **informational**, not as a warning.
3. **Publish cadence is irregular** (gaps of 2, 3 and 4 hours between publications; times like `:30`). So "latest forecast before cutoff" may be several hours old. ADR-012 records this, and the UI must show **forecast age** prominently (already in DESIGN.md).
4. **Server-side `fuelType=WIND` works**; **no max date range found up to 365 days** (WINDFOR 365 d ≈ 172k rows in 3 s). We still chunk in **7-day windows** (default, configurable `--chunk-days`) for resilience and progress logging.
5. **Date params are inclusive**: FUELHH `settlementDateTo=2026-01-08` includes the 8th (4 days → 192 rows). Add a test that guards this off-by-one.

Show me a list of the doc files you changed (one line each) before moving on.

## Step 1 — Ingestion windows (use exactly these)

- **FUELHH** (`fuelType=WIND&format=json`): `settlementDateFrom=2025-12-01`, `settlementDateTo=2026-01-31` (inclusive).
- **WINDFOR** (`format=json`): `publishDateTimeFrom=2025-11-28T00:00:00Z`, `publishDateTimeTo=2026-02-01T00:00:00Z`. Starting on 28 Nov matters: forecasts reach ~66 h ahead, so day-ahead for 1–2 Dec needs publications from late November (keeps the warm-up period complete).
- After normalisation keep only rows with `start_time` in `[2025-12-01T00:00Z, 2026-02-01T00:00Z)`.
- Make windows CLI-configurable with these as defaults; also add `--from-fixtures <dir>` for fully offline runs.

## Step 2 — Implement `backend/app/ingest/`

Follow `docs/SYSTEM_DESIGN.md` §2 plus the probe facts:

- `elexon_client.py`: `httpx.AsyncClient(timeout=30)`, bounded concurrency (4), exponential backoff + jitter on 429/5xx/timeouts (max 5), honour `Retry-After`, per-chunk structured logs (rows, attempts, ms). **Fail the whole run non-zero** if any chunk exhausts retries; never write a partial snapshot. Reuse the response parsing the probe already proved works (don't re-guess the JSON shape).
- `normalize.py`: parse ISO → tz-aware UTC; snake_case (`start_time`, `publish_time`, `actual_mw`, `forecast_mw`); filter `fuelType == "WIND"` defensively even though the server filters; compute `horizon_h = (start_time − publish_time)/1h`; **drop negative horizons**; dedupe `(start_time, publish_time)`; drop non-finite and negative generation (count each); fixed dtypes; deterministic sort (`start_time`, `horizon_h`).
- `validate.py`: actuals must lie on a 30-min grid across the window — **report gaps** (don't fill); forecast `start_time`s must be hourly; assert the Jan 2026 window has no missing hourly actuals (or list them).
- `writer.py`: write `actuals.parquet`, `forecasts.parquet` (fixed compression, e.g. zstd), and `manifest.json` = `{snapshot_id, ingested_at, code_version, windows, sources:[{dataset, url_template, params, row_count, sha256}], quality:{dropped_negative_generation, duplicates_removed, retrocast_rows_dropped, missing_actual_periods, missing_forecast_hours, ...}, horizon:{min_h, max_h}}`. `snapshot_id` = SHA-256 over the two file hashes.
- `cli.py`: `python -m app.ingest.cli --from … --to … --out backend/data/snapshot [--chunk-days 7] [--dry-run] [--from-fixtures DIR]`. Wire `make ingest` and `make.bat ingest`.

## Step 3 — Snapshot profile (exploratory, NOT product logic)

Add `python -m app.ingest.profile` that reads the snapshot and prints + saves `backend/data/snapshot/profile.json`:

1. Row counts, coverage, gap lists.
2. **Publish time-of-day histogram** (UTC and Europe/London) and the distribution of gaps between publications.
3. For each January delivery day D: the **latest `publish_time` ≤ 09:00 London on D−1**, its age in hours at that cutoff, and the number of hourly targets in D with **no** forecast at the cutoff. Also repeat for cutoffs 08:00, 10:00, 11:00 so I can judge how sensitive our 09:00 assumption (A1) is.
4. Horizon distribution (min/median/max; share of forecasts per 6-hour horizon bucket).
5. A rough sanity number only: for hourly January targets, MAE and bias of "latest forecast published ≥ 24 h before" vs actual, and wind actual min/mean/max. (Throwaway check inside the profile script — do **not** put selection/metrics logic into `app/domain` yet; that is Phase 2.)

## Step 4 — Run it and commit the snapshot data

Run `make ingest` against the real API, then the profile. Commit-ready snapshot must be **< 20 MB** total (tell me the actual size). Re-run once and show that `snapshot_id`/file hashes are **identical** (idempotency evidence; if Parquet metadata makes bytes differ, fix the writer, e.g. fixed row-group/compression settings and no volatile metadata).

## Step 5 — Tests (offline, no network; respx; fixtures from `backend/tests/fixtures/elexon_raw/`)

Name tests after the rule they prove:

- `test_client_retries_on_503_then_succeeds`, `test_client_honours_retry_after_on_429`, `test_client_raises_after_max_retries_and_writes_nothing`
- `test_chunk_planner_covers_range_exactly_without_gaps_or_overlaps` (incl. last short chunk) and `test_fuelhh_date_to_is_inclusive`
- `test_normalize_converts_to_utc_and_snake_case`, `test_normalize_computes_horizon_hours`, `test_normalize_drops_negative_horizon_and_counts_them`
- `test_normalize_dedupes_start_publish_pairs`, `test_normalize_drops_negative_and_nonfinite_generation_and_counts`, `test_normalize_filters_to_wind_only`
- `test_validate_reports_gaps_without_filling`
- `test_manifest_sha256_matches_files`, `test_snapshot_is_deterministic_for_same_input`, `test_snapshot_not_written_when_any_chunk_fails`
- A test that fails if `manifest.json` checksums don't match the committed Parquet files (this becomes the CI **snapshot guard**; add it to `ci.yml`).
  Keep coverage for `app/ingest` ≥ 90 %.

## Definition of Done (show evidence for each)

- [ ] Step 0 doc edits listed; ADR-011 and ADR-012 added
- [ ] `make lint` and `make test` green (paste summary incl. coverage for `app/ingest`)
- [ ] `make ingest` produced `actuals.parquet`, `forecasts.parquet`, `manifest.json`; sizes reported (< 20 MB)
- [ ] Idempotency evidence: two runs → identical `snapshot_id`
- [ ] Profile output pasted in your reply (all 5 sections)
- [ ] Snapshot-guard test wired into CI
- [ ] Suggested commit messages provided (not committed)

## Rules

Never invent API behaviour — if something unexpected shows up in the real data, report it with numbers. No new dependencies beyond ARCHITECTURE §3 without saying why. Don't build any API endpoint, selection policy, metric or UI in this phase.

## When done

Reply with: (1) docs changed, (2) manifest summary (row counts, quality counters, horizon min/max, snapshot_id, sizes), (3) the profile report, (4) anything surprising in the data, (5) suggested commits. **Then stop and wait — do not start Phase 2.**
