"""Tests for 422 Unprocessable Entity RFC 7807 problem+json validation."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_problem_json_structure(client: AsyncClient) -> None:
    """Verify 422 response returns application/problem+json with RFC 7807 required fields."""
    response = await client.get("/api/v1/day-ahead/2026-01-15?cutoff=invalid")
    assert response.status_code == 422
    assert "application/problem+json" in response.headers.get("content-type", "")

    body = response.json()
    assert body["status"] == 422
    assert "cutoff" in body["detail"]
    assert body["title"] == "Invalid parameter"
    assert "instance" in body
    assert "request_id" in body
    assert "X-Request-ID" in response.headers


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "url,expected_in_detail",
    [
        # Bad date format
        ("/api/v1/series?from=not-a-date&to=2026-01-05", "Invalid"),
        # from >= to
        ("/api/v1/series?from=2026-01-05&to=2026-01-01", "earlier than"),
        ("/api/v1/series?from=2026-01-02T12:00:00Z&to=2026-01-02T12:00:00Z", "earlier than"),
        # Range > 62 days
        ("/api/v1/series?from=2025-12-01&to=2026-02-15", "62-day limit"),
        # Outside coverage
        ("/api/v1/series?from=2025-10-01&to=2025-10-15", "outside available snapshot coverage"),
        # Unknown query parameter (typo guard extra="forbid")
        (
            "/api/v1/series?from=2026-01-01&to=2026-01-02&unknown_param=foo",
            "Extra inputs are not permitted",
        ),
        ("/api/v1/meta?unexpected_flag=1", "Extra inputs are not permitted"),
        ("/api/v1/day-ahead/2026-01-02?bad_arg=99", "Extra inputs are not permitted"),
        # Horizon out of bounds
        ("/api/v1/series?policy=lead_time&horizon_hours=100", "between 0 and 66.5"),
        ("/api/v1/series?policy=lead_time&horizon_hours=-5", "greater than or equal to 0"),
        # Bad cutoff format
        ("/api/v1/day-ahead/2026-01-02?cutoff=25:00", "HH:MM format"),
        ("/api/v1/day-ahead/2026-01-02?cutoff=9am", "HH:MM format"),
        # Bad risk quantile (< 0.5 or > 0.99)
        ("/api/v1/day-ahead/2026-01-02?risk_quantile=0.4", "greater than or equal to 0.5"),
        ("/api/v1/day-ahead/2026-01-02?risk_quantile=1.0", "less than or equal to 0.99"),
        # Bad window days (< 3 or > 45)
        ("/api/v1/day-ahead/2026-01-02?window_days=2", "greater than or equal to 3"),
        ("/api/v1/day-ahead/2026-01-02?window_days=50", "less than or equal to 45"),
        # Bad bins (< 3 or > 10)
        ("/api/v1/metrics/by-level?bins=2", "greater than or equal to 3"),
        ("/api/v1/metrics/by-level?bins=15", "less than or equal to 10"),
        # Bad target timestamp for vintages
        ("/api/v1/vintages?target=not-a-timestamp", "Expected YYYY-MM-DD or ISO-8601"),
        ("/api/v1/vintages?target=2025-01-01T00:00:00Z", "outside snapshot coverage"),
    ],
)
async def test_validation_errors(client: AsyncClient, url: str, expected_in_detail: str) -> None:
    """Verify invalid queries are rejected with 422 problem+json stating allowed constraints."""
    response = await client.get(url)
    assert response.status_code == 422, (
        f"Expected 422 for {url}, got {response.status_code}: {response.text}"
    )
    assert "application/problem+json" in response.headers.get("content-type", "")
    assert expected_in_detail.lower() in response.json()["detail"].lower()
