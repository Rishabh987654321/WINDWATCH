"""Accuracy Lab evaluation and error metrics endpoints."""

from datetime import UTC, datetime

from fastapi import APIRouter, Query

from app.schemas.metrics import (
    ByHorizonResponse,
    ByHourResponse,
    ByLevelResponse,
    DistributionResponse,
    HeatmapResponse,
    SummaryResponse,
)
from app.schemas.params import (
    ByHorizonQuery,
    ByLevelQuery,
    DistributionQuery,
    StandardFilterQuery,
    parse_date_or_datetime,
)
from app.services import analytics

router = APIRouter(prefix="/metrics", tags=["Accuracy Lab"])


@router.get("/summary", response_model=SummaryResponse)
async def get_summary(query: StandardFilterQuery = Query()) -> SummaryResponse:
    """Headline accuracy and bias metrics over an aligned evaluation window."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_summary(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
    )


@router.get("/by-horizon", response_model=ByHorizonResponse)
async def get_by_horizon(query: ByHorizonQuery = Query()) -> ByHorizonResponse:
    """Evaluate forecast accuracy and target coverage across lead-time horizons."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_by_horizon(
        start_utc=start_utc,
        end_utc=end_utc,
        step=query.step_hours,
        max_hours=query.max_hours,
    )


@router.get("/by-hour", response_model=ByHourResponse)
async def get_by_hour(query: StandardFilterQuery = Query()) -> ByHourResponse:
    """Forecast accuracy broken down by local hour of the day (0..23)."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_by_hour(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
    )


@router.get("/by-level", response_model=ByLevelResponse)
async def get_by_level(query: ByLevelQuery = Query()) -> ByLevelResponse:
    """Forecast accuracy broken down by generation level bins."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_by_level(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
        bins=query.bins,
    )


@router.get("/distribution", response_model=DistributionResponse)
async def get_distribution(query: DistributionQuery = Query()) -> DistributionResponse:
    """Forecast error histogram bins and empirical quantiles."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_distribution(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
        bin_width_mw=query.bin_width_mw,
    )


@router.get("/heatmap", response_model=HeatmapResponse)
async def get_heatmap(query: StandardFilterQuery = Query()) -> HeatmapResponse:
    """Delivery date x local hour grid of mean absolute error (MAE)."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_heatmap(
        start_utc=start_utc,
        end_utc=end_utc,
        policy=query.policy,
        horizon_hours=query.horizon_hours,
        cutoff=query.cutoff,
    )
