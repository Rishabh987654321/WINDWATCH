"""Query parameter validation models for WindWatch API.

All query models enforce extra='forbid' to reject unknown query parameters with 422.
"""

import re
from datetime import UTC, date, datetime, timedelta
from typing import Literal
from zoneinfo import ZoneInfo

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

LONDON_TZ = ZoneInfo("Europe/London")

# Permitted snapshot bounds
COVERAGE_START_DATE = date(2025, 12, 1)
COVERAGE_END_DATE = date(2026, 1, 31)
COVERAGE_START_UTC = datetime(2025, 12, 1, 0, 0, tzinfo=UTC)
COVERAGE_END_UTC = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)


def parse_date_or_datetime(val: str | None, is_end: bool = False) -> datetime | None:
    """Parse string as either YYYY-MM-DD (London day boundary) or ISO datetime in UTC."""
    if val is None or not val.strip():
        return None
    val = val.strip()

    # YYYY-MM-DD pattern
    if re.match(r"^\d{4}-\d{2}-\d{2}$", val):
        try:
            d = date.fromisoformat(val)
        except ValueError as e:
            raise ValueError(f"Invalid date format '{val}': must be YYYY-MM-DD") from e

        if is_end:
            # End date is inclusive of the whole London day, so exclusive upper bound is next day 00:00 London
            next_day = d + timedelta(days=1)
            dt_local = datetime(next_day.year, next_day.month, next_day.day, 0, 0, tzinfo=LONDON_TZ)
        else:
            dt_local = datetime(d.year, d.month, d.day, 0, 0, tzinfo=LONDON_TZ)
        return dt_local.astimezone(UTC)

    # ISO-8601 datetime pattern
    clean_val = val.replace("Z", "+00:00")
    try:
        dt = datetime.fromisoformat(clean_val)
        if dt.tzinfo is None:
            raise ValueError("Datetime must include timezone or Z")
        return dt.astimezone(UTC)
    except Exception as e:
        raise ValueError(
            f"Invalid timestamp format '{val}'. Expected YYYY-MM-DD or ISO-8601 UTC with Z."
        ) from e


def validate_cutoff_str(v: str | None) -> str | None:
    if v is None:
        return None
    if not re.match(r"^([01]\d|2[0-3]):[0-5]\d$", v):
        raise ValueError("cutoff must be in HH:MM format (00:00 to 23:59)")
    return v


class NoQueryParams(BaseModel):
    """Empty query parameter model rejecting any query parameters."""

    model_config = ConfigDict(extra="forbid")


class BaseQuery(BaseModel):
    """Base query model forbidding unexpected parameters."""

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class StandardFilterQuery(BaseQuery):
    """Shared filter query params for series and metrics endpoints."""

    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    policy: Literal["lead_time", "day_ahead"] = "lead_time"
    horizon_hours: float | None = Field(default=None, ge=0.0)
    cutoff: str | None = None

    @field_validator("cutoff")
    @classmethod
    def check_cutoff(cls, v: str | None) -> str | None:
        return validate_cutoff_str(v)

    @model_validator(mode="after")
    def validate_range_and_policy(self) -> "StandardFilterQuery":
        # Resolve defaults if not supplied
        start_utc = parse_date_or_datetime(self.from_, is_end=False)
        end_utc = parse_date_or_datetime(self.to, is_end=True)

        if start_utc is None:
            start_utc = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
        if end_utc is None:
            end_utc = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

        if start_utc >= end_utc:
            raise ValueError(
                f"'from' ({self.from_}) must be strictly earlier than 'to' ({self.to})"
            )

        # Range limit: <= 62 days
        if (end_utc - start_utc) > timedelta(days=62, hours=1):
            raise ValueError(
                f"Requested date range exceeds the 62-day limit: {(end_utc - start_utc).days} days"
            )

        # Coverage bounds check
        if start_utc < COVERAGE_START_UTC or end_utc > COVERAGE_END_UTC:
            raise ValueError(
                f"Requested range [{start_utc.isoformat()} .. {end_utc.isoformat()}] is outside available snapshot coverage "
                f"[{COVERAGE_START_UTC.isoformat()} .. {COVERAGE_END_UTC.isoformat()}]"
            )

        if self.policy == "lead_time":
            if self.horizon_hours is None:
                self.horizon_hours = 0.0
            if self.horizon_hours > 66.5:
                raise ValueError(
                    f"horizon_hours must be between 0 and 66.5; received {self.horizon_hours}"
                )
        elif self.policy == "day_ahead":
            if self.cutoff is None:
                self.cutoff = "09:00"

        return self


