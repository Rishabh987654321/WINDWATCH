"""Unit tests for domain metrics calculation.

Proves rules from docs/DOMAIN.md §4.4, §4.6:
- 4-point hand calculation with exact arithmetic
- Known quantile P90 calculation
- Empty inputs and zero-mean actuals returning None (never NaN)
- by_level ties and few-unique handling
- by_horizon vectorization and falling coverage_pct
"""

from datetime import UTC, datetime

import numpy as np
import pandas as pd
import pytest

from app.domain.metrics import (
    by_horizon,
    by_hour,
    by_level,
    distribution,
    heatmap,
    summary,
)


def make_hand_test_df() -> pd.DataFrame:
    """4-point test fixture with exact manual arithmetic:

    Point 1: fc = 1000, act =  800 -> err = +200, |err| = 200, err^2 =  40,000
    Point 2: fc = 2000, act = 2100 -> err = -100, |err| = 100, err^2 =  10,000
    Point 3: fc = 3000, act = 2700 -> err = +300, |err| = 300, err^2 =  90,000
    Point 4: fc = 4000, act = 4000 -> err =    0, |err| =   0, err^2 =       0

    Expected metrics:
    - n = 4
    - bias_mw = (200 - 100 + 300 + 0) / 4 = 400 / 4 = +100.0 MW
    - mae_mw = (200 + 100 + 300 + 0) / 4 = 600 / 4 = 150.0 MW
    - rmse_mw = sqrt((40000 + 10000 + 90000 + 0) / 4) = sqrt(35000) = 187.082869... MW
    - mean_actual = (800 + 2100 + 2700 + 4000) / 4 = 2400.0 MW
    - nmae_pct = 100 * 150.0 / 2400.0 = 6.25 %
    - over_forecast_rate = 2 / 4 = 0.50 (errors > 0)
    - max_over_forecast = +300.0 MW at 2026-01-01 02:00
    - max_under_forecast = -100.0 MW at 2026-01-01 01:00
    """
    rows = [
        {
            "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
            "forecast_mw": 1000.0,
            "actual_mw": 800.0,
            "error_mw": 200.0,
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 16.5,
        },
        {
            "start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC),
            "forecast_mw": 2000.0,
            "actual_mw": 2100.0,
            "error_mw": -100.0,
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 17.5,
        },
        {
            "start_time": datetime(2026, 1, 1, 2, 0, tzinfo=UTC),
            "forecast_mw": 3000.0,
            "actual_mw": 2700.0,
            "error_mw": 300.0,
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 18.5,
        },
        {
            "start_time": datetime(2026, 1, 1, 3, 0, tzinfo=UTC),
            "forecast_mw": 4000.0,
            "actual_mw": 4000.0,
            "error_mw": 0.0,
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 19.5,
        },
    ]
    return pd.DataFrame(rows)


def test_metrics_summary_hand_calculation() -> None:
    """Verify summary metrics match manual arithmetic on 4-point fixture exactly."""
    df = make_hand_test_df()
    s = summary(df)

    assert s.n == 4
    assert s.bias_mw == pytest.approx(100.0, abs=1e-5)
    assert s.mae_mw == pytest.approx(150.0, abs=1e-5)
    assert s.rmse_mw == pytest.approx(np.sqrt(35000), abs=1e-5)
    assert s.nmae_pct == pytest.approx(6.25, abs=1e-5)
    assert s.over_forecast_rate == pytest.approx(0.50, abs=1e-5)
    assert s.max_over_forecast is not None
    assert s.max_over_forecast.mw == 300.0
    assert s.max_over_forecast.ts == datetime(2026, 1, 1, 2, 0, tzinfo=UTC)
    assert s.max_under_forecast is not None
    assert s.max_under_forecast.mw == -100.0
    assert s.max_under_forecast.ts == datetime(2026, 1, 1, 1, 0, tzinfo=UTC)


def test_metrics_p90_on_known_array() -> None:
    """Verify P90 abs error matches numpy quantile on known 10-point array."""
    # |errors| = 10, 20, 30, 40, 50, 60, 70, 80, 90, 100
    # numpy default linear quantile at 0.9 on 10 values is 91.0
    rows = [
        {
            "start_time": datetime(2026, 1, 1, i, 0, tzinfo=UTC),
            "forecast_mw": float(1000 + (i + 1) * 10),
            "actual_mw": 1000.0,
            "error_mw": float((i + 1) * 10),
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 10.0,
        }
        for i in range(10)
    ]
    df = pd.DataFrame(rows)
    s = summary(df)
    assert s.p90_abs_error_mw == pytest.approx(91.0, abs=1e-5)


