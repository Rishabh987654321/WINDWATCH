"""Time utilities for London timezone day boundaries, cutoffs, and DST handling.

Implements rules defined in docs/DOMAIN.md §1 (Time and grid conventions) and §4.1.
All internal datetimes are tz-aware UTC.
"""

from datetime import UTC, date, datetime, time, timedelta
from zoneinfo import ZoneInfo

LONDON_TZ = ZoneInfo("Europe/London")


def london_date(ts: datetime) -> date:
    """Extract the calendar date in Europe/London timezone.

    See docs/DOMAIN.md §1.

    Args:
        ts: Tz-aware datetime.

    Returns:
        date in Europe/London.
    """
    if ts.tzinfo is None:
        raise ValueError("Timestamp must be tz-aware.")
    return ts.astimezone(LONDON_TZ).date()


def delivery_day_bounds(d: date) -> tuple[datetime, datetime]:
    """Calculate the UTC start and end bounds for a London calendar delivery day.

    Start is midnight 00:00:00 London time converted to UTC.
    End is midnight 00:00:00 next day London time converted to UTC.
    Handles 23-hour and 25-hour days on DST transitions cleanly.

    See docs/DOMAIN.md §1.

    Args:
        d: Calendar delivery date in Europe/London.

    Returns:
        Tuple of (start_utc, end_utc) both tz-aware in UTC.
    """
    dt_local_start = datetime(d.year, d.month, d.day, 0, 0, 0, tzinfo=LONDON_TZ)
    next_day = d + timedelta(days=1)
    dt_local_end = datetime(next_day.year, next_day.month, next_day.day, 0, 0, 0, tzinfo=LONDON_TZ)

    start_utc = dt_local_start.astimezone(UTC)
    end_utc = dt_local_end.astimezone(UTC)
    return start_utc, end_utc


def cutoff_utc(delivery_date: date, cutoff_local: time) -> datetime:
    """Calculate the decision cutoff timestamp in UTC for delivery day D.

    The decision cutoff occurs on D-1 at cutoff_local Europe/London time.
    See docs/DOMAIN.md §4.1 (Policy B: Day-ahead decision cutoff).

    Args:
        delivery_date: Delivery day D.
        cutoff_local: Time of day in Europe/London (e.g. 09:00).

    Returns:
        Tz-aware UTC datetime for the decision cutoff.
    """
    d_prev = delivery_date - timedelta(days=1)
    dt_local = datetime(
        d_prev.year,
        d_prev.month,
        d_prev.day,
        cutoff_local.hour,
        cutoff_local.minute,
        cutoff_local.second,
        tzinfo=LONDON_TZ,
    )
    return dt_local.astimezone(UTC)


def expected_hourly_targets(start: datetime, end: datetime) -> list[datetime]:
    """Generate expected hourly target timestamps in [start, end).

    Each target represents the start of a 1-hour delivery period.
    The number of periods is exactly 24 for standard days, 23 on Spring DST,
    and 25 on Autumn DST.

    See docs/DOMAIN.md §1 & §4.1.

    Args:
        start: Inclusive start timestamp in UTC.
        end: Exclusive end timestamp in UTC.

    Returns:
        List of hourly UTC datetimes.
    """
    if start.tzinfo is None or end.tzinfo is None:
        raise ValueError("Timestamps must be tz-aware.")
    if start >= end:
        return []

    targets: list[datetime] = []
    current = start
    while current < end:
        targets.append(current)
        current += timedelta(hours=1)
    return targets
