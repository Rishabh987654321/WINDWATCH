"""Forecast selection policies for day-ahead decision cutoff and lead time horizons.

Implements rules defined in docs/DOMAIN.md §4.1, §4.2, and docs/SYSTEM_DESIGN.md §4.
All functions are pure, leak-free, and operate on pandas DataFrames.
"""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

import pandas as pd

from app.domain.timeutil import cutoff_utc

LONDON_TZ = ZoneInfo("Europe/London")

OUTPUT_COLUMNS = ["start_time", "publish_time", "forecast_mw", "horizon_h"]


def select_lead_time(fc: pd.DataFrame, H: float) -> pd.DataFrame:
    """Select the latest forecast published with horizon_h >= H for each target.

    Policy A (Lead-time evaluation grid):
    Returns at most one forecast row per target start_time.
    Since horizon_h = (start_time - publish_time)/1h, the smallest horizon >= H
    corresponds to the latest publication that was available >= H hours ahead.

    See docs/DOMAIN.md §4.2 and docs/SYSTEM_DESIGN.md §4.1.

    Args:
        fc: Cleaned forecasts DataFrame containing start_time, publish_time,
            forecast_mw, and horizon_h.
        H: Minimum lead time in hours (H >= 0).

    Returns:
        DataFrame with one row per target, subset of OUTPUT_COLUMNS.
    """
    if fc.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    # Filter forecasts published at least H hours ahead
    eligible = fc[fc["horizon_h"] >= H]

    if eligible.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    # Sort by start_time asc, horizon_h asc
    # Smallest horizon >= H is the latest publish_time
    sorted_df = eligible.sort_values(
        ["start_time", "horizon_h", "publish_time"],
        ascending=[True, True, False],
    )
    result = sorted_df.drop_duplicates(subset=["start_time"], keep="first")
    return result[OUTPUT_COLUMNS].reset_index(drop=True)


def select_day_ahead(fc: pd.DataFrame, cutoff_local: time) -> pd.DataFrame:
    """Select the latest forecast available at decision cutoff on D-1 for delivery day D.

    Policy B (Day-ahead decision-time):
    For each target period t in delivery day D (London local date):
      cutoff(D) = D - 1 day at cutoff_local Europe/London time converted to UTC.
    Only forecasts with publish_time <= cutoff(D) are eligible.
    Picks the latest eligible publish_time per target.
    Targets with no forecast published before the cutoff are absent (NO BACKFILL).

    See docs/DOMAIN.md §4.1, §4.2, and docs/SYSTEM_DESIGN.md §4.2.

    Args:
        fc: Cleaned forecasts DataFrame.
        cutoff_local: Time of day in London timezone (e.g. 09:00).

    Returns:
        DataFrame with one row per target satisfying the cutoff, subset of OUTPUT_COLUMNS.
    """
    if fc.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    # Ensure tz-aware datetimes
    df = fc.copy()
    if df["start_time"].dt.tz is None:
        df["start_time"] = df["start_time"].dt.tz_localize(UTC)
    if df["publish_time"].dt.tz is None:
        df["publish_time"] = df["publish_time"].dt.tz_localize(UTC)

    # Vectorised cutoff calculation per delivery date
    # Extract London delivery date using fast vectorized tz_convert
    london_dates = df["start_time"].dt.tz_convert(LONDON_TZ).dt.date
    unique_dates = set(london_dates.unique())
    date_to_cutoff_utc: dict[date, datetime] = {
        d: cutoff_utc(d, cutoff_local) for d in unique_dates
    }

    cutoff_series = london_dates.map(date_to_cutoff_utc)

    # Strict leakage filter: publish_time <= cutoff(D)
    eligible: pd.DataFrame = df[df["publish_time"] <= cutoff_series]

    if eligible.empty:
        return pd.DataFrame(columns=OUTPUT_COLUMNS)

    # Latest publication per start_time
    sorted_df = eligible.sort_values(
        ["start_time", "publish_time"],
        ascending=[True, True],
    )
    result = sorted_df.drop_duplicates(subset=["start_time"], keep="last")
    out_df = pd.DataFrame(result[OUTPUT_COLUMNS].reset_index(drop=True))
    return out_df
