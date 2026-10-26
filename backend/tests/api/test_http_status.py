"""Tests for HTTP status codes: 404, 503, ETag 304, X-Request-ID, and Security headers."""

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
async def test_404_for_out_of_window_delivery_date(client: AsyncClient) -> None:
    """Verify 404 problem+json when delivery_date is outside the snapshot dataset."""
    response = await client.get("/api/v1/day-ahead/2024-01-01")
    assert response.status_code == 404
    assert "application/problem+json" in response.headers.get("content-type", "")
    assert "outside" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_503_when_store_not_ready(uninitialized_client: AsyncClient) -> None:
    """Verify /ready and data endpoints return 503 problem+json when snapshot is not loaded."""
    # Health remains 200 (liveness)
    r_health = await uninitialized_client.get("/api/v1/health")
    assert r_health.status_code == 200

    # Ready returns 503
    r_ready = await uninitialized_client.get("/api/v1/ready")
    assert r_ready.status_code == 503
    assert "application/problem+json" in r_ready.headers.get("content-type", "")

    # Data route returns 503
    r_meta = await uninitialized_client.get("/api/v1/meta")
    assert r_meta.status_code == 503
    assert "application/problem+json" in r_meta.headers.get("content-type", "")


@pytest.mark.asyncio
async def test_etag_and_304_handling(client: AsyncClient) -> None:
    """Verify successful GET data endpoints include ETag and return 304 on If-None-Match."""
    # First request
    resp1 = await client.get(
        "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=lead_time&horizon_hours=12"
    )
    assert resp1.status_code == 200
    etag = resp1.headers.get("ETag")
    assert etag is not None
    assert resp1.headers.get("Cache-Control") == "public, max-age=300"

    # Second request with If-None-Match
    resp2 = await client.get(
        "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=lead_time&horizon_hours=12",
        headers={"If-None-Match": etag},
    )
    assert resp2.status_code == 304
    assert resp2.headers.get("ETag") == etag


@pytest.mark.asyncio
async def test_request_id_assigned_and_echoed(client: AsyncClient) -> None:
    """Verify X-Request-ID is generated if omitted and preserved when supplied by caller."""
    # Generated
    resp1 = await client.get("/api/v1/health")
    assert "X-Request-ID" in resp1.headers
    assert len(resp1.headers["X-Request-ID"]) > 0

    # Echoed
    custom_id = "test-custom-request-id-42"
    resp2 = await client.get("/api/v1/health", headers={"X-Request-ID": custom_id})
    assert resp2.headers.get("X-Request-ID") == custom_id


@pytest.mark.asyncio
async def test_security_headers_present(client: AsyncClient) -> None:
    """Verify standard security headers are applied to responses."""
    resp = await client.get("/api/v1/health")
    assert resp.headers.get("X-Content-Type-Options") == "nosniff"
    assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert resp.headers.get("X-Frame-Options") == "DENY"
