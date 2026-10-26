# DECISIONS.md — Architecture Decision Records (ADR log)

Format: **Context → Decision → Consequences**. Add a new ADR for any non-obvious choice. The tech-lead video should walk through ADR-001, 003, 004, 005.

---
### ADR-001 — Frozen Parquet snapshot instead of a database or live Elexon calls
- **Context:** Scope is one closed month of national wind data (~100k rows). The demo must be deterministic and survive Elexon downtime/rate limits; Vercel functions are stateless.
- **Decision:** An offline ingest CLI writes Parquet + `manifest.json` into the repo; the API loads them into memory at startup. No runtime Elexon calls.
- **Consequences:** ✅ fast, reproducible, zero infra. ❌ not "live". Mitigation: ingestion is idempotent, chunked, and the scaling path (Postgres/DuckDB, scheduled ingestion) is documented in SYSTEM_DESIGN §7.

### ADR-002 — Elexon API facts (empirical findings from Phase 0 probe)
- **Param names that worked:**
  - `FUELHH`: `settlementDateFrom` (YYYY-MM-DD), `settlementDateTo` (YYYY-MM-DD), `fuelType=WIND`, `format=json`. Server-side `fuelType=WIND` filtering confirmed working (returns 100% WIND rows, reducing payload size by ~95%).
  - `WINDFOR`: `publishDateTimeFrom` (ISO-8601 UTC with `Z`), `publishDateTimeTo` (ISO-8601 UTC with `Z`), `format=json`.
- **Max range per request:**
  - Both endpoints accept date windows of up to 365 days in a single call without error (1-year FUELHH returned 14,199 rows in 0.72s; WINDFOR returned 172,555 rows in 3.10s). For ingestion reliability, chunking into 7–14 day windows remains standard.
- **WINDFOR resolution / horizon range:**
  - Target `startTime` resolution is **Hourly (60-min)** (72 hourly forecast points per publication), whereas `FUELHH` actuals are **Half-Hourly (30-min)** (48 periods/day).
  - Horizon range (`startTime − publishTime`):
    - **Min horizon: -25.50 hours** — WINDFOR publications contain retrocasts (negative horizons). Ingestion must drop rows where `horizon_h < 0`.
    - **Max horizon: 66.50 hours** — Real forecast horizon reaches ~66.5 hours (well beyond 48 hours). The UI and pipeline must dynamically read `max_horizon_hours` from `/api/v1/meta`.
  - Publications occur every 2 to 4 hours (120 to 240 minute intervals).
- **Duplicates/revisions behaviour:**
  - 0 duplicate `(startTime, publishTime)` pairs detected in the probe window. Ingest deduplication on `(startTime, publishTime)` remains as defensive hygiene.
- **December 2025 coverage for Jan 1 2026 targets:**
  - Confirmed: Forecasts published between Dec 29 and Dec 31, 2025 cover 2026-01-01 targets starting at 00:00:00Z through 23:00:00Z (368 forecast rows found).
- **Impact on design:**
  1. *Alignment*: Inner-join on `startTime` aligns hourly forecast points with the corresponding `:00` actuals (24 aligned points/day). No synthetic forward-filling of `:30` forecast slots.
  2. *Data Hygiene*: Ingestion pipeline must discard negative-horizon rows (`horizon_h < 0`).
  3. *Dynamic Horizon UI*: The lead-time slider and Accuracy Lab by-horizon endpoints must use dynamic `max_horizon_hours` (up to ~66h) rather than a hardcoded 48h.
  4. *Server-side Filtering*: Ingestion passes `fuelType=WIND` directly to Elexon FUELHH to save bandwidth, retaining client-side filtering as defense-in-depth.

