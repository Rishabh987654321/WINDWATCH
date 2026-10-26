"""Domain evaluation metrics and error analytics.

Implements rules defined in docs/DOMAIN.md §4.3, §4.4, §4.6.
All metrics follow:
- Error sign convention: error_mw = forecast_mw - actual_mw (positive = over-forecast).
- No MAPE (uses nMAE normalised by mean actual generation).
- Never return NaN or Infinity; undefined metrics return None.
"""

import math
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

from app.domain.timeutil import expected_hourly_targets, london_date

LONDON_TZ = ZoneInfo("Europe/London")


@dataclass(frozen=True)
class ExtremeError:
    """Extreme error point with magnitude and target timestamp."""

    mw: float
    ts: datetime


@dataclass(frozen=True)
class SummaryMetrics:
    """Headline accuracy and error summary metrics across an evaluation sample."""

    n: int
    bias_mw: float | None
    mae_mw: float | None
    rmse_mw: float | None
    median_abs_error_mw: float | None
    p90_abs_error_mw: float | None
    p95_abs_error_mw: float | None
    nmae_pct: float | None
    over_forecast_rate: float | None
    max_over_forecast: ExtremeError | None
    max_under_forecast: ExtremeError | None
    corr: float | None


@dataclass(frozen=True)
class HourMetricPoint:
    """Accuracy metrics for a single local hour of day (0..23)."""

    hour_local: int
    n: int
    mae_mw: float | None
    bias_mw: float | None
    rmse_mw: float | None


@dataclass(frozen=True)
class LevelMetricPoint:
    """Accuracy metrics for a generation level bin."""

    bin_index: int
    bin_min_mw: float
    bin_max_mw: float
    mean_forecast_mw: float
    mean_actual_mw: float
    mae_mw: float
    bias_mw: float
    n: int


@dataclass(frozen=True)
class DistributionBin:
    """Histogram bin for error distribution."""

    bin_min_mw: float
    bin_max_mw: float
    count: int


@dataclass(frozen=True)
class ErrorDistribution:
    """Distribution of forecast errors with histogram bins and quantiles."""

    bins: list[DistributionBin]
    p10_mw: float | None
    p25_mw: float | None
    p50_mw: float | None
    p75_mw: float | None
    p90_mw: float | None


@dataclass(frozen=True)
class HeatmapCell:
    """Single cell in day x hour error heatmap."""

    date: str
    hour_local: int
    mae_mw: float | None


@dataclass(frozen=True)
class HorizonMetricPoint:
    """Accuracy metric point for lead-time horizon H."""

    horizon_hours: int
    n: int
    n_expected: int
    coverage_pct: float
    mae_mw: float | None
    rmse_mw: float | None
    bias_mw: float | None
    p90_abs_error_mw: float | None


