"""Schema definitions for /api/v1/series endpoint."""

from pydantic import Field

from app.schemas.common import CoverageStats, SchemaBase


class SeriesQueryEcho(SchemaBase):
    from_: str = Field(alias="from")
    to: str
    policy: str
    horizon_hours: float | None = None
    cutoff: str | None = None


class SeriesPoint(SchemaBase):
    ts: str
    actual_mw: float | None
    forecast_mw: float | None
    forecast_published_at: str | None
    horizon_h: float | None
    error_mw: float | None


class SeriesResponse(SchemaBase):
    """Response returned by GET /api/v1/series."""

    query: SeriesQueryEcho
    points: list[SeriesPoint]
    coverage: CoverageStats
