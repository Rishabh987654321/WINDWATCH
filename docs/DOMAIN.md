# DOMAIN.md — Problem, Data, and Analytics Definitions

> Source of truth for **what the numbers mean**. If code and this file disagree, fix one of them in the same PR.

## 1. The business problem (in one paragraph)

A UK energy utility buys electricity on the **day-ahead (DA) market** for each delivery day **D**. The auction closes on **D-1**, so the buying team must decide *before* they know how much wind will actually blow. The energy they must buy from other sources (e.g. thermal) is roughly `demand − wind`. Wind is weather-driven, so they rely on **wind forecasts**. We build a web app that lets them:

1. **See the latest wind forecast that was available at decision time** (D-1), for every hourly period of delivery day D.
2. **Quantify how wrong those forecasts have been**, so they can build an error margin into their purchase.

Scope is deliberately narrow: **national-level wind**, **Elexon BMRS data only**, **purchase decisions for January 2026** (delivery days 1–31 Jan 2026, decisions made 31 Dec 2025 – 30 Jan 2026). No demand data, no prices, no other fuels.

## 2. Data sources (Elexon Insights / BMRS)

| Dataset | Endpoint (stream) | What it is | Fields we use |
|---|---|---|---|
| **FUELHH** | `GET /datasets/FUELHH/stream` | Half-hourly *actual* generation by fuel type | `startTime`, `fuelType`, `generation` (MW), `settlementDate`, `settlementPeriod`, `publishTime` |
| **WINDFOR** | `GET /datasets/WINDFOR/stream` | Wind generation *forecasts*, each with the time it was published | `startTime` (target), `publishTime` (forecast made), `generation` (MW) |

Base URL: `https://data.elexon.co.uk/bmrs/api/v1` (docs UI: `bmrs.elexon.co.uk/api-documentation`).

**Filtering actuals:** keep only `fuelType == "WIND"`. Pass `fuelType=WIND` as a query param if the endpoint supports it; *also* filter client-side defensively.

> ✅ **VERIFIED IN PHASE 0** (see `docs/DECISIONS.md` ADR-002 for full probe report):
> - Exact query params: FUELHH uses `settlementDateFrom`, `settlementDateTo`, `fuelType=WIND`, `format=json` (server-side `fuelType=WIND` confirmed); WINDFOR uses `publishDateTimeFrom`, `publishDateTimeTo`, `format=json`.
> - Max date range per request: Accepts up to 365 days; default ingest chunks in 7–14 day windows.
> - WINDFOR `startTime` resolution: **Hourly (60-minute)**. Evaluated via inner-join on matching hourly actuals with no forward-fill (§4.3).
> - Real forecast horizons: Negative horizons exist (retrocasts down to -25.5h, dropped during normalization); max forward horizon reaches ~66.5h. Do not hardcode 48h; UI reads `max_horizon_hours` from `/meta`.
> - Duplicates: 0 duplicate `(startTime, publishTime)` pairs found; deduplication retained defensively.
> - Timestamps: ISO-8601 with `Z` in UTC. December 2025 forecasts cover January 1, 2026 targets.

## 3. Time handling rules (non-negotiable)

- **Everything internal is UTC**, timezone-aware `datetime` / `pandas.Timestamp(tz="UTC")`. Never naive datetimes.
- **Display and day boundaries use `Europe/London`.** "Delivery day D" = the local London calendar day. January has no DST (London = UTC), but implement via `zoneinfo`, not by assuming `+0`. A unit test must cover a DST-change day (e.g. 2026-03-29, 23-hour day) to prove the logic is general even if the product scope is January only.
- API timestamps: ISO-8601 with `Z`, e.g. `2026-01-15T06:30:00Z`.
- Evaluation grid = **24 hourly periods/day** (23/25 on DST days). Raw FUELHH actuals have 30-min resolution (48 periods/day), but WINDFOR targets are hourly.

## 4. Core definitions

### 4.1 Forecast horizon
`horizon_h = (startTime − publishTime) in hours`. A forecast with horizon 30h was published 30 hours before the period it predicts. Observed range is −25.5 h … +66.5 h. Rows with negative horizon (retrocasts) are dropped at ingest.

### 4.2 Forecast selection policies — *"which forecast counts?"*

