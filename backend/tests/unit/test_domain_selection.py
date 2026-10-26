"""Unit tests for forecast selection policies (lead_time and day_ahead).

Implements and proves rules from docs/DOMAIN.md §4.1, §4.2, and ADR-012.
Includes property tests with hypothesis to prove NO DATA LEAKAGE.
"""

from datetime import UTC, datetime, time

import pandas as pd
from hypothesis import given
from hypothesis import strategies as st

from app.domain.selection import select_day_ahead, select_lead_time


def make_sample_forecasts() -> pd.DataFrame:
    """Create a sample forecasts dataframe with multiple vintages for a target.

    Target: 2026-01-02 12:00:00 UTC (Delivery Day D = 2026-01-02).
    Cutoff on D-1 (2026-01-01) at 09:00 London = 2026-01-01 09:00 UTC.
    Publications:
    - 2025-12-31 07:30 UTC: horizon = 52.5h, mw = 1000
    - 2026-01-01 04:30 UTC: horizon = 31.5h, mw = 1100
    - 2026-01-01 07:30 UTC: horizon = 28.5h, mw = 1200  <-- latest before 09:00 cutoff
    - 2026-01-01 09:30 UTC: horizon = 26.5h, mw = 1300  <-- AFTER 09:00 cutoff
    - 2026-01-01 11:30 UTC: horizon = 24.5h, mw = 1400  <-- AFTER 09:00 cutoff
    - 2026-01-02 07:30 UTC: horizon = 4.5h, mw = 1500   <-- Same day morning
    """
    rows = [
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2025, 12, 31, 7, 30, tzinfo=UTC),
            "forecast_mw": 1000.0,
            "horizon_h": 52.5,
        },
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 1, 4, 30, tzinfo=UTC),
            "forecast_mw": 1100.0,
            "horizon_h": 31.5,
        },
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 1, 7, 30, tzinfo=UTC),
            "forecast_mw": 1200.0,
            "horizon_h": 28.5,
        },
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 1, 9, 30, tzinfo=UTC),
            "forecast_mw": 1300.0,
            "horizon_h": 26.5,
        },
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 1, 11, 30, tzinfo=UTC),
            "forecast_mw": 1400.0,
            "horizon_h": 24.5,
        },
        {
            "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
            "publish_time": datetime(2026, 1, 2, 7, 30, tzinfo=UTC),
            "forecast_mw": 1500.0,
            "horizon_h": 4.5,
        },
    ]
    df = pd.DataFrame(rows)
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)
    return df


def test_lead_time_picks_latest_publish_at_least_H_hours_before() -> None:
    """Verify select_lead_time selects the latest publication with horizon_h >= H."""
    df = make_sample_forecasts()

    # For H = 24.0:
    # Eligible rows have horizon_h >= 24.0 (52.5h, 31.5h, 28.5h, 26.5h, 24.5h)
    # The latest published among them is 2026-01-01 11:30 (horizon 24.5h, mw 1400.0)
    selected = select_lead_time(df, H=24.0)

    assert len(selected) == 1
    row = selected.iloc[0]
    assert row["horizon_h"] == 24.5
    assert row["forecast_mw"] == 1400.0
    assert row["publish_time"] == datetime(2026, 1, 1, 11, 30, tzinfo=UTC)


def test_lead_time_one_row_per_target() -> None:
    """Verify select_lead_time returns at most one row per target start_time."""
    df = make_sample_forecasts()
    # Add a second target
    row2 = {
        "start_time": datetime(2026, 1, 2, 13, 0, tzinfo=UTC),
        "publish_time": datetime(2026, 1, 1, 7, 30, tzinfo=UTC),
        "forecast_mw": 2000.0,
        "horizon_h": 29.5,
    }
    df2 = pd.concat([df, pd.DataFrame([row2])], ignore_index=True)

    selected = select_lead_time(df2, H=12.0)
    assert len(selected) == 2
    assert set(selected["start_time"]) == {
        datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
        datetime(2026, 1, 2, 13, 0, tzinfo=UTC),
    }


