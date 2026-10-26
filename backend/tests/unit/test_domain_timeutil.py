"""Unit tests for timeutil module proving time zone conversions and DST handling."""

from datetime import UTC, date, datetime, time
from zoneinfo import ZoneInfo

import pytest

from app.domain.timeutil import (
    cutoff_utc,
    delivery_day_bounds,
    expected_hourly_targets,
    london_date,
)

LONDON_TZ = ZoneInfo("Europe/London")


def test_delivery_day_bounds_utc_in_january_equal_london() -> None:
    """Verify in winter (GMT) London delivery day matches UTC 00:00 to 00:00 next day."""
    d = date(2026, 1, 15)
    start_utc, end_utc = delivery_day_bounds(d)

    assert start_utc == datetime(2026, 1, 15, 0, 0, tzinfo=UTC)
    assert end_utc == datetime(2026, 1, 16, 0, 0, tzinfo=UTC)
    assert start_utc.tzinfo == UTC
    assert end_utc.tzinfo == UTC


def test_london_date_extracts_correct_calendar_day() -> None:
    """Verify london_date converts UTC datetime to Europe/London calendar date."""
    # 2026-07-01 23:30 UTC is 2026-07-02 00:30 BST
    summer_ts = datetime(2026, 7, 1, 23, 30, tzinfo=UTC)
    assert london_date(summer_ts) == date(2026, 7, 2)

    # 2026-01-15 23:30 UTC is 2026-01-15 23:30 GMT
    winter_ts = datetime(2026, 1, 15, 23, 30, tzinfo=UTC)
    assert london_date(winter_ts) == date(2026, 1, 15)


def test_cutoff_uses_london_time_on_dst_days() -> None:
    """Verify cutoff on D-1 converts London local time to UTC cleanly across GMT and BST.

    - In GMT (e.g. 2026-01-15 delivery, cutoff on 2026-01-14 at 09:00 London):
      09:00 London == 09:00 UTC.
    - In BST (e.g. 2026-07-15 delivery, cutoff on 2026-07-14 at 09:00 London):
      09:00 London == 08:00 UTC.
    """
    d_winter = date(2026, 1, 15)
    c_winter = cutoff_utc(d_winter, time(9, 0))
    assert c_winter == datetime(2026, 1, 14, 9, 0, tzinfo=UTC)

    d_summer = date(2026, 7, 15)
    c_summer = cutoff_utc(d_summer, time(9, 0))
    assert c_summer == datetime(2026, 7, 14, 8, 0, tzinfo=UTC)


def test_expected_hourly_targets_on_dst_days() -> None:
    """Verify hourly targets count 24 normally, 23 on spring DST clock-forward, 25 on autumn clock-back.

    UK DST 2026:
    - 2026-03-29: Spring forward at 01:00 GMT to 02:00 BST -> 23 hours in the day.
    - 2026-10-25: Fall back at 02:00 BST to 01:00 GMT -> 25 hours in the day.
    """
    # Standard winter day
    s24, e24 = delivery_day_bounds(date(2026, 1, 15))
    targets_24 = expected_hourly_targets(s24, e24)
    assert len(targets_24) == 24

    # Spring DST day (23 hours)
    s23, e23 = delivery_day_bounds(date(2026, 3, 29))
    targets_23 = expected_hourly_targets(s23, e23)
    assert len(targets_23) == 23

    # Autumn DST day (25 hours)
    s25, e25 = delivery_day_bounds(date(2026, 10, 25))
    targets_25 = expected_hourly_targets(s25, e25)
    assert len(targets_25) == 25


def test_timeutil_exceptions() -> None:
    """Verify exceptions on naive timestamps or invalid start/end ranges."""
    with pytest.raises(ValueError):
        london_date(datetime(2026, 1, 1, 0, 0))  # naive

    with pytest.raises(ValueError):
        expected_hourly_targets(datetime(2026, 1, 1, 0, 0), datetime(2026, 1, 2, 0, 0))  # naive

    s = datetime(2026, 1, 2, 0, 0, tzinfo=UTC)
    e = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    assert expected_hourly_targets(s, e) == []