def summary(matched: pd.DataFrame) -> SummaryMetrics:
    """Compute summary accuracy and bias metrics over an aligned evaluation frame.

    Sign: error_mw = forecast_mw - actual_mw (positive = over-forecast).
    Normalized MAE (nMAE): 100 * MAE / mean(actual_mw).
    Undefined metrics return None (never NaN).

    See docs/DOMAIN.md §4.4.

    Args:
        matched: DataFrame with start_time, forecast_mw, actual_mw, error_mw.

    Returns:
        SummaryMetrics instance.
    """
    if matched.empty or len(matched) == 0:
        return SummaryMetrics(
            n=0,
            bias_mw=None,
            mae_mw=None,
            rmse_mw=None,
            median_abs_error_mw=None,
            p90_abs_error_mw=None,
            p95_abs_error_mw=None,
            nmae_pct=None,
            over_forecast_rate=None,
            max_over_forecast=None,
            max_under_forecast=None,
            corr=None,
        )

    # Exclude non-finite values defensively
    valid = matched.dropna(subset=["forecast_mw", "actual_mw", "error_mw"]).copy()
    n = len(valid)
    if n == 0:
        return SummaryMetrics(
            n=0,
            bias_mw=None,
            mae_mw=None,
            rmse_mw=None,
            median_abs_error_mw=None,
            p90_abs_error_mw=None,
            p95_abs_error_mw=None,
            nmae_pct=None,
            over_forecast_rate=None,
            max_over_forecast=None,
            max_under_forecast=None,
            corr=None,
        )

    errors = valid["error_mw"].to_numpy(dtype=float)
    abs_errors = np.abs(errors)
    actuals = valid["actual_mw"].to_numpy(dtype=float)
    forecasts = valid["forecast_mw"].to_numpy(dtype=float)

    bias = float(np.mean(errors))
    mae = float(np.mean(abs_errors))
    rmse = float(np.sqrt(np.mean(errors**2)))
    med_abs = float(np.median(abs_errors))
    p90_abs = float(np.quantile(abs_errors, 0.90))
    p95_abs = float(np.quantile(abs_errors, 0.95))

    mean_act = float(np.mean(actuals))
    nmae = (100.0 * mae / mean_act) if mean_act > 0 else None

    over_rate = float(np.sum(errors > 0) / n)

    # Extremes
    max_over_idx = int(np.argmax(errors))
    max_over_row = valid.iloc[max_over_idx]
    max_over = ExtremeError(
        mw=float(max_over_row["error_mw"]),
        ts=max_over_row["start_time"],
    )

    min_err_idx = int(np.argmin(errors))
    min_err_row = valid.iloc[min_err_idx]
    max_under = ExtremeError(
        mw=float(min_err_row["error_mw"]),
        ts=min_err_row["start_time"],
    )

    # Pearson correlation
    if n >= 2 and np.std(forecasts) > 0 and np.std(actuals) > 0:
        corr_val = float(np.corrcoef(forecasts, actuals)[0, 1])
        corr = None if math.isnan(corr_val) else corr_val
    else:
        corr = None

    return SummaryMetrics(
        n=n,
        bias_mw=bias,
        mae_mw=mae,
        rmse_mw=rmse,
        median_abs_error_mw=med_abs,
        p90_abs_error_mw=p90_abs,
        p95_abs_error_mw=p95_abs,
        nmae_pct=nmae,
        over_forecast_rate=over_rate,
        max_over_forecast=max_over,
        max_under_forecast=max_under,
        corr=corr,
    )


def by_hour(matched: pd.DataFrame) -> list[HourMetricPoint]:
    """Compute accuracy and bias metrics for each local London hour of day (0..23).

    See docs/DOMAIN.md §4.6.

    Args:
        matched: Aligned evaluation DataFrame.

    Returns:
        List of 24 HourMetricPoint instances.
    """
    if matched.empty:
        return [
            HourMetricPoint(hour_local=h, n=0, mae_mw=None, bias_mw=None, rmse_mw=None)
            for h in range(24)
        ]

    df = matched.copy()
    # Extract London local hour
    df["hour_local"] = df["start_time"].dt.tz_convert(LONDON_TZ).dt.hour

    points: list[HourMetricPoint] = []
    for h in range(24):
        h_df = df[df["hour_local"] == h]
        n = len(h_df)
        if n == 0:
            points.append(
                HourMetricPoint(hour_local=h, n=0, mae_mw=None, bias_mw=None, rmse_mw=None)
            )
        else:
            err = h_df["error_mw"].to_numpy(dtype=float)
            points.append(
                HourMetricPoint(
                    hour_local=h,
                    n=n,
                    mae_mw=float(np.mean(np.abs(err))),
                    bias_mw=float(np.mean(err)),
                    rmse_mw=float(np.sqrt(np.mean(err**2))),
                )
            )
    return points


