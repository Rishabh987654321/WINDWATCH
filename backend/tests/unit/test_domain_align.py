"""Unit tests for align module proving hourly inner join and coverage accounting."""

from datetime import UTC, datetime

import pandas as pd

from app.domain.align import align


def test_align_inner_join_ignores_half_hour_actuals() -> None:
    """Verify align inner-joins strictly on hourly targets and ignores :30 actuals.

    Per ADR-011: WINDFOR is hourly, FUELHH is half-hourly.
    Metrics operate only on the :00 inner join without synthesizing/forward-filling :30.
    """
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(
        2026, 1, 1, 3, 0, tzinfo=UTC
    )  # 3 expected hourly targets: 00:00, 01:00, 02:00

    selected_fc = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "horizon_h": 16.5,
            },
            {
                "start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1100.0,
                "horizon_h": 17.5,
            },
            {
                "start_time": datetime(2026, 1, 1, 2, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1200.0,
                "horizon_h": 18.5,
            },
        ]
    )

    # Actuals contain both :00 and :30
    actuals = pd.DataFrame(
        [
            {"start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC), "actual_mw": 900.0},
            {"start_time": datetime(2026, 1, 1, 0, 30, tzinfo=UTC), "actual_mw": 950.0},
            {"start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC), "actual_mw": 1050.0},
            {"start_time": datetime(2026, 1, 1, 1, 30, tzinfo=UTC), "actual_mw": 1100.0},
            {"start_time": datetime(2026, 1, 1, 2, 0, tzinfo=UTC), "actual_mw": 1150.0},
            {"start_time": datetime(2026, 1, 1, 2, 30, tzinfo=UTC), "actual_mw": 1200.0},
        ]
    )

    matched, cov = align(selected_fc, actuals, start_eval, end_eval)

    assert len(matched) == 3
    # Check error sign convention: forecast - actual
    # 00:00: 1000.0 - 900.0 = +100.0
    # 01:00: 1100.0 - 1050.0 = +50.0
    # 02:00: 1200.0 - 1150.0 = +50.0
    assert list(matched["error_mw"]) == [100.0, 50.0, 50.0]
    assert cov.n_expected == 3
    assert cov.n_matched == 3
    assert cov.n_missing_actual == 0
    assert cov.n_missing_forecast == 0


def test_coverage_counts_missing_actual_and_forecast() -> None:
    """Verify Coverage dataclass accurately records missing actuals and missing forecasts."""
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 4, 0, tzinfo=UTC)  # 4 expected: 00:00, 01:00, 02:00, 03:00

    # Missing forecast at 01:00
    selected_fc = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "horizon_h": 16.5,
            },
            {
                "start_time": datetime(2026, 1, 1, 2, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1200.0,
                "horizon_h": 18.5,
            },
            {
                "start_time": datetime(2026, 1, 1, 3, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1300.0,
                "horizon_h": 19.5,
            },
        ]
    )

    # Missing actual at 03:00
    actuals = pd.DataFrame(
        [
            {"start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC), "actual_mw": 900.0},
            {"start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC), "actual_mw": 1050.0},
            {"start_time": datetime(2026, 1, 1, 2, 0, tzinfo=UTC), "actual_mw": 1150.0},
        ]
    )

    matched, cov = align(selected_fc, actuals, start_eval, end_eval)

    # Only 00:00 and 02:00 match both
    assert len(matched) == 2
    assert cov.n_expected == 4
    assert cov.n_matched == 2
    assert cov.n_missing_forecast == 1  # 01:00 missing forecast
    assert cov.n_missing_actual == 1  # 03:00 missing actual


def test_align_empty_inputs_returns_empty_matched() -> None:
    """Verify align handles empty DataFrames without failing."""
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 2, 0, tzinfo=UTC)
    empty_df = pd.DataFrame()

    matched, cov = align(empty_df, empty_df, start_eval, end_eval)
    assert len(matched) == 0
    assert cov.n_expected == 2
    assert cov.n_matched == 0


def test_align_non_overlapping_inputs() -> None:
    """Verify align handles non-overlapping forecast and actual timestamps cleanly."""
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 1, 1, 2, 0, tzinfo=UTC)

    fc = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 1, 0, 0, tzinfo=UTC),
                "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
                "forecast_mw": 1000.0,
                "horizon_h": 16.5,
            }
        ]
    )
    act = pd.DataFrame([{"start_time": datetime(2026, 1, 1, 1, 0, tzinfo=UTC), "actual_mw": 900.0}])

    matched, cov = align(fc, act, start_eval, end_eval)
    assert len(matched) == 0
    assert cov.n_expected == 2
    assert cov.n_matched == 0


def test_error_sign_is_forecast_minus_actual() -> None:
    """Explicit hand-computed 2-point test proving error_mw = forecast_mw - actual_mw.

    Per docs/DOMAIN.md §3: positive error indicates an over-forecast (forecast > actual),
    negative error indicates an under-forecast (forecast < actual).
    Point 1 (over-forecast):  forecast = 12000 MW, actual = 10000 MW -> error = +2000 MW.
    Point 2 (under-forecast): forecast =  8000 MW, actual =  9500 MW -> error = -1500 MW.
    """
    t1 = datetime(2026, 1, 1, 10, 0, tzinfo=UTC)
    t2 = datetime(2026, 1, 1, 11, 0, tzinfo=UTC)

    fc = pd.DataFrame(
        [
            {"start_time": t1, "publish_time": t1, "forecast_mw": 12000.0, "horizon_h": 24.0},
            {"start_time": t2, "publish_time": t2, "forecast_mw": 8000.0, "horizon_h": 24.0},
        ]
    )
    act = pd.DataFrame(
        [
            {"start_time": t1, "actual_mw": 10000.0},
            {"start_time": t2, "actual_mw": 9500.0},
        ]
    )

    matched, cov = align(fc, act, t1, datetime(2026, 1, 1, 12, 0, tzinfo=UTC))

    assert len(matched) == 2
    assert matched.loc[matched["start_time"] == t1, "error_mw"].iloc[0] == 2000.0
    assert matched.loc[matched["start_time"] == t2, "error_mw"].iloc[0] == -1500.0
