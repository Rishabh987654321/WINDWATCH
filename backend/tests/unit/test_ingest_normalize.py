"""Unit tests for BMRS data normalization, snake_case conversion, and quality hygiene."""

from datetime import UTC, datetime
from typing import Any

import pytest

from app.ingest.normalize import normalize_actuals, normalize_forecasts


def test_normalize_converts_to_utc_and_snake_case() -> None:
    """Verify normalize converts raw keys to snake_case and timestamps to tz-aware UTC."""
    raw_fuel = [
        {
            "startTime": "2026-01-05T00:00:00Z",
            "publishTime": "2026-01-05T00:30:00Z",
            "generation": 1250.0,
            "fuelType": "WIND",
            "settlementDate": "2026-01-05",
            "settlementPeriod": 1,
        }
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_act, qr = normalize_actuals(raw_fuel, w_start, w_end)

    assert "start_time" in df_act.columns
    assert "actual_mw" in df_act.columns
    assert "settlement_date" in df_act.columns
    assert "settlement_period" in df_act.columns
    assert df_act["start_time"].dt.tz is not None
    assert str(df_act["start_time"].dt.tz) == "UTC"
    assert df_act["actual_mw"].iloc[0] == 1250.0


def test_normalize_computes_horizon_hours() -> None:
    """Verify horizon_h is computed as (start_time - publish_time) in hours."""
    raw_windfor = [
        {
            "startTime": "2026-01-05T12:00:00Z",
            "publishTime": "2026-01-05T06:00:00Z",  # 6 hours ahead
            "generation": 4500.0,
        },
        {
            "startTime": "2026-01-05T12:00:00Z",
            "publishTime": "2026-01-04T12:00:00Z",  # 24 hours ahead
            "generation": 4200.0,
        },
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_fc, qr = normalize_forecasts(raw_windfor, w_start, w_end)

    assert "horizon_h" in df_fc.columns
    assert len(df_fc) == 2
    # Deterministic sort: ascending by (start_time, horizon_h)
    assert df_fc["horizon_h"].iloc[0] == pytest.approx(6.0, abs=1e-3)
    assert df_fc["horizon_h"].iloc[1] == pytest.approx(24.0, abs=1e-3)


def test_normalize_drops_negative_horizon_and_counts_them() -> None:
    """Verify forecasts with horizon_h < 0 (retrocasts) are dropped and counted."""
    raw_windfor = [
        {
            "startTime": "2026-01-05T00:00:00Z",
            "publishTime": "2026-01-05T02:00:00Z",  # -2.0h horizon (retrocast)
            "generation": 3000.0,
        },
        {
            "startTime": "2026-01-05T04:00:00Z",
            "publishTime": "2026-01-05T02:00:00Z",  # +2.0h horizon
            "generation": 3200.0,
        },
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_fc, qr = normalize_forecasts(raw_windfor, w_start, w_end)

    assert len(df_fc) == 1
    assert df_fc["horizon_h"].iloc[0] == pytest.approx(2.0, abs=1e-3)
    assert qr.retrocast_rows_dropped == 1


def test_normalize_dedupes_start_publish_pairs() -> None:
    """Verify duplicate (start_time, publish_time) rows are deduped keeping last."""
    raw_windfor = [
        {
            "startTime": "2026-01-05T10:00:00Z",
            "publishTime": "2026-01-05T06:00:00Z",
            "generation": 2000.0,
        },
        {
            "startTime": "2026-01-05T10:00:00Z",
            "publishTime": "2026-01-05T06:00:00Z",
            "generation": 2500.0,  # Duplicate, last arrival
        },
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_fc, qr = normalize_forecasts(raw_windfor, w_start, w_end)

    assert len(df_fc) == 1
    assert df_fc["forecast_mw"].iloc[0] == 2500.0
    assert qr.duplicates_removed_forecasts == 1


def test_normalize_drops_negative_and_nonfinite_generation_and_counts() -> None:
    """Verify negative and non-finite generation values are dropped and counted."""
    raw_fuel: list[dict[str, Any]] = [
        {"startTime": "2026-01-05T00:00:00Z", "generation": 100.0, "fuelType": "WIND"},
        {"startTime": "2026-01-05T00:30:00Z", "generation": -5.0, "fuelType": "WIND"},  # Negative
        {
            "startTime": "2026-01-05T01:00:00Z",
            "generation": None,
            "fuelType": "WIND",
        },  # Non-finite / None
        {
            "startTime": "2026-01-05T01:30:00Z",
            "generation": float("nan"),
            "fuelType": "WIND",
        },  # NaN
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_act, qr = normalize_actuals(raw_fuel, w_start, w_end)

    assert len(df_act) == 1
    assert df_act["actual_mw"].iloc[0] == 100.0
    assert qr.dropped_negative_generation == 1
    assert qr.dropped_nonfinite_generation == 2


def test_normalize_filters_to_wind_only() -> None:
    """Verify defensive fuelType filtering removes non-wind fuels and counts them."""
    raw_fuel = [
        {"startTime": "2026-01-05T00:00:00Z", "generation": 500.0, "fuelType": "WIND"},
        {"startTime": "2026-01-05T00:00:00Z", "generation": 3000.0, "fuelType": "NUCLEAR"},
        {"startTime": "2026-01-05T00:00:00Z", "generation": 2500.0, "fuelType": "CCGT"},
    ]
    w_start = datetime(2026, 1, 1, tzinfo=UTC)
    w_end = datetime(2026, 1, 10, tzinfo=UTC)

    df_act, qr = normalize_actuals(raw_fuel, w_start, w_end)

    assert len(df_act) == 1
    assert df_act["actual_mw"].iloc[0] == 500.0
    assert qr.non_wind_rows_dropped == 2
