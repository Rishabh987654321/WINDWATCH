"""API-level tests for day-ahead endpoint, risk sample truncation, and leakage prevention."""

from datetime import UTC, datetime

import pytest
from httpx import AsyncClient

from app.data.store import store
from app.services import analytics


@pytest.mark.asyncio
async def test_day_ahead_sample_too_short_yields_null_risk(client: AsyncClient) -> None:
    """When fewer than min_days (7) of trailing history exist, risk is null but forecast remains."""
    # 2025-12-21 has only 1 day of prior history in mini snapshot (starts 2025-12-20)
    resp = await client.get("/api/v1/day-ahead/2025-12-21?cutoff=09:00&window_days=7")
    assert resp.status_code == 200

    data = resp.json()
    assert data["risk"] is None
    assert data["summary"]["mean_firm_wind_mw"] is None
    assert data["summary"]["mean_expected_wind_mw"] is None
    assert data["summary"]["total_firm_mwh"] is None

    # Forecasts must still be present
    assert len(data["periods"]) == 24
    for period in data["periods"]:
        assert period["forecast_mw"] is not None
        assert period["firm_wind_mw"] is None
        assert period["expected_wind_mw"] is None
        assert period["band_high_mw"] is None


@pytest.mark.asyncio
async def test_day_ahead_api_leakage_guard(client: AsyncClient) -> None:
    """Changing actuals on D-1 or D must not alter firm_wind_mw for D (leakage guard)."""
    delivery_date = "2026-01-02"
    url = f"/api/v1/day-ahead/{delivery_date}?cutoff=09:00&risk_quantile=0.9&window_days=7"

    resp1 = await client.get(url)
    assert resp1.status_code == 200
    data1 = resp1.json()
    firm_winds_1 = [p["firm_wind_mw"] for p in data1["periods"]]
    q_err_1 = data1["risk"]["over_forecast_at_q_mw"]

    # Mutate actuals on D-1 (2026-01-01) and D (2026-01-02) by adding 50,000 MW
    orig_actuals = store.actuals.copy()
    mask = store.actuals["start_time"] >= datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    store.actuals.loc[mask, "actual_mw"] += 50000.0

    # Clear service memoization caches
    analytics._get_daily_errors.cache_clear()
    analytics._get_selected_and_aligned.cache_clear()

    try:
        resp2 = await client.get(url)
        assert resp2.status_code == 200
        data2 = resp2.json()
        firm_winds_2 = [p["firm_wind_mw"] for p in data2["periods"]]
        q_err_2 = data2["risk"]["over_forecast_at_q_mw"]

        # Risk quantile and firm wind values must NOT change
        assert firm_winds_1 == firm_winds_2
        assert q_err_1 == q_err_2

    finally:
        # Restore actuals and clear cache
        store.actuals = orig_actuals
        analytics._get_daily_errors.cache_clear()
        analytics._get_selected_and_aligned.cache_clear()
