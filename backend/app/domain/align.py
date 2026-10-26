"""Alignment of selected forecasts with actuals on the hourly evaluation grid.

Implements rules defined in docs/DOMAIN.md §3, §4.3 (ADR-011) and docs/SYSTEM_DESIGN.md §4.
"""

from dataclasses import dataclass
from datetime import datetime

import pandas as pd

from app.domain.timeutil import expected_hourly_targets

MATCHED_COLUMNS = [
    "start_time",
    "forecast_mw",
    "actual_mw",
    "error_mw",
    "publish_time",
    "horizon_h",
]


@dataclass(frozen=True)
class Coverage:
    """Coverage statistics for an aligned evaluation window."""

    n_expected: int
    n_matched: int
    n_missing_actual: int
    n_missing_forecast: int


def align(
    selected: pd.DataFrame,
    actuals: pd.DataFrame,
    start: datetime,
    end: datetime,
) -> tuple[pd.DataFrame, Coverage]:
    """Align selected forecasts with actuals via an inner join on hourly start_time.

    Per ADR-011:
    - Inner joins only on hourly (:00) timestamps within [start, end).
    - Ignores half-hourly (:30) actuals without synthesis or forward-filling.
    - Error sign convention: error_mw = forecast_mw - actual_mw (positive = over-forecast).

    See docs/DOMAIN.md §3 and §4.3.

    Args:
        selected: Selected forecasts with start_time, publish_time, forecast_mw, horizon_h.
        actuals: Cleaned actuals with start_time, actual_mw.
        start: Inclusive evaluation window start (UTC).
        end: Exclusive evaluation window end (UTC).

    Returns:
        Tuple of (matched_df, coverage).
    """
    expected_list = expected_hourly_targets(start, end)
    expected_set = set(expected_list)
    n_expected = len(expected_list)

    if n_expected == 0 or selected.empty or actuals.empty:
        empty_df = pd.DataFrame(columns=MATCHED_COLUMNS)
        cov = Coverage(
            n_expected=n_expected,
            n_matched=0,
            n_missing_actual=n_expected
            if actuals.empty
            else len(expected_set - set(actuals["start_time"])),
            n_missing_forecast=n_expected
            if selected.empty
            else len(expected_set - set(selected["start_time"])),
        )
        return empty_df, cov

    # Filter to evaluation window expected hourly targets
    sel_sub = selected[selected["start_time"].isin(expected_set)].copy()
    act_sub = actuals[actuals["start_time"].isin(expected_set)][["start_time", "actual_mw"]].copy()

    # Inner join on hourly start_time
    matched = pd.merge(sel_sub, act_sub, on="start_time", how="inner")

    if matched.empty:
        empty_df = pd.DataFrame(columns=MATCHED_COLUMNS)
        cov = Coverage(
            n_expected=n_expected,
            n_matched=0,
            n_missing_actual=len(expected_set - set(act_sub["start_time"])),
            n_missing_forecast=len(expected_set - set(sel_sub["start_time"])),
        )
        return empty_df, cov

    # Sign convention: error_mw = forecast_mw - actual_mw
    matched["error_mw"] = matched["forecast_mw"] - matched["actual_mw"]

    # Deterministic sort and column order
    matched = matched.sort_values("start_time", ascending=True).reset_index(drop=True)
    matched = matched[MATCHED_COLUMNS]

    # Coverage accounting
    n_matched = len(matched)
    fc_present = set(sel_sub["start_time"])
    act_present = set(act_sub["start_time"])
    n_missing_fc = len(expected_set - fc_present)
    n_missing_act = len(expected_set - act_present)

    cov = Coverage(
        n_expected=n_expected,
        n_matched=n_matched,
        n_missing_actual=n_missing_act,
        n_missing_forecast=n_missing_fc,
    )
    return matched, cov
