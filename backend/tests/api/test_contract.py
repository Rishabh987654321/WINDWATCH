"""Golden contract tests verifying every API endpoint output against fixtures/golden/*.json."""

import json
from pathlib import Path

import pytest
from httpx import AsyncClient

GOLDEN_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "golden"

GOLDEN_ENDPOINTS: dict[str, str] = {
    "health.json": "/api/v1/health",
    "ready.json": "/api/v1/ready",
    "meta.json": "/api/v1/meta",
    "series_lead_time.json": "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=lead_time&horizon_hours=12",
    "series_day_ahead.json": "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=day_ahead&cutoff=09:00",
    "day_ahead_valid.json": "/api/v1/day-ahead/2026-01-02?cutoff=09:00&risk_quantile=0.9&window_days=7",
    "day_ahead_no_risk.json": "/api/v1/day-ahead/2025-12-21?cutoff=09:00&risk_quantile=0.9&window_days=7",
    "calibration.json": "/api/v1/day-ahead/calibration?from=2026-01-01&to=2026-01-03&cutoff=09:00&risk_quantile=0.9&window_days=7",
    "metrics_summary.json": "/api/v1/metrics/summary?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "metrics_by_horizon.json": "/api/v1/metrics/by-horizon?from=2026-01-01&to=2026-01-03&step_hours=6&max_hours=24",
    "metrics_by_hour.json": "/api/v1/metrics/by-hour?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "metrics_by_level.json": "/api/v1/metrics/by-level?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00&bins=4",
    "metrics_distribution.json": "/api/v1/metrics/distribution?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00&bin_width_mw=500",
    "metrics_heatmap.json": "/api/v1/metrics/heatmap?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "vintages.json": "/api/v1/vintages?target=2026-01-02T12:00:00Z",
}


@pytest.mark.asyncio
@pytest.mark.parametrize("filename,url", list(GOLDEN_ENDPOINTS.items()))
async def test_endpoint_matches_golden_contract(
    client: AsyncClient, filename: str, url: str
) -> None:
    """Verify endpoint JSON response precisely matches the approved golden file."""
    golden_path = GOLDEN_DIR / filename
    assert golden_path.exists(), f"Golden file missing: {golden_path}"

    with open(golden_path, encoding="utf-8") as f:
        expected = json.load(f)

    response = await client.get(url)
    assert response.status_code == 200, f"Failed GET {url}: {response.text}"

    actual = response.json()
    assert actual == expected, f"Contract drift detected in {filename} for {url}"
