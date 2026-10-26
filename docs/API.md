# API.md — REST API Contract (v1)

Base path: `/api/v1`. JSON only. Backend: FastAPI (async). OpenAPI auto-served at `/api/docs` (Swagger) and `/api/openapi.json`. **This file is the contract; Pydantic schemas must match it and the frontend types are generated from `openapi.json`** (`openapi-typescript`).

## Conventions
- **Timestamps**: ISO-8601 UTC with `Z`. **Dates**: `YYYY-MM-DD` (London local delivery day).
- **Units**: all power in **MW** (field suffix `_mw`), horizons in **hours** (`_h`), percentages as numbers 0–100 (`_pct`).
- **Sign**: `error_mw = forecast_mw − actual_mw` (positive = over-forecast).
- **Nulls**: missing values are `null`, never `0` or `NaN`.
- **Errors**: RFC 7807 `application/problem+json`:
  ```json
  {"type":"https://windwatch/errors/validation","title":"Invalid parameter","status":422,
   "detail":"horizon_hours must be between 0 and 48","instance":"/api/v1/series","request_id":"b1c2..."}
  ```
  Every response carries `X-Request-ID`.
- **Caching**: data is a frozen snapshot → `Cache-Control: public, max-age=300` + `ETag` (hash of snapshot manifest + query). Honour `If-None-Match` → 304.
- **Range limits**: `to − from ≤ 62 days`, and both must lie within `/meta.coverage`. Otherwise 422.
- **Naming**: snake_case JSON. Idempotent GETs only (plus one admin POST).

## Shared parameter types
| Param | Type | Default | Rules |
|---|---|---|---|
| `from`, `to` | `date` or `datetime` (UTC) | meta default range (Jan 2026) | `from < to`; if `date`, covers whole London days; `to` inclusive for dates |
| `policy` | `lead_time` \| `day_ahead` | `lead_time` | selection policy (see DOMAIN §4.2) |
| `horizon_hours` | int/float ≥ 0 | `0` | only for `lead_time`; ≤ `meta.max_horizon_hours` |
| `cutoff` | `HH:MM` London | `meta.default_cutoff_local` | only for `day_ahead` |

---

## `GET /health`
Liveness. `200 {"status":"ok"}` — no data access.

## `GET /ready`
Readiness: `200` once the snapshot is loaded, else `503`.

## `GET /meta`
Everything the UI needs to bootstrap. Called once at app start.
```json
{
  "app_version": "0.1.0",
  "data": {
    "snapshot_id": "sha256:ab12…",
    "ingested_at": "2026-10-25T10:00:00Z",
    "sources": ["FUELHH", "WINDFOR"],
    "coverage": {
      "actuals":   {"from": "2025-12-01T00:00:00Z", "to": "2026-01-31T23:30:00Z"},
      "forecasts": {"from": "...", "to": "..."}
    },
    "evaluation_window": {"from": "2026-01-01", "to": "2026-01-31"},
    "max_horizon_hours": 66,
    "reliable_horizon_hours": 44,
    "resolution_minutes": 60,
    "actual_resolution_minutes": 30,
    "quality": {"dropped_negative": 0, "retrocast_rows_dropped": 360, "duplicates_removed": 0, "missing_actual_periods": 0, "missing_forecast_periods": 0}
  },
  "defaults": {"policy": "day_ahead", "cutoff_local": "09:00", "risk_quantile": 0.9, "window_days": 28},
  "timezone": "Europe/London"
}
```

## `GET /series`
Actual vs selected forecast, hourly.
Query: `from`, `to`, `policy`, `horizon_hours` | `cutoff`.
```json
{
  "query": {"from":"2026-01-10T00:00:00Z","to":"2026-01-12T00:00:00Z","policy":"lead_time","horizon_hours":6},
  "points": [
    {"ts":"2026-01-10T00:00:00Z","actual_mw":8123.0,"forecast_mw":7890.5,
     "forecast_published_at":"2026-01-09T18:00:00Z","horizon_h":6.0,"error_mw":-232.5}
  ],
  "coverage": {"n_expected":48,"n_matched":48,"n_missing_actual":0,"n_missing_forecast":0}
}
```
Perf: ≤ 62 days × 24 = ~1500 points; response must be < 150 ms warm.

## `GET /day-ahead/{delivery_date}`  ← headline endpoint
What the buyer sees on D-1 for delivery day `{delivery_date}`.
Query: `cutoff` (HH:MM), `risk_quantile` (0.5–0.99, default 0.9), `window_days` (3–45, default 28).
```json
{
  "delivery_date":"2026-01-15",
  "decision_cutoff_utc":"2026-01-14T09:00:00Z",
  "cutoff_local":"09:00",
  "risk": {"quantile":0.9,"window_days":28,"error_sample_size":672,
           "error_sample_range":{"from":"2025-12-17","to":"2026-01-13"},
           "over_forecast_at_q_mw":2150.0},
  "periods":[
    {"ts":"2026-01-15T00:00:00Z","forecast_mw":9100.0,"forecast_published_at":"2026-01-14T08:00:00Z",
     "firm_wind_mw":6950.0,"expected_wind_mw":7250.0,"band_high_mw":10800.0,"actual_mw":8700.0}
  ],
  "summary": {"mean_forecast_mw":9100.0,"mean_firm_wind_mw":6950.0,"mean_expected_wind_mw":7250.0,"total_forecast_mwh":218400.0,
              "total_firm_mwh":166800.0,"forecast_age_h": {"min":1.0,"max":3.5}},
  "day_accuracy": {"mae_mw":412.0,"bias_mw":-120.0,"rmse_mw":520.0,"n":24},
  "coverage":{"n_expected":24,"n_matched":24,"n_missing_actual":0,"n_missing_forecast":0}
}
```
- `actual_mw` is included so users can see hindsight; UI must visually separate "known at decision time" vs "revealed later".
- MWh = Σ MW × 1 h.
- The error sample uses delivery days **≤ D−2** only (D−1 is incomplete at the cutoff). Never uses data from D−1 or later (**leakage test**). If fewer than `min_days` full days are available, `risk` is `null` and `firm_wind_mw`/`band_high_mw` are `null` (forecast is still returned).
- 404 if `delivery_date` outside evaluation window ± warm-up; 422 on bad params.

