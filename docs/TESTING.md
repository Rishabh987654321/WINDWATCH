# TESTING.md — Rigour Plan

The JD says: *"You write tests, review carefully, and think about edge cases before production finds them."* This repo should **show** that. Tests are a deliverable, and the tech-lead video walks through them.

## 1. Pyramid
| Level | Tool | What | Share |
|---|---|---|---|
| Unit (domain) | pytest, hypothesis | selection, metrics, risk, time utils, normalisation | ~70 % of backend tests |
| Component (service/store) | pytest | DataStore load, services on fixture snapshot | ~10 % |
| API contract | pytest + httpx ASGITransport | every endpoint: shape, bounds, errors, ETag | ~20 % |
| Frontend unit | Vitest | store/url-sync, formatters, chart `buildOption` fns | |
| Frontend component | Testing Library | primitives, states (loading/empty/error), slider | |
| E2E smoke | Playwright | 3 journeys (below) | few, stable |

## 2. Must-have backend tests (name tests after the rule they prove)
**Selection**
- `test_lead_time_picks_latest_publish_at_least_H_hours_before`
- `test_lead_time_never_returns_forecast_published_within_H_hours` (property)
- `test_day_ahead_never_uses_publish_after_cutoff` (property; the **leakage** test)
- `test_day_ahead_missing_when_no_forecast_before_cutoff` (no backfill from later forecast)
- `test_day_ahead_cutoff_uses_london_time_on_dst_day` (2026-03-29 & 2026-10-25 samples)
- `test_selection_is_one_row_per_target`
**Metrics** (hand-computed fixtures; put the arithmetic in comments)
- sign convention (`forecast − actual`), MAE/RMSE/bias on 4-point example, P90 on known array
- empty input → `n=0` and `None` metrics, not exceptions/NaN in JSON
- zero actuals do not break nMAE (mean actual = 0 → `None`)
- non-finite values excluded and counted
**Risk**
- `test_error_sample_excludes_D_minus_1_and_later` (look-ahead guard)
- `test_error_sample_truncates_at_data_start_and_requires_min_days`
- `test_firm_wind_is_clipped_at_zero`
- `test_band_ordering_low_le_forecast_le_high` (property: for q>0.5 and monotone quantiles)
- calibration on synthetic data with known error distribution lands within tolerance of q
**Ingestion**
- retry on 503/429 with `Retry-After`; fail after max retries; no partial snapshot written
- chunk planner covers range exactly, no gaps/overlaps
- dedupe `(start_time, publish_time)`; negative generation dropped & counted; negative horizon dropped & counted
- manifest SHA-256 matches files; CI guard fails if snapshot edited without manifest update
**API**
- every endpoint returns documented fields (golden JSON in `tests/fixtures/golden/`, regenerated only by explicit `make golden` + reviewed diff)
- 422 problem+json for: bad dates, `from ≥ to`, range > 62 d, outside coverage, unknown query param, horizon out of bounds, bad cutoff format
- `ETag`/304 behaviour; `X-Request-ID` present; `/ready` 503 when store empty
- nulls are `null` (no `NaN`/`Infinity` in JSON — enforce with a custom JSON encoder test)

## 3. Frontend tests
- `url-state`: store ⇄ URL round-trip, invalid params fall back to defaults, clamping to coverage.
- `buildOption` pure functions: series count, colours from tokens, reveal-toggle hides actuals series, band computed correctly.
- Primitives: Button press state classes, Slider keyboard, Segmented a11y roles.
- States: each data card renders skeleton → data, error + retry, empty message (MSW mock handlers).
- **E2E journeys (Playwright, run against docker compose or dev servers):**
  1. Overview loads → KPIs visible → drag horizon slider → MAE changes.
  2. `/day-ahead?d=2026-01-15` → "Forecast as of" text shown → toggle REVEAL ACTUALS → actuals series present → change quantile → firm wind total changes.
  3. `/accuracy` → by-horizon chart visible → click a point → global horizon updates.

## 4. Quality gates (CI blocks merge)
- `ruff check`, `ruff format --check`, `mypy backend/app` (strict on `domain/`)
- `pytest --cov=backend/app --cov-fail-under=90` (domain ≥ 95 %)
- `eslint`, `tsc --noEmit`, `vitest run`, `vite build`, bundle-size check
- `docker build` both images; `docker compose config` valid
- Snapshot checksum guard; OpenAPI drift guard (regenerate `openapi.json` and `git diff --exit-code`)

## 5. Review checklist (use on every PR — and mention it in the video)
- [ ] Any new time handling is UTC-internal, London for day boundaries?
- [ ] Could this use information not available at decision time? (**leakage**)
- [ ] Edge cases: empty, 1 point, all-NaN, DST, range at coverage edges?
- [ ] Contract change reflected in `API.md` and `openapi.json`?
- [ ] Units/sign convention visible in names and UI labels?
- [ ] Logging includes request id; no PII/secrets (none exist, but keep the habit)?
- [ ] Loading/empty/error states present for every new UI data surface?
- [ ] Tests named after the rule they prove?

## 6. Test data
- `backend/tests/fixtures/mini/`: hand-built 2-day dataset with 3–4 vintages per target and known answers.
- `backend/tests/fixtures/elexon_raw/`: trimmed raw Elexon JSON captured by the probe (for normalisation tests).
- Real snapshot is used only in smoke/benchmark tests, never for unit assertions of exact numbers.
