# PHASE 3 PROMPT — paste everything below into Antigravity

---

You are the AI coder for **WindWatch**. Phases 0–2 are done and reviewed. Re-read `AGENTS.md`, `docs/API.md` (the contract), `docs/ARCHITECTURE.md` §5 (layering), `docs/SYSTEM_DESIGN.md` §3 & §5, `docs/TESTING.md` §2 (API), `docs/DECISIONS.md`, `docs/PHASES.md` (Phase 3). Branch: `phase-3-api`. **Do not commit or push**; give me suggested Conventional Commit messages at the end. Commands must work on Windows.

## Step 0 — Follow-ups from the Phase 2 review (do these first, briefly)

**a) Fix ADR-013 wording.** It currently asserts a "structural scope mismatch (transmission-metered vs curtailment)". The data does not show a cause. Rewrite it to: _"WINDFOR day-ahead forecasts over-state FUELHH WIND by ≈1.85 GW (≈14 % of the forecast; actual/forecast ≈ 86 %) on 30/31 days, in every hour and horizon bucket, scaling with generation level. Alignment variants change MAE < 1.3 %. The cause cannot be determined from these two datasets alone; hypotheses: definitional scope difference, curtailment, genuine forecast bias."_ Apply the same neutral wording anywhere else it appears (`docs/`, `README.md`, `SNAPSHOT_PROFILE.md`). The product reports the bias; it does not explain it.

**b) Verify a suspicious number.** In the weekly bias breakdown, Week 2 and Week 3 are both **+1,397 MW**. Check whether that is a coincidence or a grouping/copy bug (print the date ranges, `n` and exact unrounded means per week). Report what you found; fix if it's a bug.

**c) Test-coverage matrix.** Print a table mapping **every test name required in `docs/prompts/phase2.md` Step 3** to the actual `file::test_name` that covers it. Flag any that are missing or only partially covered (esp. `by_level` ties, `by_horizon` coverage falling, DST 23/25-hour days, real-data day-ahead smoke = 24 targets, `publish_time` = 07:30 UTC D−1, age 1.5 h, cutoff [07:30, 09:30) → 07:30 run and 09:30 → 09:30 run). Add the missing ones. Also cover `metrics.py` lines 483–517 (currently untested; likely `distribution`/`heatmap`).

**d) Mutation sanity checks (temporary, then revert).** For each, break the code, run the tests, **show the failing test name**, then revert (use `git stash`/`git diff` evidence or a throwaway copy; don't leave the break in):

1. In `select_day_ahead`, change `publish_time <= cutoff` to allow one extra hour.
2. In `risk.error_sample`, include day D−1.
3. In `metrics`, flip the error sign (`actual − forecast`).
4. In `select_lead_time`, change `>= H` to `> H` (or `>= H − 1`).
   If any mutation survives (no test fails), add a test that kills it.

**e) Add one small domain function, test-first:** `risk.expected(forecast, sample)` → `expected_wind_mw = max(0, forecast − median(error_sample))` (bias-adjusted central estimate from the _same_ leak-safe sample; `None` if the sample is `None`). Update `docs/DOMAIN.md` §4.5 (add the definition) and `docs/API.md` (additive: `periods[].expected_wind_mw`, and `summary.mean_expected_wind_mw`). Tests: clipped at 0; equals `forecast − median`; uses the D−2 rule.

## Step 1 — Infrastructure (`backend/app/`)

- `config.py`: `pydantic-settings` reading env vars from `.env.example` (defaults: cutoff `09:00`, eval window 2026-01-01..2026-01-31, warm-up start 2025-12-01, risk q 0.9, window 14, min_days 7, `SNAPSHOT_DIR`, `CORS_ORIGINS`, `ADMIN_TOKEN`).
- `logging.py`: structlog JSON logs; middleware that assigns `request_id` (accept inbound `X-Request-ID`, else UUID), logs `{route, method, status, latency_ms, request_id, snapshot_id}`, and returns `X-Request-ID`.
- `errors.py`: RFC 7807 `application/problem+json` handlers for validation errors (422), HTTP errors (404, 503), and unhandled exceptions (500, no stack trace to client, full log with request id). Include `request_id` in the body.
- **Unknown query params are rejected with 422** (typo guard) — implement via a dependency/model with `extra="forbid"` or equivalent.
- `data/store.py`: `DataStore` loads `actuals.parquet`, `forecasts.parquet`, `manifest.json` in FastAPI `lifespan`; frames sorted as `domain` expects; exposes `snapshot_id`, coverage, manifest quality, `max_horizon_hours` (= floor of max horizon), **`reliable_horizon_hours`** (largest integer H whose by-horizon `coverage_pct ≥ 95 %` over the evaluation window, computed once at startup via `domain.metrics.by_horizon`). If files are missing/corrupt: app still starts, `/ready` → 503, data routes → 503 problem+json, loud error log.
- `services/`: orchestration only; **no business logic** that belongs in `domain/`. Add a small cache layer here (not in `domain/`): memoise per-`snapshot_id` results for selection by cutoff / by H and per-cutoff errors-by-day (`functools.lru_cache` or a tiny dict keyed by `(snapshot_id, …)`). Record the choice in **ADR-014**.
- Middleware: `Cache-Control: public, max-age=300` + `ETag` (hash of `snapshot_id` + canonical request URL) with `If-None-Match` → 304; security headers (`X-Content-Type-Options: nosniff`, `Referrer-Policy`, etc.); CORS only if `CORS_ORIGINS` set.
- JSON must **never** contain `NaN`/`Infinity` — undefined values are `null`. Add a test that scans every response.

