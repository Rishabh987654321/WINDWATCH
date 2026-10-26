"""Smoke tests on the real January 2026 snapshot dataset.

Tagged with @pytest.mark.snapshot.
"""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from app.main import app


@pytest.fixture
async def real_client(real_store: None) -> AsyncIterator[AsyncClient]:
    """AsyncClient initialized against the full production snapshot."""
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac


@pytest.mark.snapshot
@pytest.mark.asyncio
async def test_real_day_ahead_smoke(real_client: AsyncClient) -> None:
    """Verify headline day-ahead endpoint for 2026-01-15 matches expected empirical values."""
    resp = await real_client.get("/api/v1/day-ahead/2026-01-15?cutoff=09:00")
    assert resp.status_code == 200

    data = resp.json()
    assert data["delivery_date"] == "2026-01-15"
    assert data["decision_cutoff_utc"] == "2026-01-14T09:00:00Z"

    # Exactly 24 periods
    periods = data["periods"]
    assert len(periods) == 24

    # All forecasts published at 07:30:00Z on 2026-01-14
    expected_pub = "2026-01-14T07:30:00Z"
    for p in periods:
        assert p["forecast_published_at"] == expected_pub

    # Age must be exactly 1.5 hours
    age_h = data["summary"]["forecast_age_h"]
    assert age_h["min"] == 1.5
    assert age_h["max"] == 1.5


@pytest.mark.snapshot
@pytest.mark.asyncio
async def test_real_summary_reproduces_phase2_numbers(real_client: AsyncClient) -> None:
    """Verify /metrics/summary?policy=lead_time&horizon_hours=24 reproduces Phase 2 sanity check."""
    resp = await real_client.get(
        "/api/v1/metrics/summary?from=2026-01-01&to=2026-01-31&policy=lead_time&horizon_hours=24"
    )
    assert resp.status_code == 200

    data = resp.json()
    assert data["n"] == 744
    assert round(data["mae_mw"], 1) == 2050.2
    assert round(data["bias_mw"], 1) == 1854.2


@pytest.mark.snapshot
@pytest.mark.asyncio
async def test_real_meta_reliable_horizon(real_client: AsyncClient) -> None:
    """Verify /meta reports reliable_horizon_hours >= 42 and max_horizon_hours == 66."""
    resp = await real_client.get("/api/v1/meta")
    assert resp.status_code == 200

    meta = resp.json()
    assert meta["data"]["max_horizon_hours"] == 66
    assert meta["data"]["reliable_horizon_hours"] == 44