def by_level(matched: pd.DataFrame, bins: int = 5) -> list[LevelMetricPoint]:
    """Compute accuracy and bias metrics binned by forecast generation level.

    Bins by forecast generation level into equal-count bins.
    Handles duplicate bin edges and small unique counts cleanly.

    See docs/DOMAIN.md §4.6.

    Args:
        matched: Aligned evaluation DataFrame.
        bins: Target number of equal-count bins (default 5).

    Returns:
        List of LevelMetricPoint instances.
    """
    if matched.empty:
        return []

    df = matched.sort_values("forecast_mw").copy()
    n = len(df)
    if n == 0:
        return []

    # If all values are identical or unique values < bins, group into single or fewer bins
    unique_fcs = df["forecast_mw"].nunique()
    actual_bins = min(bins, unique_fcs) if unique_fcs > 0 else 1

    try:
        df["bin"], bin_edges = pd.qcut(
            df["forecast_mw"],
            q=actual_bins,
            labels=False,
            retbins=True,
            duplicates="drop",
        )
    except Exception:
        # Fallback to chunk split
        df["bin"] = np.array_split(np.arange(n), actual_bins)  # type: ignore

    points: list[LevelMetricPoint] = []
    for b_idx, group in df.groupby("bin"):
        b_num = int(str(b_idx)) if not isinstance(b_idx, (int, np.integer)) else int(b_idx)
        min_mw = float(group["forecast_mw"].min())

        max_mw = float(group["forecast_mw"].max())
        mean_fc = float(group["forecast_mw"].mean())
        mean_act = float(group["actual_mw"].mean())
        err = group["error_mw"].to_numpy(dtype=float)

        points.append(
            LevelMetricPoint(
                bin_index=b_num,
                bin_min_mw=min_mw,
                bin_max_mw=max_mw,
                mean_forecast_mw=mean_fc,
                mean_actual_mw=mean_act,
                mae_mw=float(np.mean(np.abs(err))),
                bias_mw=float(np.mean(err)),
                n=len(group),
            )
        )
    return points


def distribution(
    matched: pd.DataFrame,
    bin_width_mw: float = 500.0,
) -> ErrorDistribution:
    """Compute histogram bins and quantiles for the error distribution.

    See docs/DOMAIN.md §4.6.

    Args:
        matched: Aligned evaluation DataFrame.
        bin_width_mw: Width of each histogram bin in MW (default 500.0).

    Returns:
        ErrorDistribution instance.
    """
    if matched.empty:
        return ErrorDistribution(
            bins=[],
            p10_mw=None,
            p25_mw=None,
            p50_mw=None,
            p75_mw=None,
            p90_mw=None,
        )

    errors = matched["error_mw"].to_numpy(dtype=float)
    p10 = float(np.quantile(errors, 0.10))
    p25 = float(np.quantile(errors, 0.25))
    p50 = float(np.quantile(errors, 0.50))
    p75 = float(np.quantile(errors, 0.75))
    p90 = float(np.quantile(errors, 0.90))

    min_err = float(np.min(errors))
    max_err = float(np.max(errors))

    # Determine bin bounds rounded to bin_width_mw
    start_edge = math.floor(min_err / bin_width_mw) * bin_width_mw
    end_edge = math.ceil(max_err / bin_width_mw) * bin_width_mw
    if start_edge == end_edge:
        end_edge += bin_width_mw

    bin_edges = np.arange(start_edge, end_edge + bin_width_mw, bin_width_mw)
    counts, _ = np.histogram(errors, bins=bin_edges)

    hist_bins: list[DistributionBin] = []
    for i in range(len(counts)):
        hist_bins.append(
            DistributionBin(
                bin_min_mw=float(bin_edges[i]),
                bin_max_mw=float(bin_edges[i + 1]),
                count=int(counts[i]),
            )
        )

    return ErrorDistribution(
        bins=hist_bins,
        p10_mw=p10,
        p25_mw=p25,
        p50_mw=p50,
        p75_mw=p75,
        p90_mw=p90,
    )


def heatmap(matched: pd.DataFrame) -> list[HeatmapCell]:
    """Compute day x local hour MAE matrix for error visualization.

    See docs/DOMAIN.md §4.6.

    Args:
        matched: Aligned evaluation DataFrame.

    Returns:
        List of HeatmapCell instances.
    """
    if matched.empty:
        return []

    df = matched.copy()
    df["london_date"] = df["start_time"].apply(lambda ts: str(london_date(ts)))
    df["hour_local"] = df["start_time"].dt.tz_convert(LONDON_TZ).dt.hour

    cells: list[HeatmapCell] = []
    grouped = df.groupby(["london_date", "hour_local"])

    for (d_str, h), group in grouped:
        abs_err = np.abs(group["error_mw"].to_numpy(dtype=float))
        mae = float(np.mean(abs_err))
        h_val = int(str(h)) if not isinstance(h, (int, np.integer)) else int(h)
        cells.append(HeatmapCell(date=str(d_str), hour_local=h_val, mae_mw=mae))

    return cells


