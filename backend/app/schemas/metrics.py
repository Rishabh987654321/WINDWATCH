"""Schema definitions for /api/v1/metrics endpoints."""

from app.schemas.common import CoverageStats, SchemaBase


class ExtremeErrorPoint(SchemaBase):
    mw: float
    ts: str


class SummaryResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/summary."""

    n: int
    bias_mw: float | None = None
    mae_mw: float | None = None
    rmse_mw: float | None = None
    median_abs_error_mw: float | None = None
    p90_abs_error_mw: float | None = None
    p95_abs_error_mw: float | None = None
    nmae_pct: float | None = None
    over_forecast_rate: float | None = None
    max_over_forecast: ExtremeErrorPoint | None = None
    max_under_forecast: ExtremeErrorPoint | None = None
    corr: float | None = None
    coverage: CoverageStats


class ByHorizonPoint(SchemaBase):
    horizon_hours: int
    n: int
    n_expected: int
    coverage_pct: float
    mae_mw: float | None = None
    rmse_mw: float | None = None
    bias_mw: float | None = None
    p90_abs_error_mw: float | None = None


class ByHorizonResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/by-horizon."""

    points: list[ByHorizonPoint]


class ByHourPoint(SchemaBase):
    hour_local: int
    n: int
    mae_mw: float | None = None
    bias_mw: float | None = None


class ByHourResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/by-hour."""

    points: list[ByHourPoint]


class ByLevelPoint(SchemaBase):
    bin: int
    level_from_mw: float
    level_to_mw: float
    n: int
    mae_mw: float | None = None
    bias_mw: float | None = None


class ByLevelResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/by-level."""

    basis: str
    points: list[ByLevelPoint]


class DistributionBin(SchemaBase):
    from_mw: float
    to_mw: float
    count: int


class DistributionQuantiles(SchemaBase):
    p05: float | None = None
    p25: float | None = None
    p50: float | None = None
    p75: float | None = None
    p95: float | None = None


class DistributionResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/distribution."""

    bin_width_mw: float
    bins: list[DistributionBin]
    quantiles: DistributionQuantiles


class HeatmapResponse(SchemaBase):
    """Response returned by GET /api/v1/metrics/heatmap."""

    days: list[str]
    hours: list[int]
    values: list[list[float | None]]
