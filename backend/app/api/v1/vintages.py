"""Forecast vintages endpoint."""

from fastapi import APIRouter, Query

from app.schemas.params import VintagesQuery, parse_date_or_datetime
from app.schemas.vintages import VintagesResponse
from app.services import analytics

router = APIRouter(tags=["Vintages"])


@router.get("/vintages", response_model=VintagesResponse)
async def get_vintages(query: VintagesQuery = Query()) -> VintagesResponse:
    """Retrieve all forecasts published over time for a single target period."""
    target_utc = parse_date_or_datetime(query.target)
    assert target_utc is not None
    return analytics.get_vintages(target_utc)
