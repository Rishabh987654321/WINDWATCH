"""Analytics service orchestrating domain operations on DataStore with LRU caching.

Follows ADR-014:
- In-memory memoization per (snapshot_id, ...)
- Orchestration only; no business logic belonging to domain/
- Routers call this service and return Pydantic models (no pandas in routers)
"""

import functools
from datetime import UTC, date, datetime, time, timedelta
from typing import Any, cast
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd
from fastapi import HTTPException

from app.config import settings
from app.data.store import store
from app.domain.align import Coverage, align
from app.domain.metrics import (
    by_horizon,
    by_hour,
    by_level,
    distribution,
    heatmap,
    summary,
)
from app.domain.risk import (
    band,
    calibration,
    error_sample,
    errors_by_day,
    expected,
)
from app.domain.selection import select_day_ahead, select_lead_time
from app.domain.timeutil import (
    cutoff_utc,
    delivery_day_bounds,
    expected_hourly_targets,
)
from app.schemas.common import CoverageStats, TimeRange
from app.schemas.day_ahead import (
    CalibrationDay,
    CalibrationResponse,
    DayAccuracy,
    DayAheadPeriod,
    DayAheadResponse,
    DayAheadSummary,
    ForecastAgeH,
    RiskMeta,
)
from app.schemas.meta import (
    MetaCoverage,
    MetaData,
    MetaDefaults,
    MetaResponse,
)
from app.schemas.metrics import (
    ByHorizonPoint,
    ByHorizonResponse,
    ByHourPoint,
    ByHourResponse,
    ByLevelPoint,
    ByLevelResponse,
    DistributionBin,
    DistributionQuantiles,
    DistributionResponse,
    ExtremeErrorPoint,
    HeatmapResponse,
    SummaryResponse,
)
from app.schemas.params import (
    COVERAGE_END_DATE,
    COVERAGE_END_UTC,
    COVERAGE_START_DATE,
    COVERAGE_START_UTC,
)
from app.schemas.series import SeriesPoint, SeriesQueryEcho, SeriesResponse
from app.schemas.vintages import VintageForecastPoint, VintagesResponse

LONDON_TZ = ZoneInfo("Europe/London")


