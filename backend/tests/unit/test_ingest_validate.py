"""Unit tests for time grid validation."""

from datetime import UTC, datetime

import pandas as pd

from app.ingest.validate import validate_actuals_grid, validate_forecasts_grid


def test_validate_reports_gaps_without_filling() -> None:
    """Verify validate_actuals_grid identifies and reports missing periods without filling them."""
    start_dt = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_dt = datetime(
        2026, 1, 1, 2, 0, tzinfo=UTC
    )  # Expected: 00:00, 00:30, 01:00, 01:30 (4 periods)

    # DataFrame missing 00:30 and 01:30
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(
                ["2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z"], utc=True
            ),
            "actual_mw": [100.0, 110.0],
        }
    )

    result = validate_actuals_grid(df, start_dt, end_dt)

    assert result["n_expected_periods"] == 4
    assert result["n_present_periods"] == 2
    assert result["n_missing_periods"] == 2
    assert "2026-01-01T00:30:00+00:00" in result["missing_periods"]
    assert "2026-01-01T01:30:00+00:00" in result["missing_periods"]


def test_validate_forecasts_grid_detects_non_hourly_targets() -> None:
    """Verify validate_forecasts_grid flags non-hourly forecast target start_times."""
    eval_start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    eval_end = datetime(2026, 1, 1, 3, 0, tzinfo=UTC)  # 3 hours

    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(
                [
                    "2026-01-01T00:00:00Z",
                    "2026-01-01T01:30:00Z",  # Non-hourly (:30)
                    "2026-01-01T02:00:00Z",
                ],
                utc=True,
            ),
            "forecast_mw": [1000.0, 1100.0, 1200.0],
        }
    )

    result = validate_forecasts_grid(df, eval_start, eval_end)

    assert result["non_hourly_target_count"] == 1
    assert "2026-01-01T01:30:00+00:00" in result["sample_non_hourly_targets"]


def test_validate_naive_datetimes_converted_to_utc() -> None:
    """Verify naive datetimes are handled cleanly without error."""
    start_dt = datetime(2026, 1, 1, 0, 0)
    end_dt = datetime(2026, 1, 1, 1, 0)
    df = pd.DataFrame(
        {
            "start_time": pd.to_datetime(["2026-01-01T00:00:00Z"], utc=True),
            "actual_mw": [100.0],
        }
    )
    res_actuals = validate_actuals_grid(df, start_dt, end_dt)
    assert res_actuals["n_expected_periods"] == 2

    res_forecasts = validate_forecasts_grid(df, start_dt, end_dt)
    assert res_forecasts["n_expected_eval_hours"] == 1
