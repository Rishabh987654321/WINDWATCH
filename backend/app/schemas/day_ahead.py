"""Schema definitions for /api/v1/day-ahead endpoints."""

from app.schemas.common import CoverageStats, SchemaBase, TimeRange


class RiskMeta(SchemaBase):
    quantile: float
    window_days: int
    error_sample_size: int
    error_sample_range: TimeRange
    over_forecast_at_q_mw: float


class DayAheadPeriod(SchemaBase):
    ts: str
    forecast_mw: float
    forecast_published_at: str
    firm_wind_mw: float | None = None
    expected_wind_mw: float | None = None
    band_high_mw: float | None = None
    actual_mw: float | None = None


class ForecastAgeH(SchemaBase):
    min: float
    max: float


class DayAheadSummary(SchemaBase):
    mean_forecast_mw: float
    mean_firm_wind_mw: float | None = None
    mean_expected_wind_mw: float | None = None
    total_forecast_mwh: float
    total_firm_mwh: float | None = None
    forecast_age_h: ForecastAgeH


class DayAccuracy(SchemaBase):
    mae_mw: float | None = None
    bias_mw: float | None = None
    rmse_mw: float | None = None
    n: int


class DayAheadResponse(SchemaBase):
    """Response returned by GET /api/v1/day-ahead/{delivery_date}."""

    delivery_date: str
    decision_cutoff_utc: str
    cutoff_local: str
    risk: RiskMeta | None = None
    periods: list[DayAheadPeriod]
    summary: DayAheadSummary
    day_accuracy: DayAccuracy
    coverage: CoverageStats


class CalibrationDay(SchemaBase):
    delivery_date: str
    coverage_pct: float
    n: int
    mean_firm_wind_mw: float | None = None


class CalibrationResponse(SchemaBase):
    """Response returned by GET /api/v1/day-ahead/calibration."""

    risk_quantile: float
    realised_coverage_pct: float
    days: list[CalibrationDay]