def to_iso_z(dt: datetime) -> str:
    """Format tz-aware datetime to ISO-8601 UTC with Z suffix per API.md conventions."""
    return dt.astimezone(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resolve_param_val(policy: str, horizon_hours: float | None, cutoff: str | None) -> float | str:
    """Ensure parameter value has concrete float or str type."""
    if policy == "day_ahead":
        return cutoff if cutoff is not None else "09:00"
    return horizon_hours if horizon_hours is not None else 0.0


# ---------------------------------------------------------------------------
# Cached domain wrappers (ADR-014)
# ---------------------------------------------------------------------------


@functools.lru_cache(maxsize=128)
def _get_selected_and_aligned(
    snapshot_id: str,
    policy: str,
    param_val: float | str,
    start_utc: datetime,
    end_utc: datetime,
) -> tuple[pd.DataFrame, Coverage]:
    """Retrieve and memoize selected forecasts and aligned dataframe for a query."""
    store.check_ready()

    if policy == "day_ahead":
        cutoff_t = time.fromisoformat(str(param_val))
        selected = select_day_ahead(store.forecasts, cutoff_t)
    else:
        h = float(param_val)
        selected = select_lead_time(store.forecasts, h)

    matched, cov = align(selected, store.actuals, start_utc, end_utc)
    return matched, cov


@functools.lru_cache(maxsize=32)
def _get_daily_errors(snapshot_id: str, cutoff_str: str) -> dict[date, np.ndarray]:
    """Precompute and memoize errors_by_day across available dataset window."""
    store.check_ready()
    cutoff_t = time.fromisoformat(cutoff_str)
    selected = select_day_ahead(store.forecasts, cutoff_t)
    matched, _ = align(selected, store.actuals, COVERAGE_START_UTC, COVERAGE_END_UTC)
    return errors_by_day(matched)


@functools.lru_cache(maxsize=32)
def _get_by_horizon_points(
    snapshot_id: str,
    start_utc: datetime,
    end_utc: datetime,
    step: int,
    max_h: int,
) -> list[Any]:
    """Memoize by_horizon computation."""
    store.check_ready()
    return by_horizon(
        store.forecasts,
        store.actuals,
        start_utc,
        end_utc,
        max_h=max_h,
        step=step,
    )


@functools.lru_cache(maxsize=32)
def _get_calibration_cached(
    snapshot_id: str,
    cutoff_str: str,
    risk_quantile: float,
    window_days: int,
    min_days: int,
) -> Any:
    """Memoize calibration backtest across the full snapshot."""
    store.check_ready()
    cutoff_t = time.fromisoformat(cutoff_str)
    full_selected = select_day_ahead(store.forecasts, cutoff_t)
    full_aligned, _ = align(full_selected, store.actuals, COVERAGE_START_UTC, COVERAGE_END_UTC)
    return calibration(
        full_aligned,
        q=risk_quantile,
        window_days=window_days,
        min_days=min_days,
    )


@functools.lru_cache(maxsize=4)
def _get_meta_cached(snapshot_id: str) -> MetaResponse:
    """Memoize bootstrap metadata response."""
    manifest = store.manifest
    quality = manifest.get("quality", {})

    return MetaResponse(
        app_version=settings.app_version,
        data=MetaData(
            snapshot_id=snapshot_id,
            ingested_at=manifest.get("ingested_at", datetime.now(UTC).isoformat()),
            sources=["FUELHH", "WINDFOR"],
            coverage=MetaCoverage(
                actuals=TimeRange(
                    from_="2025-12-01T00:00:00Z",
                    to="2026-01-31T23:30:00Z",
                ),
                forecasts=TimeRange(
                    from_="2025-12-01T00:00:00Z",
                    to="2026-02-01T00:00:00Z",
                ),
            ),
            evaluation_window=TimeRange(
                from_=settings.eval_window_from.isoformat(),
                to=settings.eval_window_to.isoformat(),
            ),
            max_horizon_hours=store.max_horizon_hours,
            reliable_horizon_hours=store.reliable_horizon_hours,
            resolution_minutes=60,
            actual_resolution_minutes=30,
            quality={
                "dropped_negative": quality.get("dropped_negative_generation", 0),
                "retrocast_rows_dropped": quality.get("retrocast_rows_dropped", 0),
                "duplicates_removed": quality.get("duplicates_removed", 0),
                "missing_actual_periods": quality.get("missing_actual_periods", 0),
                "missing_forecast_periods": quality.get("missing_forecast_hours", 0),
            },
        ),
        defaults=MetaDefaults(
            policy="day_ahead",
            cutoff_local=settings.day_ahead_cutoff_local,
            risk_quantile=settings.risk_quantile_default,
            window_days=settings.risk_window_days_default,
        ),
        timezone="Europe/London",
    )


# ---------------------------------------------------------------------------
# Service methods
# ---------------------------------------------------------------------------


def get_meta() -> MetaResponse:
    """Build bootstrap metadata response."""
    store.check_ready()
    return _get_meta_cached(store.snapshot_id)


@functools.lru_cache(maxsize=32)
def _get_series_cached(
    snapshot_id: str,
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    param_val: float | str,
) -> SeriesResponse:
    """Retrieve and memoize actual vs forecast time series response."""
    aligned_df, cov = _get_selected_and_aligned(snapshot_id, policy, param_val, start_utc, end_utc)

    expected_targets = expected_hourly_targets(start_utc, end_utc)

    # Build indexed map of aligned points using fast itertuples
    aligned_by_ts: dict[datetime, dict[str, Any]] = {}
    if not aligned_df.empty:
        for row in aligned_df.itertuples(index=False):
            ts: datetime = cast(datetime, row.start_time)
            act_mw: Any = row.actual_mw
            fc_mw: Any = row.forecast_mw
            pub_ts: datetime = cast(datetime, row.publish_time)
            hor_h: Any = row.horizon_h
            err_mw: Any = row.error_mw
            aligned_by_ts[ts] = {
                "actual_mw": round(float(act_mw), 1) if not pd.isna(act_mw) else None,
                "forecast_mw": round(float(fc_mw), 1) if not pd.isna(fc_mw) else None,
                "forecast_published_at": to_iso_z(pub_ts) if not pd.isna(pub_ts) else None,
                "horizon_h": round(float(hor_h), 1) if not pd.isna(hor_h) else None,
                "error_mw": round(float(err_mw), 1) if not pd.isna(err_mw) else None,
            }

    points: list[SeriesPoint] = []
    for target in expected_targets:
        pt_data = aligned_by_ts.get(target)
        if pt_data:
            points.append(
                SeriesPoint(
                    ts=to_iso_z(target),
                    actual_mw=pt_data["actual_mw"],
                    forecast_mw=pt_data["forecast_mw"],
                    forecast_published_at=pt_data["forecast_published_at"],
                    horizon_h=pt_data["horizon_h"],
                    error_mw=pt_data["error_mw"],
                )
            )
        else:
            points.append(
                SeriesPoint(
                    ts=to_iso_z(target),
                    actual_mw=None,
                    forecast_mw=None,
                    forecast_published_at=None,
                    horizon_h=None,
                    error_mw=None,
                )
            )

    return SeriesResponse(
        query=SeriesQueryEcho(
            from_=to_iso_z(start_utc),
            to=to_iso_z(end_utc),
            policy=policy,
            horizon_hours=float(param_val) if policy == "lead_time" else None,
            cutoff=str(param_val) if policy == "day_ahead" else None,
        ),
        points=points,
        coverage=CoverageStats(
            n_expected=cov.n_expected,
            n_matched=cov.n_matched,
            n_missing_actual=cov.n_missing_actual,
            n_missing_forecast=cov.n_missing_forecast,
        ),
    )


def get_series(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
) -> SeriesResponse:
    """Retrieve actual vs forecast time series and coverage stats."""
    store.check_ready()
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    return _get_series_cached(store.snapshot_id, start_utc, end_utc, policy, param_val)


def get_day_ahead(
    delivery_date: date,
    cutoff_str: str = "09:00",
    risk_quantile: float = 0.90,
    window_days: int = 28,
) -> DayAheadResponse:
    """Compute day-ahead forecast, decision cutoff, risk band, and realized accuracy."""
    store.check_ready()

    # 404 check: must lie within [2025-12-01, 2026-01-31]
    if delivery_date < COVERAGE_START_DATE or delivery_date > COVERAGE_END_DATE:
        raise HTTPException(
            status_code=404,
            detail=f"Delivery date {delivery_date} is outside the dataset coverage [{COVERAGE_START_DATE} .. {COVERAGE_END_DATE}]",
        )

    start_utc, end_utc = delivery_day_bounds(delivery_date)
    cutoff_t = time.fromisoformat(cutoff_str)
    decision_cutoff = cutoff_utc(delivery_date, cutoff_t)

    # Select day-ahead forecast for this specific delivery day via memoized helper
    aligned_df, cov = _get_selected_and_aligned(
        store.snapshot_id, "day_ahead", cutoff_str, start_utc, end_utc
    )

    expected_targets = expected_hourly_targets(start_utc, end_utc)

    # Historical error sample using D-2 rule
    daily_errors = _get_daily_errors(store.snapshot_id, cutoff_str)
    sample = error_sample(
        daily_errors, D=delivery_date, window_days=window_days, min_days=settings.risk_min_days
    )

    r_band = None
    expected_mw_list = None
    risk_meta = None

    if sample is not None and not aligned_df.empty:
        r_band = band(aligned_df["forecast_mw"].to_numpy(), sample, q=risk_quantile)
        expected_mw_list = expected(aligned_df["forecast_mw"].to_numpy(), sample)

        earliest_sample_d = delivery_date - timedelta(days=window_days + 1)
        latest_sample_d = delivery_date - timedelta(days=2)
        risk_meta = RiskMeta(
            quantile=risk_quantile,
            window_days=window_days,
            error_sample_size=len(sample),
            error_sample_range=TimeRange(
                from_=earliest_sample_d.isoformat(),
                to=latest_sample_d.isoformat(),
            ),
            over_forecast_at_q_mw=round(r_band.over_forecast_at_q_mw, 1),
        )

    # Build periods
    aligned_indexed = aligned_df.set_index("start_time") if not aligned_df.empty else pd.DataFrame()
    periods: list[DayAheadPeriod] = []

    ages: list[float] = []

    for i, target in enumerate(expected_targets):
        if target in aligned_indexed.index:
            row: Any = aligned_indexed.loc[target]
            fc_mw: float = float(row["forecast_mw"])
            pub_ts: datetime = row["publish_time"]
            act_val: Any = row["actual_mw"]
            act_mw: float | None = float(act_val) if not pd.isna(act_val) else None

            age_h = round((decision_cutoff - pub_ts).total_seconds() / 3600.0, 1)
            ages.append(age_h)

            firm_mw = round(r_band.firm_wind_mw[i], 1) if r_band is not None else None
            exp_mw = round(expected_mw_list[i], 1) if expected_mw_list is not None else None
            high_mw = round(r_band.band_high_mw[i], 1) if r_band is not None else None

            periods.append(
                DayAheadPeriod(
                    ts=to_iso_z(target),
                    forecast_mw=round(fc_mw, 1),
                    forecast_published_at=to_iso_z(pub_ts),
                    firm_wind_mw=firm_mw,
                    expected_wind_mw=exp_mw,
                    band_high_mw=high_mw,
                    actual_mw=round(act_mw, 1) if act_mw is not None else None,
                )
            )
        else:
            periods.append(
                DayAheadPeriod(
                    ts=to_iso_z(target),
                    forecast_mw=0.0,
                    forecast_published_at=to_iso_z(decision_cutoff),
                    firm_wind_mw=None,
                    expected_wind_mw=None,
                    band_high_mw=None,
                    actual_mw=None,
                )
            )

    # Summary
    if not aligned_df.empty:
        mean_fc = round(float(aligned_df["forecast_mw"].mean()), 1)
        tot_fc = round(float(aligned_df["forecast_mw"].sum()), 1)
        min_age = min(ages) if ages else 0.0
        max_age = max(ages) if ages else 0.0
    else:
        mean_fc = 0.0
        tot_fc = 0.0
        min_age = 0.0
        max_age = 0.0

    mean_firm = round(float(np.mean(r_band.firm_wind_mw)), 1) if r_band is not None else None
    mean_exp = round(float(np.mean(expected_mw_list)), 1) if expected_mw_list is not None else None
    tot_firm = round(float(np.sum(r_band.firm_wind_mw)), 1) if r_band is not None else None

    # Day accuracy
    day_metrics = summary(aligned_df)

    return DayAheadResponse(
        delivery_date=delivery_date.isoformat(),
        decision_cutoff_utc=to_iso_z(decision_cutoff),
        cutoff_local=cutoff_str,
        risk=risk_meta,
        periods=periods,
        summary=DayAheadSummary(
            mean_forecast_mw=mean_fc,
            mean_firm_wind_mw=mean_firm,
            mean_expected_wind_mw=mean_exp,
            total_forecast_mwh=tot_fc,
            total_firm_mwh=tot_firm,
            forecast_age_h=ForecastAgeH(min=min_age, max=max_age),
        ),
        day_accuracy=DayAccuracy(
            mae_mw=day_metrics.mae_mw,
            bias_mw=day_metrics.bias_mw,
            rmse_mw=day_metrics.rmse_mw,
            n=day_metrics.n,
        ),
        coverage=CoverageStats(
            n_expected=cov.n_expected,
            n_matched=cov.n_matched,
            n_missing_actual=cov.n_missing_actual,
            n_missing_forecast=cov.n_missing_forecast,
        ),
    )


def get_calibration(
    start_utc: datetime,
    end_utc: datetime,
    cutoff_str: str = "09:00",
    risk_quantile: float = 0.90,
    window_days: int = 28,
) -> CalibrationResponse:
    """Run risk band backtest across delivery days."""
    store.check_ready()

    calib = _get_calibration_cached(
        store.snapshot_id,
        cutoff_str,
        risk_quantile,
        window_days,
        settings.risk_min_days,
    )

    # Filter to requested delivery dates in [start_utc, end_utc)
    eval_dates_set = {
        ts.astimezone(LONDON_TZ).date() for ts in expected_hourly_targets(start_utc, end_utc)
    }

    filtered_days: list[CalibrationDay] = []
    total_hits = 0
    total_periods = 0

    for d in calib.days:
        if d.delivery_date in eval_dates_set:
            filtered_days.append(
                CalibrationDay(
                    delivery_date=d.delivery_date.isoformat(),
                    coverage_pct=d.coverage_pct,
                    n=d.n,
                    mean_firm_wind_mw=round(d.mean_firm_wind_mw, 1)
                    if d.mean_firm_wind_mw is not None
                    else None,
                )
            )
            hits = int(round((d.coverage_pct / 100.0) * d.n))
            total_hits += hits
            total_periods += d.n

    realised_cov = round((total_hits / total_periods) * 100.0, 1) if total_periods > 0 else 0.0

    return CalibrationResponse(
        risk_quantile=risk_quantile,
        realised_coverage_pct=realised_cov,
        days=filtered_days,
    )


def get_summary(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
) -> SummaryResponse:
    """Compute headline accuracy and error summary metrics."""
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    aligned_df, cov = _get_selected_and_aligned(
        store.snapshot_id, policy, param_val, start_utc, end_utc
    )

    metrics = summary(aligned_df)

    return SummaryResponse(
        n=metrics.n,
        bias_mw=metrics.bias_mw,
        mae_mw=metrics.mae_mw,
        rmse_mw=metrics.rmse_mw,
        median_abs_error_mw=metrics.median_abs_error_mw,
        p90_abs_error_mw=metrics.p90_abs_error_mw,
        p95_abs_error_mw=metrics.p95_abs_error_mw,
        nmae_pct=metrics.nmae_pct,
        over_forecast_rate=metrics.over_forecast_rate,
        max_over_forecast=(
            ExtremeErrorPoint(
                mw=metrics.max_over_forecast.mw,
                ts=to_iso_z(metrics.max_over_forecast.ts),
            )
            if metrics.max_over_forecast
            else None
        ),
        max_under_forecast=(
            ExtremeErrorPoint(
                mw=metrics.max_under_forecast.mw,
                ts=to_iso_z(metrics.max_under_forecast.ts),
            )
            if metrics.max_under_forecast
            else None
        ),
        corr=metrics.corr,
        coverage=CoverageStats(
            n_expected=cov.n_expected,
            n_matched=cov.n_matched,
            n_missing_actual=cov.n_missing_actual,
            n_missing_forecast=cov.n_missing_forecast,
        ),
    )


def get_by_horizon(
    start_utc: datetime,
    end_utc: datetime,
    step: int = 1,
    max_hours: int | None = None,
) -> ByHorizonResponse:
    """Compute accuracy across lead-time horizons."""
    store.check_ready()
    max_h = max_hours if max_hours is not None else store.max_horizon_hours

    pts = _get_by_horizon_points(store.snapshot_id, start_utc, end_utc, step, max_h)

    return ByHorizonResponse(
        points=[
            ByHorizonPoint(
                horizon_hours=pt.horizon_hours,
                n=pt.n,
                n_expected=pt.n_expected,
                coverage_pct=pt.coverage_pct,
                mae_mw=pt.mae_mw,
                rmse_mw=pt.rmse_mw,
                bias_mw=pt.bias_mw,
                p90_abs_error_mw=pt.p90_abs_error_mw,
            )
            for pt in pts
        ]
    )


def get_by_hour(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
) -> ByHourResponse:
    """Compute accuracy metrics per local hour of day (0..23)."""
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    aligned_df, _ = _get_selected_and_aligned(
        store.snapshot_id, policy, param_val, start_utc, end_utc
    )

    pts = by_hour(aligned_df)
    return ByHourResponse(
        points=[
            ByHourPoint(
                hour_local=pt.hour_local,
                n=pt.n,
                mae_mw=pt.mae_mw,
                bias_mw=pt.bias_mw,
            )
            for pt in pts
        ]
    )


def get_by_level(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
    bins: int = 5,
) -> ByLevelResponse:
    """Compute accuracy metrics across generation level bins."""
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    aligned_df, _ = _get_selected_and_aligned(
        store.snapshot_id, policy, param_val, start_utc, end_utc
    )

    pts = by_level(aligned_df, bins=bins)
    return ByLevelResponse(
        basis="forecast",
        points=[
            ByLevelPoint(
                bin=pt.bin_index + 1,
                level_from_mw=round(pt.bin_min_mw, 1),
                level_to_mw=round(pt.bin_max_mw, 1),
                n=pt.n,
                mae_mw=round(pt.mae_mw, 1) if pt.mae_mw is not None else None,
                bias_mw=round(pt.bias_mw, 1) if pt.bias_mw is not None else None,
            )
            for pt in pts
        ],
    )


def get_distribution(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
    bin_width_mw: float = 250.0,
) -> DistributionResponse:
    """Compute empirical error distribution histogram and quantiles."""
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    aligned_df, _ = _get_selected_and_aligned(
        store.snapshot_id, policy, param_val, start_utc, end_utc
    )

    dist = distribution(aligned_df, bin_width_mw=bin_width_mw)
    p05, p25, p50, p75, p95 = None, None, None, None, None
    if not aligned_df.empty:
        errs = aligned_df["error_mw"].dropna().to_numpy(dtype=float)
        if len(errs) > 0:
            p05 = round(float(np.quantile(errs, 0.05)), 1)
            p25 = round(float(np.quantile(errs, 0.25)), 1)
            p50 = round(float(np.quantile(errs, 0.50)), 1)
            p75 = round(float(np.quantile(errs, 0.75)), 1)
            p95 = round(float(np.quantile(errs, 0.95)), 1)

    return DistributionResponse(
        bin_width_mw=bin_width_mw,
        bins=[
            DistributionBin(
                from_mw=round(b.bin_min_mw, 1),
                to_mw=round(b.bin_max_mw, 1),
                count=b.count,
            )
            for b in dist.bins
        ],
        quantiles=DistributionQuantiles(
            p05=p05,
            p25=p25,
            p50=p50,
            p75=p75,
            p95=p95,
        ),
    )


@functools.lru_cache(maxsize=32)
def _get_heatmap_cached(
    snapshot_id: str,
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    param_val: float | str,
) -> HeatmapResponse:
    """Retrieve and memoize delivery day x local hour MAE heatmap."""
    aligned_df, _ = _get_selected_and_aligned(snapshot_id, policy, param_val, start_utc, end_utc)

    cells = heatmap(aligned_df)
    cell_map = {
        (c.date, c.hour_local): round(c.mae_mw, 1) if c.mae_mw is not None else None for c in cells
    }

    expected_targets = expected_hourly_targets(start_utc, end_utc)
    unique_days = sorted({ts.astimezone(LONDON_TZ).date().isoformat() for ts in expected_targets})
    hours = list(range(24))

    values = [[cell_map.get((d, h)) for h in hours] for d in unique_days]

    return HeatmapResponse(
        days=unique_days,
        hours=hours,
        values=values,
    )


def get_heatmap(
    start_utc: datetime,
    end_utc: datetime,
    policy: str,
    horizon_hours: float | None,
    cutoff: str | None,
) -> HeatmapResponse:
    """Compute delivery day x local hour MAE heatmap."""
    store.check_ready()
    param_val = _resolve_param_val(policy, horizon_hours, cutoff)
    return _get_heatmap_cached(store.snapshot_id, start_utc, end_utc, policy, param_val)


def get_vintages(target_utc: datetime) -> VintagesResponse:
    """Retrieve all forecasts published for a single target period."""
    store.check_ready()

    # Get actuals
    act_rows = store.actuals[store.actuals["start_time"] == target_utc]
    act_mw = (
        round(float(act_rows["actual_mw"].iloc[0]), 1)
        if not act_rows.empty and not pd.isna(act_rows["actual_mw"].iloc[0])
        else None
    )

    # Get all forecasts for this target
    fc_rows = store.forecasts[store.forecasts["start_time"] == target_utc].sort_values(
        "publish_time", ascending=True
    )

    points: list[VintageForecastPoint] = []
    for _, row in fc_rows.iterrows():
        points.append(
            VintageForecastPoint(
                published_at=to_iso_z(row["publish_time"]),
                horizon_h=round(float(row["horizon_h"]), 1),
                forecast_mw=round(float(row["forecast_mw"]), 1),
            )
        )

    return VintagesResponse(
        target=to_iso_z(target_utc),
        actual_mw=act_mw,
        forecasts=points,
    )