def by_horizon(
    fc: pd.DataFrame,
    actuals: pd.DataFrame,
    start: datetime,
    end: datetime,
    max_h: int = 66,
    step: int = 1,
) -> list[HorizonMetricPoint]:
    """Compute accuracy and coverage metrics across lead-time horizons H.

    Vectorised evaluation:
    Filters target window once, sorts by (start_time, horizon_h asc),
    and evaluates each integer lead time H efficiently.
    Target execution time: < 400 ms on real snapshot.

    See docs/DOMAIN.md §4.6 and docs/SYSTEM_DESIGN.md §4.3.

    Args:
        fc: Cleaned forecasts DataFrame.
        actuals: Cleaned actuals DataFrame.
        start: Evaluation window start (UTC).
        end: Evaluation window end (UTC).
        max_h: Maximum horizon to evaluate (default 66).
        step: Step size between horizons (default 1).

    Returns:
        List of HorizonMetricPoint instances.
    """
    expected_list = expected_hourly_targets(start, end)
    n_expected = len(expected_list)
    if n_expected == 0 or fc.empty or actuals.empty:
        return []

    expected_set = set(expected_list)

    # Slice actuals to evaluation hourly targets
    act_sub = actuals[actuals["start_time"].isin(expected_set)][["start_time", "actual_mw"]].copy()
    if act_sub.empty:
        return []

    # Slice forecasts to evaluation hourly targets and pre-sort by start_time, horizon_h
    fc_sub = fc[fc["start_time"].isin(expected_set)][
        ["start_time", "forecast_mw", "horizon_h"]
    ].copy()
    if fc_sub.empty:
        return []

    # Sort so smallest horizon_h >= H appears first
    fc_sorted = fc_sub.sort_values(
        ["start_time", "horizon_h"],
        ascending=[True, True],
    )

    points: list[HorizonMetricPoint] = []
    horizons = list(range(0, max_h + 1, step))

    for H in horizons:
        eligible = fc_sorted[fc_sorted["horizon_h"] >= float(H)]
        if eligible.empty:
            points.append(
                HorizonMetricPoint(
                    horizon_hours=H,
                    n=0,
                    n_expected=n_expected,
                    coverage_pct=0.0,
                    mae_mw=None,
                    rmse_mw=None,
                    bias_mw=None,
                    p90_abs_error_mw=None,
                )
            )
            continue

        # Drop duplicates on start_time keeping smallest horizon >= H (latest publish)
        selected_h = eligible.drop_duplicates(subset=["start_time"], keep="first")

        # Inner join with hourly actuals
        merged = pd.merge(selected_h, act_sub, on="start_time", how="inner")
        n = len(merged)

        if n == 0:
            points.append(
                HorizonMetricPoint(
                    horizon_hours=H,
                    n=0,
                    n_expected=n_expected,
                    coverage_pct=0.0,
                    mae_mw=None,
                    rmse_mw=None,
                    bias_mw=None,
                    p90_abs_error_mw=None,
                )
            )
            continue

        errors = (merged["forecast_mw"] - merged["actual_mw"]).to_numpy(dtype=float)
        abs_errors = np.abs(errors)

        cov_pct = round((n / n_expected) * 100.0, 2)
        mae = float(np.mean(abs_errors))
        rmse = float(np.sqrt(np.mean(errors**2)))
        bias = float(np.mean(errors))
        p90 = float(np.quantile(abs_errors, 0.90))

        points.append(
            HorizonMetricPoint(
                horizon_hours=H,
                n=n,
                n_expected=n_expected,
                coverage_pct=cov_pct,
                mae_mw=mae,
                rmse_mw=rmse,
                bias_mw=bias,
                p90_abs_error_mw=p90,
            )
        )

    return points
