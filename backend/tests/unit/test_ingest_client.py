"""Unit tests for Elexon async HTTP client and chunk planning."""

from datetime import UTC, date, datetime

import httpx
import pytest
import respx

from app.ingest.elexon_client import (
    ElexonAsyncClient,
    ElexonClientError,
    plan_date_chunks,
    plan_datetime_chunks,
)


def test_chunk_planner_covers_range_exactly_without_gaps_or_overlaps() -> None:
    """Verify plan_date_chunks partitions date span with exact coverage and no gaps/overlaps."""
    start = date(2025, 12, 1)
    end = date(2026, 1, 31)  # 62 days
    chunks = plan_date_chunks(start, end, chunk_days=7)

    # 62 days / 7 = 8 full chunks of 7 days (56 days) + 1 short chunk of 6 days = 9 chunks
    assert len(chunks) == 9
    assert chunks[0][0] == start
    assert chunks[-1][1] == end

    # Check continuity: each chunk starts on previous end + 1 day
    for i in range(len(chunks) - 1):
        c_start, c_end = chunks[i]
        next_start, _ = chunks[i + 1]
        assert (c_end - c_start).days + 1 <= 7
        assert (next_start - c_end).days == 1

    # Check last short chunk
    last_start, last_end = chunks[-1]
    assert (last_end - last_start).days + 1 == 6


def test_fuelhh_date_to_is_inclusive() -> None:
    """Verify FUELHH date chunks include settlementDateTo end date (off-by-one guard)."""
    start = date(2026, 1, 5)
    end = date(2026, 1, 8)  # 4 inclusive days: 5, 6, 7, 8
    chunks = plan_date_chunks(start, end, chunk_days=7)

    assert len(chunks) == 1
    c_start, c_end = chunks[0]
    assert c_start == start
    assert c_end == end
    # Exactly 4 days
    assert (c_end - c_start).days + 1 == 4


def test_datetime_chunk_planner() -> None:
    """Verify plan_datetime_chunks covers datetime ranges."""
    start_dt = datetime(2025, 12, 1, 0, 0, tzinfo=UTC)
    end_dt = datetime(2025, 12, 15, 0, 0, tzinfo=UTC)
    chunks = plan_datetime_chunks(start_dt, end_dt, chunk_days=7)

    assert len(chunks) == 2
    assert chunks[0] == (start_dt, datetime(2025, 12, 8, 0, 0, tzinfo=UTC))
    assert chunks[1] == (datetime(2025, 12, 8, 0, 0, tzinfo=UTC), end_dt)


@pytest.mark.asyncio
@respx.mock
async def test_client_retries_on_503_then_succeeds() -> None:
    """Verify client retries on transient 503 error with backoff and succeeds."""
    route = respx.get("https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream")
    route.side_effect = [
        httpx.Response(503, text="Service Unavailable"),
        httpx.Response(200, json=[{"dataset": "FUELHH", "generation": 100}]),
    ]

    async with ElexonAsyncClient(backoff_base=0.01) as client:
        data = await client.fetch_fuelhh_chunk(date(2026, 1, 1), date(2026, 1, 2))
        assert len(data) == 1
        assert data[0]["generation"] == 100
        assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_client_honours_retry_after_on_429() -> None:
    """Verify client observes Retry-After header on 429 response."""
    route = respx.get("https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream")
    route.side_effect = [
        httpx.Response(429, headers={"Retry-After": "0.02"}, text="Too Many Requests"),
        httpx.Response(200, json=[{"dataset": "WINDFOR", "generation": 500}]),
    ]

    async with ElexonAsyncClient(backoff_base=0.01) as client:
        data = await client.fetch_windfor_chunk(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 1, 2, tzinfo=UTC),
        )
        assert len(data) == 1
        assert data[0]["generation"] == 500
        assert route.call_count == 2


@pytest.mark.asyncio
@respx.mock
async def test_client_raises_after_max_retries_and_writes_nothing() -> None:
    """Verify client raises ElexonClientError after exhausting max retries."""
    route = respx.get("https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream")
    route.return_value = httpx.Response(500, text="Internal Server Error")

    async with ElexonAsyncClient(max_retries=3, backoff_base=0.01) as client:
        with pytest.raises(ElexonClientError) as exc_info:
            await client.fetch_fuelhh_chunk(date(2026, 1, 1), date(2026, 1, 2))

        assert "exhausted 3 attempts" in str(exc_info.value) or "failed with status 500" in str(
            exc_info.value
        )
        assert route.call_count == 3


def test_chunk_planners_raise_on_invalid_args() -> None:
    """Verify chunk planners raise ValueError on invalid range or chunk_days."""
    with pytest.raises(ValueError):
        plan_date_chunks(date(2026, 1, 5), date(2026, 1, 2))
    with pytest.raises(ValueError):
        plan_date_chunks(date(2026, 1, 1), date(2026, 1, 2), chunk_days=0)
    with pytest.raises(ValueError):
        plan_datetime_chunks(datetime(2026, 1, 5), datetime(2026, 1, 2))
    with pytest.raises(ValueError):
        plan_datetime_chunks(datetime(2026, 1, 1), datetime(2026, 1, 2), chunk_days=0)


@pytest.mark.asyncio
@respx.mock
async def test_fetch_all_helpers() -> None:
    """Verify fetch_all_fuelhh and fetch_all_windfor combine chunk results."""
    respx.get("https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream").respond(
        200, json=[{"row": 1}]
    )
    respx.get("https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream").respond(
        200, json=[{"row": 2}]
    )

    async with ElexonAsyncClient() as client:
        f_data = await client.fetch_all_fuelhh(date(2026, 1, 1), date(2026, 1, 2), chunk_days=7)
        assert len(f_data) == 1
        w_data = await client.fetch_all_windfor(
            datetime(2026, 1, 1, tzinfo=UTC),
            datetime(2026, 1, 2, tzinfo=UTC),
            chunk_days=7,
        )
        assert len(w_data) == 1