For each target period `startTime`, many forecasts exist (different `publishTime`s). A **policy** picks exactly one.

**Policy A — `lead_time` (min horizon H, hours).** Pick the forecast with the **latest `publishTime` such that `startTime − publishTime ≥ H`**. i.e. "the freshest forecast that was available at least H hours ahead". Drives the horizon slider and accuracy-vs-horizon analysis. `H = 0` → freshest forecast not published after the target period begins.

**Policy B — `day_ahead` (cutoff time of day c, local).** For delivery day D, let `cutoff(D) = (D − 1 day) at c, Europe/London`, converted to UTC. For each target in D pick the forecast with the **latest `publishTime ≤ cutoff(D)`**. This is **the product's headline view**: "what the buyer could see when deciding".
- Default `c = 09:00` (config `DAY_AHEAD_CUTOFF_LOCAL`). **Assumption**: GB DA auction gate closures are in the morning of D-1 (roughly 09:20–09:50 UK time, *to be verified*); 09:00 is conservative (strictly before). Keep it configurable and shout about it in the UI and the video (see §7 assumptions log).
- If a target has no forecast with `publishTime ≤ cutoff`, it is **missing** (not backfilled from a later forecast — that would be look-ahead leakage). Report count in `quality`.

Both policies must be **leakage-free** and are the single most important thing to unit-test.

### 4.3 Alignment
Inner-join the selected forecast with actuals on `startTime`. Periods missing either side are excluded from metrics and **counted** in a `coverage` block (`n_expected`, `n_matched`, `n_missing_actual`, `n_missing_forecast`). WINDFOR targets are hourly (`:00`); `:30` actuals are preserved in the snapshot but excluded from metrics without forward-filling or synthesizing forecasts (ADR-011). Energy calculation uses `MWh = MW × 1 h` (not 0.5 h).

### 4.4 Error and metrics
Sign convention: **`error = forecast − actual` (MW)**. Positive = **over-forecast** (we predicted more wind than arrived → the buyer under-bought → exposed to expensive balancing). Negative = **under-forecast**.