### ADR-003 — Two forecast-selection policies (`lead_time`, `day_ahead`)
- **Context:** The brief asks for "the latest forecast available when they need to make decisions". That is a *cutoff* concept. Accuracy analysis, though, is naturally parameterised by *horizon*.
- **Decision:** Offer both: `day_ahead` (cutoff on D-1, default 09:00 London, configurable) as the headline, and `lead_time` (min horizon H) for the interactive accuracy analysis.
- **Consequences:** ✅ answers both user needs; ❌ two code paths → both covered by property-based leakage tests.

### ADR-004 — Error sign, metrics and no MAPE
- **Decision:** `error = forecast − actual`; headline MAE/RMSE/bias/P90, nMAE normalised by mean actual; MAPE deliberately omitted (explodes near zero wind).
- **Consequences:** Positive bias = over-forecast = buyer under-buys = the costly direction; the UI says so explicitly.

### ADR-005 — Risk band from trailing empirical error quantiles, D−2 rule
- **Context:** "Make decisions considering the quantified error."
- **Decision:** Firm wind = `max(0, forecast − Q_q(error))`, error sample from the prior `window_days` delivery days **ending D−2** (D−1 is incomplete at cutoff). Report realised coverage via backtest.
- **Consequences:** ✅ simple, explainable, honest (calibration shown). ❌ ignores heteroscedasticity (error scales with level) → stretch: level-conditional quantiles.

### ADR-006 — ECharts (canvas) over Recharts/D3
- **Decision:** Apache ECharts with modular imports. Handles linked zoom, brush, heatmap, 3k+ points smoothly; theme-able to Neo-Brutalism.
- **Consequences:** ❌ larger dependency (mitigated by `echarts/core` tree-shaking); ✅ less custom code than D3.

### ADR-007 — Tailwind v4 + own primitives instead of MUI
- **Decision:** Neo-Brutalism (hard borders/shadows) is easier to implement faithfully with utility CSS + tokens than by fighting MUI's theming.
- **Consequences:** more primitives to write (small set), full visual control.

### ADR-008 — Single-origin deploy (reverse proxy / rewrites)
- **Decision:** Browser always calls `/api/*` on its own origin (nginx in Docker; Vercel rewrites in prod).
- **Consequences:** no CORS in the main path; CORS allow-list remains available for split deployments.

### ADR-009 — Types generated from OpenAPI
- **Decision:** `openapi-typescript` generates frontend types; CI fails on drift.
- **Consequences:** contract is enforced by the build instead of by discipline.

### ADR-010 — AI-assisted development disclosure
- **Decision:** Antigravity (Gemini-based agentic IDE) and Claude were used for planning/scaffolding/code generation; all code reviewed and understood by the author; disclosed in README as required by the brief.

### ADR-011 — Hourly evaluation grid (inner join on `:00` targets)
- **Context:** The Phase 0 probe revealed WINDFOR forecast targets are hourly (`:00`), while FUELHH actuals are half-hourly (`:00` and `:30`).
- **Decision:** Align evaluation strictly on the inner join of `start_time` timestamps (`:00`), yielding 24 evaluation periods per standard calendar day (23/25 on DST change days). The `:30` actuals are preserved in the raw snapshot but excluded from metrics. Forecasts are NOT forward-filled or synthetically interpolated for `:30`, and actuals are not averaged into 1h blocks (we make no assumption whether WINDFOR is instantaneous or hour-average). Energy calculation uses `MWh = MW × 1 h` (not 0.5 h).
- **Consequences:** ✅ Clean, assumption-free alignment; headline metrics are directly interpretable. ❌ 24 points per day instead of 48.

### ADR-012 — Irregular forecast publication cadence and forecast age visibility
- **Context:** WINDFOR forecasts are published irregularly every 2 to 4 hours (e.g. 120m, 180m, 240m intervals; often at `:30`).
- **Decision:** Under the day-ahead cutoff policy (default 09:00 London on D-1), the latest available forecast may be 1–4 hours old. The pipeline selects the freshest forecast published `≤ cutoff(D)`. The UI prominently displays both `publish_time` and `forecast_age_h` so traders know how fresh the forecast was at gate closure.
- **Consequences:** Clear operational clarity for users; no assumptions about fixed hourly publication.

