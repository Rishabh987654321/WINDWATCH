"""System endpoints: health and readiness checks."""

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, ConfigDict

from app.data.store import store
from app.schemas.params import NoQueryParams

router = APIRouter(tags=["System"])


class HealthResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str


class ReadyResponse(BaseModel):
    model_config = ConfigDict(extra="forbid")
    status: str
    snapshot_id: str


@router.get("/health", response_model=HealthResponse)
async def health_check(_: NoQueryParams = Query()) -> HealthResponse:
    """Liveness probe: returns 200 without requiring snapshot loading."""
    return HealthResponse(status="ok")


@router.get("/ready", response_model=ReadyResponse)
async def readiness_check(_: NoQueryParams = Query()) -> ReadyResponse:
    """Readiness probe: returns 200 if snapshot is ready, else 503 problem+json."""
    if not store.is_ready:
        raise HTTPException(
            status_code=503,
            detail=f"Service not ready: snapshot not loaded ({store.load_error or 'initializing'})",
        )
    return ReadyResponse(status="ready", snapshot_id=store.snapshot_id)
