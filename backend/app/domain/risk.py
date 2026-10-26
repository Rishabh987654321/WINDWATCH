"""Risk-adjusted firm wind and calibration backtest.

Implements rules defined in docs/DOMAIN.md §4.5 (Policy B: Quantified-error feature).
- Build error sample from delivery days <= D-2 only (strictly no lookahead).
- Excludes D-1 because at the decision cutoff on D-1 actuals are still incomplete.
- Calculates firm wind and central intervals clipped at zero.
- Backtest calibration calculates realised share of periods where actual >= firm wind.
"""

from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, timedelta
from zoneinfo import ZoneInfo

import numpy as np
import pandas as pd

LONDON_TZ = ZoneInfo("Europe/London")


@dataclass(frozen=True)
class RiskBand:
    """Risk band quantiles and resulting firm wind and upper band profile."""

    q: float
    sample_size: int
    over_forecast_at_q_mw: float
    firm_wind_mw: list[float]
    band_high_mw: list[float]


@dataclass(frozen=True)
class CalibrationDay:
    """Realised coverage for a single delivery day in calibration backtest."""

    delivery_date: date
    coverage_pct: float
    n: int
    mean_firm_wind_mw: float


@dataclass(frozen=True)
class CalibrationResult:
    """Overall calibration backtest statistics across evaluated delivery days."""

    risk_quantile: float
    realised_coverage_pct: float
    days: list[CalibrationDay]


def errors_by_day(matched: pd.DataFrame) -> dict[date, np.ndarray]:
    """Index forecast errors by London delivery date.

    See docs/DOMAIN.md §4.5.

    Args:
        matched: Aligned evaluation DataFrame containing start_time and error_mw.

    Returns:
        Dict mapping London calendar date to 1D numpy array of errors (error_mw).
    """
    if matched.empty:
        return {}

    df = matched.copy()
    df["london_date"] = df["start_time"].dt.tz_convert(LONDON_TZ).dt.date

    result: dict[date, np.ndarray] = {}
    for d, group in df.groupby("london_date"):
        if isinstance(d, date):
            errs = group["error_mw"].dropna().to_numpy(dtype=float)
            if len(errs) > 0:
                result[d] = errs
    return result


def error_sample(
    daily_errors: dict[date, np.ndarray],
    D: date,
    window_days: int = 14,
    min_days: int = 7,
) -> np.ndarray | None:
    """Build a trailing error sample for delivery day D from days <= D-2 only.

    Strict leakage rule:
    Delivery day D-1 is EXCLUDED because at D-1 decision cutoff, D-1 actuals
    are still unfolding and incomplete. Using D-1 would constitute subtle look-ahead.
    Eligible range: [D - 1 - window_days, D - 2].
    Truncates at data start if prior history is shorter than window_days.
    Returns None if fewer than min_days full days are available.

    See docs/DOMAIN.md §4.5.

    Args:
        daily_errors: Dict mapping date to error array.
        D: Delivery date being traded.
        window_days: Trailing window size in days (default 14).
        min_days: Minimum number of full days required (default 7).

    Returns:
        Concatenated 1D numpy array of errors, or None if insufficient history.
    """
    if not daily_errors:
        return None

    # Earliest eligible day: D - 1 - window_days
    # Latest eligible day: D - 2
    start_d = D - timedelta(days=window_days + 1)
    end_d = D - timedelta(days=2)

    eligible_days = [d for d in daily_errors.keys() if start_d <= d <= end_d]

    if len(eligible_days) < min_days:
        return None

    eligible_days.sort()
    sample_arrays = [daily_errors[d] for d in eligible_days]
    return np.concatenate(sample_arrays)


