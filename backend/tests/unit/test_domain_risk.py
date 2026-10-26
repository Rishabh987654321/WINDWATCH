"""Unit tests for risk-adjusted firm wind and calibration backtest.

Implements rules defined in docs/DOMAIN.md §4.5:
- Strict exclusion of delivery days D-1 and later (no lookahead / leakage)
- Window truncation and min_days requirement
- Clipping at zero (firm_wind_mw >= 0)
- Calibration backtest on synthetic errors close to q
"""

from datetime import date, timedelta

import numpy as np
import pandas as pd
import pytest
from hypothesis import given
from hypothesis import strategies as st

from app.domain.risk import (
    band,
    calibration,
    error_sample,
    errors_by_day,
    expected,
)


def test_error_sample_excludes_D_minus_1_and_later() -> None:
    """Verify error_sample strictly excludes delivery day D-1 and later.

    Test fixture contains:
    - Days D-10 to D-2: errors with mean ~0, max 100
    - Day D-1: HUGE OUTLIER error = 999,999.0 MW
    The error sample for D MUST NOT contain 999,999.0 MW.
    """
    D = date(2026, 1, 15)
    sample_days: dict[date, np.ndarray] = {}

    # Days D-15 to D-2 (14 days): normal errors
    for i in range(2, 16):
        d_i = D - timedelta(days=i)
        sample_days[d_i] = np.array([50.0, 100.0, -50.0, -100.0])

    # Day D-1: catastrophic outlier
    sample_days[date(2026, 1, 14)] = np.array([999_999.0, 999_999.0])
    # Day D: future
    sample_days[date(2026, 1, 15)] = np.array([888_888.0])

    errs = error_sample(sample_days, D=D, window_days=14, min_days=7)

    assert errs is not None
    # Must NOT contain the outlier from D-1 or D
    assert 999_999.0 not in errs
    assert 888_888.0 not in errs
    assert np.max(errs) == 100.0


def test_error_sample_truncates_at_data_start_and_requires_min_days() -> None:
    """Verify error_sample returns None if fewer than min_days full days are available."""
    D = date(2026, 1, 5)
    # Only 3 days available before D-1 (e.g. D-4, D-3, D-2)
    sample_days: dict[date, np.ndarray] = {
        date(2026, 1, 1): np.array([10.0, 20.0]),
        date(2026, 1, 2): np.array([15.0, 25.0]),
        date(2026, 1, 3): np.array([12.0, 22.0]),
    }

    # With min_days=7, 3 available days must return None
    res = error_sample(sample_days, D=D, window_days=14, min_days=7)
    assert res is None

    # With min_days=3, it should return the concatenated sample of 6 values
    res_3 = error_sample(sample_days, D=D, window_days=14, min_days=3)
    assert res_3 is not None
    assert len(res_3) == 6


def test_firm_wind_clipped_at_zero() -> None:
    """Verify firm_wind_mw is always >= 0.0 even when forecast < over_q."""
    forecasts = [100.0, 50.0, 10.0]
    # Sample where over_q is 200.0 MW
    sample = np.array([0.0, 50.0, 100.0, 150.0, 200.0, 250.0])

    r_band = band(forecasts, sample, q=0.80)

    # 100 - 200 = -100 -> clipped to 0.0
    # 50 - 200 = -150 -> clipped to 0.0
    # 10 - 200 = -190 -> clipped to 0.0
    for val in r_band.firm_wind_mw:
        assert val == 0.0
        assert val >= 0.0


@given(
    f=st.floats(min_value=500.0, max_value=5000.0),
    q=st.floats(min_value=0.55, max_value=0.95),
)
def test_band_ordering_low_le_forecast_le_high(f: float, q: float) -> None:
    """Hypothesis property test: with symmetric positive/negative error sample, low <= forecast <= high."""
    # Symmetrical sample around 0
    sample = np.array([-500.0, -200.0, -100.0, 0.0, 100.0, 200.0, 500.0])
    r_band = band([f], sample, q=q)

    low = r_band.firm_wind_mw[0]
    high = r_band.band_high_mw[0]

    assert low <= f
    assert f <= high


def test_calibration_on_synthetic_normal_errors_is_close_to_q() -> None:
    """Verify calibration backtest matches risk_quantile q on synthetic normal errors.

    If errors are stationary N(0, 1000^2), then for q = 0.90, the realised
    share of periods with actual >= firm_wind_mw should be close to 90%.
    """
    np.random.seed(42)
    # 30 days of data, 24 periods per day
    n_days = 30
    periods_per_day = 24
    dates = [date(2026, 1, d) for d in range(1, n_days + 1)]

    records = []
    for d in dates:
        for h in range(periods_per_day):
            fc = 5000.0
            # Error ~ N(0, 500^2)
            err = float(np.random.normal(0, 500))
            act = fc - err
            records.append(
                {
                    "start_time": pd.Timestamp(
                        year=d.year, month=d.month, day=d.day, hour=h, tz="UTC"
                    ),
                    "forecast_mw": fc,
                    "actual_mw": act,
                    "error_mw": err,
                    "publish_time": pd.Timestamp(
                        year=d.year, month=d.month, day=d.day, hour=h, tz="UTC"
                    )
                    - pd.Timedelta(hours=24),
                    "horizon_h": 24.0,
                }
            )

    df_matched = pd.DataFrame(records)

    calib = calibration(df_matched, q=0.90, window_days=14, min_days=5)

    assert calib.risk_quantile == 0.90
    assert len(calib.days) > 0
    # Over 20+ evaluated days, realised coverage should be within ±5% of 90%
    assert abs(calib.realised_coverage_pct - 90.0) < 5.0


def test_risk_empty_inputs_and_exceptions() -> None:
    """Verify empty inputs and errors in risk module."""
    empty_df = pd.DataFrame(columns=["start_time", "forecast_mw", "actual_mw", "error_mw"])
    assert errors_by_day(empty_df) == {}
    assert error_sample({}, D=date(2026, 1, 10)) is None

    with pytest.raises(ValueError):
        band([100.0], np.array([]), q=0.9)

    calib_empty = calibration(empty_df)
    assert calib_empty.realised_coverage_pct == 0.0
    assert len(calib_empty.days) == 0


def test_risk_expected() -> None:
    """Verify risk.expected computes bias-adjusted central estimate or None."""
    # When sample is None, expected must return None
    assert expected([1000.0, 2000.0], None) is None

    # Sample with median = 200.0
    sample = np.array([100.0, 200.0, 300.0])  # median = 200.0
    forecasts = [1000.0, 150.0]

    res = expected(forecasts, sample)
    assert res is not None
    # 1000.0 - 200.0 = 800.0
    # 150.0 - 200.0 = -50.0 -> clipped to 0.0
    assert res == [800.0, 0.0]