def test_lead_time_includes_exact_horizon_boundary() -> None:
    """Verify select_lead_time includes exact boundary horizon_h == H (>= H, not > H)."""
    df = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
                "publish_time": datetime(2026, 1, 1, 12, 0, tzinfo=UTC),
                "forecast_mw": 1500.0,
                "horizon_h": 24.0,  # Exact boundary
            },
            {
                "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
                "publish_time": datetime(2026, 1, 1, 8, 0, tzinfo=UTC),
                "forecast_mw": 1200.0,
                "horizon_h": 28.0,
            },
        ]
    )
    # With H = 24.0, the boundary forecast (horizon 24.0) must be selected
    selected = select_lead_time(df, H=24.0)
    assert len(selected) == 1
    assert selected.iloc[0]["horizon_h"] == 24.0
    assert selected.iloc[0]["forecast_mw"] == 1500.0


@given(
    H=st.floats(min_value=0.0, max_value=60.0),
)
def test_lead_time_never_returns_horizon_below_H(H: float) -> None:
    """Hypothesis property test: select_lead_time must never return a row with horizon_h < H."""
    df = make_sample_forecasts()
    selected = select_lead_time(df, H)
    if not selected.empty:
        assert (selected["horizon_h"] >= H).all()


def test_day_ahead_missing_when_no_forecast_before_cutoff_no_backfill() -> None:
    """Verify targets with NO forecast published before cutoff are dropped, never backfilled."""
    # Only a forecast published at 10:00 (after 09:00 cutoff)
    df = pd.DataFrame(
        [
            {
                "start_time": datetime(2026, 1, 2, 12, 0, tzinfo=UTC),
                "publish_time": datetime(2026, 1, 1, 10, 0, tzinfo=UTC),
                "forecast_mw": 1300.0,
                "horizon_h": 26.0,
            }
        ]
    )
    selected = select_day_ahead(df, cutoff_local=time(9, 0))
    # Must NOT backfill from the 10:00 forecast
    assert len(selected) == 0


def test_day_ahead_cutoff_between_0730_and_0930_selects_0730_run() -> None:
    """Verify that any cutoff in [07:30, 09:30) selects the 07:30 run."""
    df = make_sample_forecasts()

    for cutoff_hour in [8, 9]:
        sel = select_day_ahead(df, cutoff_local=time(cutoff_hour, 0))
        assert len(sel) == 1
        row = sel.iloc[0]
        # Should pick the 07:30 run (1200.0 MW)
        assert row["publish_time"] == datetime(2026, 1, 1, 7, 30, tzinfo=UTC)
        assert row["forecast_mw"] == 1200.0


def test_day_ahead_cutoff_0930_selects_0930_run() -> None:
    """Verify that cutoff at 09:30 or 10:00 selects the 09:30 run."""
    df = make_sample_forecasts()

    for cutoff_t in [time(9, 30), time(10, 0), time(11, 0)]:
        sel = select_day_ahead(df, cutoff_local=cutoff_t)
        assert len(sel) == 1
        row = sel.iloc[0]
        # Should pick the 09:30 run (1300.0 MW)
        assert row["publish_time"] == datetime(2026, 1, 1, 9, 30, tzinfo=UTC)
        assert row["forecast_mw"] == 1300.0


@given(
    cutoff_hour=st.integers(min_value=6, max_value=20),
    cutoff_minute=st.integers(min_value=0, max_value=59),
)
def test_day_ahead_never_uses_publish_after_cutoff(cutoff_hour: int, cutoff_minute: int) -> None:
    """Hypothesis property test (LEAKAGE TEST): Every selected row must satisfy publish_time <= cutoff(D)."""
    df = make_sample_forecasts()
    c_time = time(cutoff_hour, cutoff_minute)
    selected = select_day_ahead(df, cutoff_local=c_time)

    if not selected.empty:
        # Check every target
        for _, row in selected.iterrows():
            d = row["start_time"].date()
            # D-1 cutoff in UTC (winter date)
            c_utc = datetime(d.year, d.month, d.day - 1, cutoff_hour, cutoff_minute, tzinfo=UTC)
            assert row["publish_time"] <= c_utc


def test_selection_empty_inputs() -> None:
    """Verify select_lead_time and select_day_ahead handle empty DataFrames cleanly."""
    empty_df = pd.DataFrame(columns=["start_time", "publish_time", "forecast_mw", "horizon_h"])
    assert select_lead_time(empty_df, H=10.0).empty
    assert select_day_ahead(empty_df, cutoff_local=time(9, 0)).empty
