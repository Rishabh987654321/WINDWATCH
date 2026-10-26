"""Shared schema components."""

from pydantic import BaseModel, ConfigDict, Field


class SchemaBase(BaseModel):
    """Base schema for WindWatch API responses."""

    model_config = ConfigDict(populate_by_name=True)


class TimeRange(SchemaBase):
    """Timestamp or date range object with from and to."""

    from_: str = Field(alias="from")
    to: str


class CoverageStats(SchemaBase):
    """Target evaluation coverage statistics."""

    n_expected: int
    n_matched: int
    n_missing_actual: int
    n_missing_forecast: int
