"""Day-ahead forecast, risk band, and calibration endpoints."""

from datetime import UTC, date, datetime

from fastapi import APIRouter, Path, Query

from app.schemas.day_ahead import CalibrationResponse, DayAheadResponse
from app.schemas.params import (
    CalibrationQuery,
    DayAheadQuery,
    parse_date_or_datetime,
)
from app.services import analytics

router = APIRouter(tags=["Day-Ahead"])


# MUST be declared BEFORE /{delivery_date} per docs/API.md
@router.get("/day-ahead/calibration", response_model=CalibrationResponse)
async def get_calibration(
    query: CalibrationQuery = Query(),
) -> CalibrationResponse:
    """Backtest realised coverage of the risk band over delivery days."""
    start_utc = parse_date_or_datetime(query.from_, is_end=False) or datetime(
        2026, 1, 1, 0, 0, tzinfo=UTC
    )
    end_utc = parse_date_or_datetime(query.to, is_end=True) or datetime(
        2026, 2, 1, 0, 0, tzinfo=UTC
    )

    return analytics.get_calibration(
        start_utc=start_utc,
        end_utc=end_utc,
        cutoff_str=query.cutoff,
        risk_quantile=query.risk_quantile,
        window_days=query.window_days,
    )


@router.get("/day-ahead/{delivery_date}", response_model=DayAheadResponse)
async def get_day_ahead(
    delivery_date: date = Path(
        ...,
        description="Delivery date (YYYY-MM-DD) in Europe/London",
        examples=["2026-01-15"],
    ),
    query: DayAheadQuery = Query(),
) -> DayAheadResponse:
    """Headline day-ahead forecast as available at decision cutoff with quantified error risk band."""
    return analytics.get_day_ahead(
        delivery_date=delivery_date,
        cutoff_str=query.cutoff,
        risk_quantile=query.risk_quantile,
        window_days=query.window_days,
    )