## Step 2 — Schemas, services, routers (exactly per `docs/API.md`)

Implement **all** endpoints: `GET /health`, `/ready`, `/meta`, `/series`, `/day-ahead/calibration` (declare **before** `/day-ahead/{delivery_date}`), `/day-ahead/{delivery_date}`, `/metrics/summary`, `/metrics/by-horizon`, `/metrics/by-hour`, `/metrics/by-level`, `/metrics/distribution`, `/metrics/heatmap`, `/vintages`. (Skip `POST /admin/refresh`.) Base path `/api/v1`; docs at `/api/docs`, `/api/openapi.json`.

- Routers: parse/validate → call service → return `response_model`. **No pandas in routers.**
- Validation (each → 422 problem+json with a helpful `detail` that states the allowed range): `from < to`; range ≤ 62 days; within coverage; `horizon_hours` in `[0, meta.max_horizon_hours]`; `cutoff` is `HH:MM`; `risk_quantile` in [0.5, 0.99]; `window_days` in [3, 45]; `bins` in [3, 10]; `target` in coverage; `delivery_date` within `[2025-12-01, 2026-01-31]` else 404.
- Day-ahead response: `risk` and `firm_wind_mw` / `band_high_mw` / `expected_wind_mw` are `null` (forecast still returned) when the sample has fewer than `min_days` full days. `decision_cutoff_utc`, `forecast_published_at` per period, `forecast_age_h` min/max, `summary` totals use **MW × 1 h**. `actual_mw` always included (UI hides it behind a reveal toggle).
- `/meta`: snapshot id & ingest time, coverage, evaluation window, `resolution_minutes: 60`, `actual_resolution_minutes: 30`, `max_horizon_hours`, `reliable_horizon_hours`, quality counters from the manifest (incl. `retrocast_rows_dropped` as informational), defaults, timezone, `app_version`.
- `/metrics/by-horizon`: each point has `n`, `n_expected`, `coverage_pct` + MAE/RMSE/bias/P90.
- Update `docs/API.md` for every deviation or addition **in the same change** (don't leave code and contract disagreeing).

## Step 3 — Tests (`backend/tests/api/`, `httpx.ASGITransport`, no network)

Use a **mini fixture snapshot** (hand-built, 3–4 days, known answers; set via `SNAPSHOT_DIR`) for contract/golden tests, plus a few `@pytest.mark.snapshot` smoke tests on the real snapshot.

- Contract: every endpoint's JSON keys/types match `API.md` — golden files in `tests/fixtures/golden/`, regenerated only via `make golden` / `make.bat golden` and reviewed as a diff.
- 422 problem+json cases: bad date, `from ≥ to`, range > 62 d, outside coverage, **unknown query param**, horizon > max, bad cutoff format, bad quantile, bad window, bad bins.
- 404 for out-of-window delivery date; 503 (`/ready` and data routes) when the store is empty.
- `ETag` present; `If-None-Match` → 304; `X-Request-ID` present and echoed when supplied.
- `test_no_nan_or_infinity_in_any_response`.
- Day-ahead: `risk == null` when sample too short (use a day near warm-up start); leakage at API level (changing actuals of D−1 or later must not change `firm_wind_mw` for D — use the mini fixture, patch the store).
- Real-snapshot smoke: `/day-ahead/2026-01-15` → 24 periods, all `forecast_published_at = 2026-01-14T07:30:00Z`, age 1.5 h; `/metrics/summary?policy=lead_time&horizon_hours=24` for Jan → n=744, MAE ≈ 2050.2, bias ≈ +1854.2 (same as Phase 2 cross-check); `/meta.reliable_horizon_hours == 42`.
- Coverage `backend/app` ≥ 90 % overall; domain stays ≥ 95 %.

## Step 4 — OpenAPI export & drift guard

- `make openapi` (and `make.bat openapi`): writes `frontend/src/api/openapi.json` from the app (deterministic key order).
- Add a CI step that regenerates it and fails on `git diff --exit-code`.
- Do **not** generate TS types yet (Phase 4).

## Step 5 — Latency check

`scripts/bench_api.py` (Windows-safe, in-process ASGI client, real snapshot): median/p95 over 20 runs per endpoint, cold (first call) and warm; compare to `SYSTEM_DESIGN.md` §5 budgets; print PASS/FAIL. Fix anything that fails (caching in the service layer first; measure before optimising).

## Definition of Done (show evidence for each)

- [ ] Step 0 a–e: ADR-013 reworded, weekly check reported, coverage matrix printed with gaps filled, **mutation results table (4 mutations, failing test names)**, `risk.expected` added test-first
- [ ] All endpoints implemented per `API.md`; `docs/API.md` matches the code
- [ ] `make lint` + `make test` green; `mypy` strict clean on `domain/` and clean on `app/`; coverage numbers reported
- [ ] `openapi.json` committed; CI drift guard added
- [ ] Bench table pasted; budgets pass
- [ ] `/docs` Swagger page loads (`uvicorn` run) and one `curl` example for `/day-ahead/2026-01-15` pasted (trimmed)
- [ ] Suggested commit messages provided (not committed)

## Rules

Routers have no pandas; services have no domain logic; `domain/` stays pure and unchanged except Step 0e. Never emit NaN/Infinity. Don't add dependencies without saying why (no ORJSON/Redis/etc. unless justified). Don't start the frontend.

## When done

Reply with: (1) Step 0 results (weekly-bias finding, matrix gaps found, mutation table), (2) endpoint checklist, (3) test/coverage summary, (4) bench table, (5) any contract changes made to `API.md`, (6) surprises, (7) suggested commits. **Then stop and wait — do not start Phase 4.**