def test_empty_input_returns_n0_and_none_metrics() -> None:
    """Verify empty dataframe returns n=0 and None for all numerical metrics (never NaN)."""
    empty_df = pd.DataFrame(
        columns=["start_time", "forecast_mw", "actual_mw", "error_mw", "publish_time", "horizon_h"]
    )
    s = summary(empty_df)

    assert s.n == 0
    assert s.bias_mw is None
    assert s.mae_mw is None
    assert s.rmse_mw is None
    assert s.median_abs_error_mw is None
    assert s.p90_abs_error_mw is None
    assert s.p95_abs_error_mw is None
    assert s.nmae_pct is None
    assert s.over_forecast_rate is None
    assert s.max_over_forecast is None
    assert s.max_under_forecast is None
    assert s.corr is None


def test_zero_mean_actual_gives_none_nmae() -> None:
    """Verify when mean actual generation is <= 0, nMAE is None to prevent division by zero."""
    df = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "forecast_mw": 100.0,
                "actual_mw": 0.0,
                "error_mw": 100.0,
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "horizon_h": 10.0,
            }
        ]
    )
    s = summary(df)
    assert s.n == 1
    assert s.mae_mw == 100.0
    assert s.nmae_pct is None  # Mean actual is 0.0 -> None


def test_by_level_handles_ties_and_fewer_unique_values() -> None:
    """Verify by_level handles identical forecast values and small datasets cleanly."""
    # All forecasts identical: 1000.0 MW
    rows = [
        {
            "start_time": datetime(2026, 1, 1, i, 0, tzinfo=UTC),
            "forecast_mw": 1000.0,
            "actual_mw": 900.0 + i * 10,
            "error_mw": 100.0 - i * 10,
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "horizon_h": 10.0,
        }
        for i in range(10)
    ]
    df = pd.DataFrame(rows)
    levels = by_level(df, bins=5)

    assert len(levels) >= 1
    assert sum(p.n for p in levels) == 10


def test_by_horizon_coverage_pct_falls_when_targets_lack_long_lead_forecasts() -> None:
    """Verify by_horizon calculates n, n_expected, coverage_pct, and metrics across lead times."""
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 4, 0, tzinfo=UTC)  # 4 expected hours: 00, 01, 02, 03

    # Actuals for all 4 hours
    actuals = pd.DataFrame(
        [
            {"start_time": datetime(2026, 1, 1, h, 0, tzinfo=UTC), "actual_mw": 1000.0}
            for h in range(4)
        ]
    )

    # Forecasts:
    # All 4 hours have forecasts at H=10
    # But only 03:00 has a forecast at H=30
    fc_rows = []
    for h in range(4):
        fc_rows.append(
            {
                "start_time": datetime(2026, 1, 1, h, 0, tzinfo=UTC),
                "publish_time": datetime(2026, 1, 1, h, 0, tzinfo=UTC) - pd.Timedelta(hours=10),
                "forecast_mw": 1100.0,
                "horizon_h": 10.0,
            }
        )
    # Only target 03:00 has H=30
    fc_rows.append(
        {
            "start_time": datetime(2026, 1, 1, 3, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 1, 3, 0, tzinfo=UTC) - pd.Timedelta(hours=30),
            "forecast_mw": 1200.0,
            "horizon_h": 30.0,
        }
    )
    fc = pd.DataFrame(fc_rows)

    points = by_horizon(fc, actuals, start_eval, end_eval, max_h=30, step=10)

    # Points for H = 0, 10, 20, 30
    h_map = {p.horizon_hours: p for p in points}
    assert 0 in h_map
    assert 10 in h_map
    assert 30 in h_map

    # At H=10: all 4 hours covered -> coverage_pct = 100.0%
    assert h_map[10].n == 4
    assert h_map[10].n_expected == 4
    assert h_map[10].coverage_pct == 100.0

    # At H=30: only 1 hour covered -> coverage_pct = 25.0%
    assert h_map[30].n == 1
    assert h_map[30].n_expected == 4
    assert h_map[30].coverage_pct == 25.0


def test_by_hour_computes_24_points() -> None:
    """Verify by_hour returns 24 points covering all London hours."""
    df = make_hand_test_df()
    hours = by_hour(df)

    assert len(hours) == 24
    # Hours 00:00, 01:00, 02:00, 03:00 have n=1
    for h in [0, 1, 2, 3]:
        assert hours[h].n == 1
        assert hours[h].mae_mw is not None
    # Other hours have n=0
    assert hours[10].n == 0
    assert hours[10].mae_mw is None

    empty_hours = by_hour(pd.DataFrame(columns=df.columns))
    assert len(empty_hours) == 24
    assert empty_hours[0].n == 0


