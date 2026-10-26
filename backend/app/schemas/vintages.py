"""Schema definitions for /api/v1/vintages endpoint."""

from app.schemas.common import SchemaBase


class VintageForecastPoint(SchemaBase):
    published_at: str
    horizon_h: float
    forecast_mw: float


class VintagesResponse(SchemaBase):
    """Response returned by GET /api/v1/vintages."""

    target: str
    actual_mw: float | None = None
    forecasts: list[VintageForecastPoint]
