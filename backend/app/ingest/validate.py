"""Validation checks for actuals and forecasts time grids and coverage."""

from datetime import UTC, datetime
from typing import Any

import pandas as pd


class ValidationError(Exception):
    """Raised when data integrity assertions fail."""

    pass


def validate_actuals_grid(
    df_actuals: pd.DataFrame,
    start_dt: datetime,
    end_dt: datetime,
) -> dict[str, Any]:
    """Validate that actuals cover a 30-minute time grid and report any gaps.

    Args:
        df_actuals: Cleaned actuals DataFrame with 'start_time'.
        start_dt: Start of target window (inclusive).
        end_dt: End of target window (exclusive).

    Returns:
        Dict with total_expected, total_present, missing_periods (list of ISO strings).
    """
    if start_dt.tzinfo is None:
        start_dt = start_dt.replace(tzinfo=UTC)
    if end_dt.tzinfo is None:
        end_dt = end_dt.replace(tzinfo=UTC)

    # Generate expected 30-minute sequence
    expected_range = pd.date_range(
        start=start_dt,
        end=end_dt,
        freq="30min",
        inclusive="left",
        tz="UTC",
    )
    expected_set: set[pd.Timestamp] = set(expected_range)
    actual_set: set[pd.Timestamp] = set(df_actuals["start_time"]) if not df_actuals.empty else set()

    missing = sorted(expected_set - actual_set)
    extra = sorted(actual_set - expected_set)

    return {
        "n_expected_periods": len(expected_range),
        "n_present_periods": len(actual_set.intersection(expected_set)),
        "n_missing_periods": len(missing),
        "missing_periods": [ts.isoformat() for ts in missing],
        "n_extra_periods": len(extra),
    }


def validate_forecasts_grid(
    df_forecasts: pd.DataFrame,
    eval_start: datetime,
    eval_end: datetime,
) -> dict[str, Any]:
    """Validate that forecasts have hourly target coverage for evaluation window.

    Args:
        df_forecasts: Cleaned forecasts DataFrame with 'start_time'.
        eval_start: Start of evaluation window (e.g. 2026-01-01T00:00:00Z).
        eval_end: End of evaluation window (e.g. 2026-02-01T00:00:00Z).

    Returns:
        Dict with evaluation window expected hours, covered hours, missing hours.
    """
    if eval_start.tzinfo is None:
        eval_start = eval_start.replace(tzinfo=UTC)
    if eval_end.tzinfo is None:
        eval_end = eval_end.replace(tzinfo=UTC)

    # All forecast target start_times must have minute == 0 and second == 0
    non_hourly_targets: list[str] = []
    if not df_forecasts.empty:
        non_hourly = df_forecasts[
            (df_forecasts["start_time"].dt.minute != 0)
            | (df_forecasts["start_time"].dt.second != 0)
        ]
        non_hourly_targets = [ts.isoformat() for ts in non_hourly["start_time"].unique()[:10]]

    # Expected hourly target range
    expected_hours = pd.date_range(
        start=eval_start,
        end=eval_end,
        freq="1h",
        inclusive="left",
        tz="UTC",
    )
    expected_set: set[pd.Timestamp] = set(expected_hours)
    present_targets: set[pd.Timestamp] = (
        set(df_forecasts["start_time"].unique()) if not df_forecasts.empty else set()
    )

    missing_eval_hours = sorted(expected_set - present_targets)

    return {
        "n_expected_eval_hours": len(expected_hours),
        "n_covered_eval_hours": len(expected_set.intersection(present_targets)),
        "n_missing_eval_hours": len(missing_eval_hours),
        "missing_eval_hours": [ts.isoformat() for ts in missing_eval_hours],
        "non_hourly_target_count": len(non_hourly_targets),
        "sample_non_hourly_targets": non_hourly_targets,
    }
