"""Bootstrap metadata endpoint."""

from fastapi import APIRouter, Query

from app.schemas.meta import MetaResponse
from app.schemas.params import NoQueryParams
from app.services import analytics

router = APIRouter(tags=["Metadata"])


@router.get("/meta", response_model=MetaResponse)
async def get_meta(_: NoQueryParams = Query()) -> MetaResponse:
    """Bootstrap metadata with coverage, horizon limits, and defaults."""
    return analytics.get_meta()