### ADR-013 — Forecast bias is observed empirically, not an alignment artifact
- **Context:** Initial exploratory checks revealed substantial positive bias (`forecast > actual`) across January 2026. Diagnostic tested whether this was an artifact of half-hour time lag or block averaging.
- **Decision:** Retain the ADR-011 `:00` inner join default. Diagnostic proved:
  1. Alignment variants (`:30`, previous `:30`, same-hour average `(:00, :30)`, previous-hour average `(prev :30, :00)`) changed MAE by < 1.3 % (2,050.2 MW → 2,024.5 MW) and left bias unchanged (+1,848 to +1,855 MW), far below the 10 % decision threshold.
  2. The bias is present under both selection policies across January 2026 ($n = 744$ hours):
     - Under `lead_time` ($H = 24\text{ h}$): bias is **+1,854.2 MW** (MAE: 2,050.2 MW; actuals are 86.2 % of forecast).
     - Under `day_ahead` (09:00 London cutoff): bias is **+1,851.5 MW** (MAE: 2,127.5 MW; selected forecast horizons range from 16.5 h to 39.5 h).
  3. The magnitude of the bias is larger when forecast generation is high: in tercile analysis under $H = 24\text{ h}$, the high tercile exhibits mean bias of +3,220.2 MW compared to +988.0 MW in the low tercile.
  4. The root cause cannot be definitively determined from these two public BMRS datasets alone; hypotheses include definitional scope difference (e.g. transmission-connected vs embedded wind), physical curtailment during high-wind events, or genuine model over-forecasting. The product reports both figures transparently labeled by policy and does not apply post-hoc scaling factors.
- **Consequences:** ADR-011 remains solid; methodology page, API, and UI report the bias objectively with explicit policy labels.

### ADR-014 — Service-layer in-memory LRU caching per snapshot_id
- **Context:** System latency budgets (SYSTEM_DESIGN §5) require sub-50ms warm responses for interactive analytical queries (such as `/series`, `/metrics/*`, and `/day-ahead/*`). Domain computations (`select_day_ahead`, `select_lead_time`, `align`, and `errors_by_day`) are pure and deterministic for a given static Parquet snapshot, but re-running dataframe filters on every HTTP request adds 10–50ms overhead.
- **Decision:** Implement an in-memory LRU cache in `backend/app/services/` (not in `domain/`, keeping the domain pure and stateless). Cache keys are compound tuples prefixed by `(snapshot_id, ...)`. We cache:
  1. Selected forecast dataframes by `(snapshot_id, policy, cutoff_or_horizon, date_from, date_to)`
  2. Errors-by-day alignment and risk sample structures by `(snapshot_id, cutoff, window_days, q)`
- **Consequences:** ✅ Zero external caching infrastructure (no Redis). Sub-millisecond warm responses easily beating latency budgets. Snapshot changes automatically bust the cache via `snapshot_id`. Domain remains 100% pure.

### ADR-015 — Default risk historical error window set to 28 days
- **Context:** Risk band evaluation over January 2026 delivery days revealed that realised coverage at the nominal 90% target ($q = 0.90$) varied substantially with trailing window size: 7 days achieved 76.75% coverage, 14 days achieved 83.60%, 21 days achieved 88.31%, and 28 days achieved **88.58%** (closest to the 90% nominal target). Shorter trailing windows suffered severe lag during rapid weather regime shifts (such as calm-to-storm transitions on Jan 1, Jan 11, and Jan 28).
- **Decision:** Update the default trailing error window from 14 days to **28 days** (`window_days = 28`), keeping the permitted range as 3–45 days and `min_days` = 7.
- **Consequences:** Default window chosen after observing January 2026 results on a single month $\rightarrow$ in-sample choice; clearly disclosed in Methodology and the UI; sensitivity analysis across 7, 14, 21, and 28 days exposed in UI controls and backtest reports.





