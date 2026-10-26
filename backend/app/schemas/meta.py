"""Schema definitions for /api/v1/meta endpoint."""

from typing import Any

from app.schemas.common import SchemaBase, TimeRange


class MetaCoverage(SchemaBase):
    actuals: TimeRange
    forecasts: TimeRange


class MetaData(SchemaBase):
    snapshot_id: str
    ingested_at: str
    sources: list[str]
    coverage: MetaCoverage
    evaluation_window: TimeRange
    max_horizon_hours: int
    reliable_horizon_hours: int
    resolution_minutes: int
    actual_resolution_minutes: int
    quality: dict[str, Any]


class MetaDefaults(SchemaBase):
    policy: str
    cutoff_local: str
    risk_quantile: float
    window_days: int


class MetaResponse(SchemaBase):
    """Response returned by GET /api/v1/meta."""

    app_version: str
    data: MetaData
    defaults: MetaDefaults
    timezone: str