def test_distribution_bins_and_quantiles() -> None:
    """Verify distribution generates histogram bins and quantiles."""
    df = make_hand_test_df()
    dist = distribution(df, bin_width_mw=100.0)

    assert len(dist.bins) > 0
    assert sum(b.count for b in dist.bins) == 4
    assert dist.p50_mw is not None

    empty_dist = distribution(pd.DataFrame(columns=df.columns))
    assert len(empty_dist.bins) == 0
    assert empty_dist.p50_mw is None


def test_heatmap_generates_cells() -> None:
    """Verify heatmap generates cells for present days and hours."""
    df = make_hand_test_df()
    cells = heatmap(df)

    assert len(cells) == 4
    assert cells[0].date == "2026-01-01"
    assert cells[0].mae_mw is not None

    empty_cells = heatmap(pd.DataFrame(columns=df.columns))
    assert len(empty_cells) == 0


def test_by_level_empty_and_by_horizon_empty() -> None:
    """Verify empty inputs to by_level and by_horizon are handled cleanly."""
    empty_df = pd.DataFrame(columns=["start_time", "forecast_mw", "actual_mw", "error_mw"])
    assert by_level(empty_df) == []

    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 4, 0, tzinfo=UTC)
    assert by_horizon(empty_df, empty_df, start_eval, end_eval) == []


def test_by_horizon_empty_subsets_and_unmatched_targets() -> None:
    """Verify by_horizon branches when H is beyond max horizon or targets are unmatched."""
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 2, 0, tzinfo=UTC)

    # Actuals for target 00:00
    act = pd.DataFrame(
        [{"start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC), "actual_mw": 1000.0}]
    )
    # Forecast for target 01:00 (no match with actuals at 00:00) with horizon 5.0
    fc = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC),
                "forecast_mw": 1100.0,
                "horizon_h": 5.0,
            }
        ]
    )

    # Test H = 0 (n=0 after merge) and H = 10 (eligible.empty)
    pts = by_horizon(fc, act, start_eval, end_eval, max_h=10, step=5)
    assert len(pts) == 3  # H = 0, 5, 10
    assert pts[0].n == 0
    assert pts[0].coverage_pct == 0.0
    assert pts[2].n == 0
    assert pts[2].coverage_pct == 0.0

    # fc_sub.empty when forecasts are outside start_eval..end_eval
    fc_outside = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 2, 1, 0, 0, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "horizon_h": 5.0,
            }
        ]
    )
    assert by_horizon(fc_outside, act, start_eval, end_eval) == []


def test_distribution_identical_errors() -> None:
    """Verify distribution handles identical errors (start_edge == end_edge)."""
    df = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "actual_mw": 900.0,
                "error_mw": 100.0,
            },
            {
                "start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "actual_mw": 900.0,
                "error_mw": 100.0,
            },
        ]
    )
    dist = distribution(df, bin_width_mw=500.0)
    assert len(dist.bins) == 1
    assert dist.bins[0].count == 2


def test_heatmap_all_missing_day_returns_none_cells() -> None:
    """Verify heatmap returns empty cells and service layer produces None for all 24 hours."""
    empty_df = pd.DataFrame(columns=["start_time", "forecast_mw", "actual_mw", "error_mw"])
    cells = heatmap(empty_df)
    assert cells == []

    cell_map = {(c.date, c.hour_local): c.mae_mw for c in cells}
    day_values = [cell_map.get(("2026-01-01", h)) for h in range(24)]
    assert len(day_values) == 24
    assert all(v is None for v in day_values)


def test_by_hour_missing_hours_return_none() -> None:
    """Verify fixture with no data in some local hours returns n = 0 and None for metrics."""
    # Data present only for hours 0 and 12
    df = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "actual_mw": 800.0,
                "error_mw": 200.0,
            },
            {
                "start_time": datetime(2026, 1, 1, 12, 0, tzinfo=UTC),
                "forecast_mw": 1500.0,
                "actual_mw": 1200.0,
                "error_mw": 300.0,
            },
        ]
    )
    hours = by_hour(df)
    assert len(hours) == 24
    # Present hours
    assert hours[0].n == 1
    assert hours[0].mae_mw == 200.0
    assert hours[12].n == 1
    assert hours[12].mae_mw == 300.0
    # Missing hours (e.g. 1..11, 13..23)
    missing_indices = [h for h in range(24) if h not in (0, 12)]
    for h in missing_indices:
        assert hours[h].n == 0
        assert hours[h].mae_mw is None
        assert hours[h].bias_mw is None
        assert hours[h].rmse_mw is None