class ByHorizonQuery(BaseQuery):
    """Query params for /metrics/by-horizon."""

    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    step_hours: int = Field(default=1, ge=1, le=24)
    max_hours: int | None = Field(default=None, ge=1, le=66)

    @model_validator(mode="after")
    def validate_dates(self) -> "ByHorizonQuery":
        start_utc = parse_date_or_datetime(self.from_, is_end=False) or datetime(
            2026, 1, 1, 0, 0, tzinfo=UTC
        )
        end_utc = parse_date_or_datetime(self.to, is_end=True) or datetime(
            2026, 2, 1, 0, 0, tzinfo=UTC
        )

        if start_utc >= end_utc:
            raise ValueError("'from' must be strictly earlier than 'to'")
        if (end_utc - start_utc) > timedelta(days=62, hours=1):
            raise ValueError("Requested date range exceeds 62-day limit")
        if start_utc < COVERAGE_START_UTC or end_utc > COVERAGE_END_UTC:
            raise ValueError("Requested range outside snapshot coverage")
        return self


class ByLevelQuery(StandardFilterQuery):
    """Query params for /metrics/by-level."""

    bins: int = Field(default=5, ge=3, le=10)


class DistributionQuery(StandardFilterQuery):
    """Query params for /metrics/distribution."""

    bin_width_mw: float = Field(default=250.0, gt=0.0, le=5000.0)


class DayAheadQuery(BaseQuery):
    """Query params for /day-ahead/{delivery_date}."""

    cutoff: str = Field(default="09:00")
    risk_quantile: float = Field(default=0.90, ge=0.50, le=0.99)
    window_days: int = Field(default=28, ge=3, le=45)

    @field_validator("cutoff")
    @classmethod
    def check_cutoff(cls, v: str) -> str:
        res = validate_cutoff_str(v)
        assert res is not None
        return res


class CalibrationQuery(BaseQuery):
    """Query params for /day-ahead/calibration."""

    from_: str | None = Field(default=None, alias="from")
    to: str | None = None
    cutoff: str = Field(default="09:00")
    risk_quantile: float = Field(default=0.90, ge=0.50, le=0.99)
    window_days: int = Field(default=28, ge=3, le=45)

    @field_validator("cutoff")
    @classmethod
    def check_cutoff(cls, v: str) -> str:
        res = validate_cutoff_str(v)
        assert res is not None
        return res

    @model_validator(mode="after")
    def validate_dates(self) -> "CalibrationQuery":
        start_utc = parse_date_or_datetime(self.from_, is_end=False) or datetime(
            2026, 1, 1, 0, 0, tzinfo=UTC
        )
        end_utc = parse_date_or_datetime(self.to, is_end=True) or datetime(
            2026, 2, 1, 0, 0, tzinfo=UTC
        )

        if start_utc >= end_utc:
            raise ValueError("'from' must be strictly earlier than 'to'")
        if (end_utc - start_utc) > timedelta(days=62, hours=1):
            raise ValueError("Requested date range exceeds 62-day limit")
        if start_utc < COVERAGE_START_UTC or end_utc > COVERAGE_END_UTC:
            raise ValueError("Requested range outside snapshot coverage")
        return self


class VintagesQuery(BaseQuery):
    """Query params for /vintages."""

    target: str

    @field_validator("target")
    @classmethod
    def check_target(cls, v: str) -> str:
        dt = parse_date_or_datetime(v)
        if dt is None:
            raise ValueError("target is required and must be an ISO-8601 UTC timestamp")
        if dt < COVERAGE_START_UTC or dt >= COVERAGE_END_UTC:
            raise ValueError(f"target {v} is outside snapshot coverage")
        return v