## `GET /day-ahead/calibration`
> Implementation note: declare this route **before** `/day-ahead/{delivery_date}` (or type the path param as `date`) so `calibration` isn't parsed as a date.

Backtest of the risk band across a range of delivery days.
Query: `from`, `to` (dates), `cutoff`, `risk_quantile`, `window_days`.
```json
{
  "risk_quantile":0.9,
  "realised_coverage_pct":87.3,
  "days":[{"delivery_date":"2026-01-01","coverage_pct":91.7,"n":24,"mean_firm_wind_mw":6100.0}]
}
```
`coverage_pct` = % of periods with `actual_mw ≥ firm_wind_mw`.

## `GET /metrics/summary`
Query: `from`, `to`, `policy`, `horizon_hours` | `cutoff`.
```json
{
  "n":744,"bias_mw":-85.2,"mae_mw":610.4,"rmse_mw":880.1,"median_abs_error_mw":420.0,
  "p90_abs_error_mw":1350.0,"p95_abs_error_mw":1700.0,"nmae_pct":8.7,
  "over_forecast_rate":0.46,
  "max_over_forecast":{"mw":3200.0,"ts":"2026-01-18T14:00:00Z"},
  "max_under_forecast":{"mw":-3900.0,"ts":"2026-01-09T03:30:00Z"},
  "corr":0.96,
  "coverage":{"n_expected":744,"n_matched":740,"n_missing_actual":0,"n_missing_forecast":4}
}
```

## `GET /metrics/by-horizon`
Policy is implicitly `lead_time`; evaluated for each H.
Query: `from`, `to`, `step_hours` (default 1), `max_hours` (default `meta.max_horizon_hours`).
```json
{"points":[{"horizon_hours":0,"n":744,"n_expected":744,"coverage_pct":100.0,"mae_mw":210.0,"rmse_mw":300.0,"bias_mw":-5.0,"p90_abs_error_mw":480.0}]}
```
Implementation note: must not recompute O(H) full group-bys naively — use the precomputed horizon-sorted structure (SYSTEM_DESIGN §5). Target < 400 ms for 0–66 h over a month.

## `GET /metrics/by-hour`
Query: `from`, `to`, `policy`, `horizon_hours` | `cutoff`.
`{"points":[{"hour_local":0,"n":31,"mae_mw":..,"bias_mw":..}, … 24 items]}`

## `GET /metrics/by-level`
Query: same + `bins` (default 5, 3–10). Binned by **forecast** value, equal-count.
`{"basis":"forecast","points":[{"bin":1,"level_from_mw":0,"level_to_mw":2100,"n":297,"mae_mw":..,"bias_mw":..}]}`

## `GET /metrics/distribution`
Query: same + `bin_width_mw` (default 250).
`{"bin_width_mw":250,"bins":[{"from_mw":-4000,"to_mw":-3750,"count":3}],"quantiles":{"p05":-1200,"p25":-400,"p50":-60,"p75":300,"p95":1400}}`

## `GET /metrics/heatmap`
Query: same. Day × local-hour mean absolute error.
`{"days":["2026-01-01",…],"hours":[0..23],"values":[[mae_or_null × 24] × n_days]}`

## `GET /vintages`
All forecasts published for **one** target period.
Query: `target` (UTC datetime, required).
```json
{"target":"2026-01-15T12:00:00Z","actual_mw":8700.0,
 "forecasts":[{"published_at":"2026-01-13T09:00:00Z","horizon_h":51.0,"forecast_mw":8200.0}]}
```

## `POST /admin/refresh` *(optional, disabled unless `ADMIN_TOKEN` set)*
Header `Authorization: Bearer <token>`. Triggers ingestion for a date range in a background task; returns `202 {"job_id": "..."}`. Not required for submission — the CLI is the supported path.

---

## Status codes
`200` ok · `304` not modified · `404` unknown delivery date / no data · `422` validation (FastAPI default replaced with problem+json) · `429` (if rate-limited) · `500` unhandled (problem+json, log with request id) · `503` not ready.

## Backward-compat rules ("an API that ages well")
- Additive changes only within `v1` (new optional params, new fields). Never repurpose a field.
- Units live in field names. New units → new fields.
- Query params are validated by Pydantic models (`Annotated[..., Query()]`) with explicit bounds; unknown params are **rejected** (422) to catch typos.
- All list endpoints return an object (`{"points":[...]}`), never a bare array, so metadata can be added later.
- Response models are explicit (`response_model=`) — no leaking internal DataFrames.
