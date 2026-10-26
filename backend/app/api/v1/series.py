"""Time series endpoint for actual vs selected forecast."""

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.schemas.params import StandardFilterQuery, parse_date_or_datetime
from app.schemas.series import SeriesResponse
from app.services import analytics

router = APIRouter(tags=["Series"])


@router.get("/series", response_model=SeriesResponse)
async def get_series(query: StandardFilterQuery = Query()) -> SeriesResponse:
    """Retrieve hourly actual and selected forecast series for the requested date window."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_series(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
    )