def band(
    forecasts_mw: Sequence[float] | np.ndarray,
    sample: np.ndarray,
    q: float = 0.90,
) -> RiskBand:
    """Calculate the risk-adjusted firm wind and central band for a sequence of forecasts.

    firm_wind_mw = max(0, forecast - quantile(error, q))
    band_high_mw = max(0, forecast - quantile(error, 1 - q))

    See docs/DOMAIN.md §4.5.

    Args:
        forecasts_mw: Sequence of forecast MW values for delivery periods.
        sample: Trailing historical error sample.
        q: Risk quantile (e.g. 0.90).

    Returns:
        RiskBand dataclass.
    """
    if len(sample) == 0:
        raise ValueError("Error sample cannot be empty.")

    over_q = float(np.quantile(sample, q, method="linear"))
    under_q = float(np.quantile(sample, 1.0 - q, method="linear"))

    f_arr = np.array(forecasts_mw, dtype=float)
    firm_wind = np.maximum(0.0, f_arr - over_q).tolist()
    band_high = np.maximum(0.0, f_arr - under_q).tolist()

    return RiskBand(
        q=q,
        sample_size=len(sample),
        over_forecast_at_q_mw=over_q,
        firm_wind_mw=firm_wind,
        band_high_mw=band_high,
    )


def expected(
    forecasts_mw: Sequence[float] | np.ndarray,
    sample: np.ndarray | None,
) -> list[float] | None:
    """Calculate bias-adjusted central expected wind generation.

    expected_wind_mw = max(0, forecast - median(error_sample))
    Returns None if error sample is None (e.g. insufficient history).

    See docs/DOMAIN.md §4.5.

    Args:
        forecasts_mw: Sequence of forecast MW values.
        sample: Trailing historical error sample or None.

    Returns:
        List of expected wind MW values clipped at zero, or None.
    """
    if sample is None or len(sample) == 0:
        return None

    med_err = float(np.median(sample))
    f_arr = np.array(forecasts_mw, dtype=float)
    return [float(x) for x in np.maximum(0.0, f_arr - med_err)]


def calibration(
    matched: pd.DataFrame,
    q: float = 0.90,
    window_days: int = 14,
    min_days: int = 7,
) -> CalibrationResult:
    """Backtest the risk band across available delivery days in matched data.

    Evaluates realised coverage: share of periods where actual_mw >= firm_wind_mw.
    If well-calibrated, realised coverage should be close to q (e.g. ~90%).

    See docs/DOMAIN.md §4.5.

    Args:
        matched: Aligned evaluation DataFrame containing start_time, forecast_mw, actual_mw, error_mw.
        q: Risk quantile (default 0.90).
        window_days: Trailing window size in days (default 14).
        min_days: Minimum days required to compute risk band (default 7).

    Returns:
        CalibrationResult dataclass.
    """
    if matched.empty:
        return CalibrationResult(
            risk_quantile=q,
            realised_coverage_pct=0.0,
            days=[],
        )

    df = matched.copy()
    df["london_date"] = df["start_time"].dt.tz_convert(LONDON_TZ).dt.date

    daily_errs = errors_by_day(df)
    unique_dates = sorted(set(df["london_date"]))

    calib_days: list[CalibrationDay] = []

    total_hits = 0
    total_periods = 0

    for d in unique_dates:
        sample = error_sample(daily_errs, D=d, window_days=window_days, min_days=min_days)
        if sample is None:
            continue

        day_group = df[df["london_date"] == d]
        if day_group.empty:
            continue

        over_q = float(np.quantile(sample, q, method="linear"))
        f_arr = day_group["forecast_mw"].to_numpy(dtype=float)
        act_arr = day_group["actual_mw"].to_numpy(dtype=float)

        firm_wind = np.maximum(0.0, f_arr - over_q)
        hits = int(np.sum(act_arr >= firm_wind))
        n_periods = len(act_arr)

        total_hits += hits
        total_periods += n_periods

        day_cov = round((hits / n_periods) * 100.0, 2)
        calib_days.append(
            CalibrationDay(
                delivery_date=d,
                coverage_pct=day_cov,
                n=n_periods,
                mean_firm_wind_mw=float(np.mean(firm_wind)),
            )
        )

    realised_cov = round((total_hits / total_periods) * 100.0, 2) if total_periods > 0 else 0.0

    return CalibrationResult(
        risk_quantile=q,
        realised_coverage_pct=realised_cov,
        days=calib_days,
    )