| Metric | Formula | Notes |
|---|---|---|
| `n` | matched points | |
| `bias_mw` (ME) | mean(error) | >0 ⇒ systematic over-forecast |
| `mae_mw` | mean(\|error\|) | headline metric |
| `rmse_mw` | sqrt(mean(error²)) | penalises large misses |
| `median_abs_error_mw` | median(\|error\|) | robust |
| `p90_abs_error_mw`, `p95_abs_error_mw` | quantile of \|error\| | "how bad is a bad day" |
| `nmae_pct` | `100 · MAE / mean(actual)` | normalised by **mean actual** (installed capacity isn't in scope data). Document this. |
| `over_forecast_rate` | share of points with error > 0 | |
| `max_over_forecast_mw`, `max_under_forecast_mw` | extremes | with timestamps |
| `r2` / `corr` | optional | Pearson corr of forecast vs actual |

**Do NOT use MAPE** — actual wind approaches 0 and explodes. Say so in the Methodology page (shows rigour).

### 4.5 Risk-adjusted ("firm") wind — the quantified-error feature
For delivery day D under policy B:
1. Build an error sample from **delivery days ≤ D−2 only** (trailing window of `window_days` full days, default 28, i.e. days D−1−window … D−2). Day D−1 is **excluded** because at the D-1 cutoff its actuals are still incomplete — using it would be subtle look-ahead. If the window reaches before the first available day, it is truncated (the December 2025 warm-up data exists precisely so January 1 has a sample); if fewer than `min_days` (default 7) full days remain, return 422/`risk: null` rather than a thin estimate. **No data from D−1 or later** — leakage test required.
2. Let `q = risk_quantile` (default 0.90). `over_q = quantile(error, q)` is the MW the forecast tends to **over-shoot by in the worst (1−q) of cases**.
3. `firm_wind_mw(t) = max(0, forecast(t) − over_q)` — wind the buyer can lean on with ≈`q` confidence. Also return a band using the tail quantiles `q` and `1−q` of the error sample: `band_low_mw = max(0, forecast − quantile(error, q))` (this equals `firm_wind_mw`) and `band_high_mw = max(0, forecast − quantile(error, 1−q))`. With q = 0.90 the band is the 80% central interval of plausible actuals. In addition, return `expected_wind_mw(t) = max(0, forecast(t) − median(error_sample))` as a bias-adjusted central estimate from the same leak-safe sample (`null` if sample is `null`). Exact response field names are in `API.md`.
4. **Backtest calibration** (required, shown in UI): for every delivery day in range, compute the realised share of periods where `actual ≥ firm_wind_mw`. If calibrated it ≈ `q`. Display "Target 90% · Realised 89%". Honest numbers beat pretty numbers.


v1 uses one global error sample. *Stretch*: condition on forecast level (terciles), since error scales with generation.

### 4.6 Other analyses (Accuracy Lab)
- **Error vs horizon**: MAE/RMSE/bias per integer H in `[0, max_horizon_hours]` using policy A. Horizons observed are of the form *x.5 h* (publish at :30, targets at :00), range 0.5–66.5 h. Evaluate integer H using "forecast made ≥ H hours ahead". Fewer targets have a forecast that far ahead for large H (6-h bucket counts fall after 42 h), so each by-horizon point must carry `n`, `n_expected` and `coverage_pct`. `/meta` exposes `max_horizon_hours` (= floor of max, 66) and `reliable_horizon_hours` (= largest H whose coverage ≥ 95%, resolved to 44 h). Coverage moves in steps of 1/24 because publication times repeat daily, so beyond `reliable_horizon_hours` the by-horizon metrics cover a **non-random subset of hours of the day**. Expect error to grow with lead time — if it doesn't, investigate before shipping.
- **By hour of day** (local): MAE & bias per hour 0–23.
- **By generation level**: bin by *actual* (or forecast — state which; default forecast, because that's what's known at decision time) into 5 equal-count bins → MAE, bias.
- **Error distribution**: histogram (fixed MW bins) + quantiles.
- **Forecast evolution (vintages)** for one target period: every forecast ever published for it, plotted by `publishTime`, with the actual as a horizontal line.
- **Day × hour heatmap** of absolute error (canvas).

## 5. Data quality rules
- Dedupe on `(startTime, publishTime)` keep last by `publishTime`/arrival.
- Drop non-finite and **negative** `generation` rows, count them.
- Drop negative horizons (`horizon_h < 0`, retrocasts) and record `retrocast_rows_dropped` in the manifest as informational (expected BMRS behaviour, not a warning).
- Never silently fill gaps. Surface `quality` stats in `/meta` and a UI badge.
- Ingestion is idempotent and produces a **manifest** (`manifest.json`: source URLs, params, row counts, SHA-256 of each file, ingest time, code version).

## 6. Caveats to state in the UI (Methodology page)
- The two datasets may differ in scope (e.g. embedded vs transmission-connected wind, curtailment). We have not verified this; the product reports the difference and makes no claim about its cause.
- National aggregate hides regional errors.
- Evaluation window is one month — not statistically strong for tail estimates (P95+). Show `n` next to every metric.
- Error quantiles assume the recent past resembles the future; weather regimes change.

## 7. Assumptions log (chase ambiguity — keep this updated)
| # | Assumption | Why | How to change |
|---|---|---|---|
| A1 | DA decision cutoff = 09:00 London on D-1 | WINDFOR runs publish at :30 past 02, 04, 07, 09, 11, 15, 18, 22 (UTC). Any cutoff in [07:30, 09:30) selects the 07:30 run; any cutoff in [09:30, 11:30) selects the 09:30 run. Thus A1 (09:00) is safe against ±1 h wobble below 09:30, but the forecast changes if the real gate closure is ≥ 09:30. Note for UI: a cutoff control should make this visible. | env `DAY_AHEAD_CUTOFF_LOCAL`, UI control |
| A2 | "Decisions in January 2026" = delivery days 1–31 Jan 2026 | Reading of brief | config |
| A3 | Error sample for risk band may include Dec 2025 warm-up data | Needed for the first days of January | config `WARMUP_START` |
| A4 | Metrics normalised by mean actual | No capacity data in scope | n/a |
| A5 | Frozen data snapshot is used in production | Deterministic demo, no dependence on Elexon uptime | `ingest` CLI refreshes |

