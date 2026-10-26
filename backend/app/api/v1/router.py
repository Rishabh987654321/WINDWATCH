"""API v1 master router aggregating all domain endpoints."""

from fastapi import APIRouter

from app.api.v1 import day_ahead, meta, metrics, series, system, vintages

api_v1_router = APIRouter(prefix="/api/v1")

# System & Bootstrap
api_v1_router.include_router(system.router)
api_v1_router.include_router(meta.router)

# Data & Analytics
api_v1_router.include_router(series.router)
api_v1_router.include_router(day_ahead.router)
api_v1_router.include_router(metrics.router)
api_v1_router.include_router(vintages.router)
