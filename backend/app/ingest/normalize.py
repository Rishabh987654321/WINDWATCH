"""Data normalization, cleaning, and quality counters for BMRS data."""

from dataclasses import dataclass
from datetime import datetime
from typing import Any

import numpy as np
import pandas as pd


@dataclass
class QualityReport:
    """Counters and statistics for data quality hygiene."""

    raw_fuelhh_rows: int = 0
    raw_windfor_rows: int = 0
    non_wind_rows_dropped: int = 0
    dropped_negative_generation: int = 0
    dropped_nonfinite_generation: int = 0
    retrocast_rows_dropped: int = 0
    duplicates_removed_actuals: int = 0
    duplicates_removed_forecasts: int = 0
    outside_target_window_actuals: int = 0
    outside_target_window_forecasts: int = 0
    clean_actuals_rows: int = 0
    clean_forecasts_rows: int = 0
    min_horizon_h: float | None = None
    max_horizon_h: float | None = None

    def to_manifest_dict(self) -> dict[str, Any]:
        """Format quality dict for manifest.json."""
        return {
            "dropped_negative_generation": self.dropped_negative_generation,
            "dropped_nonfinite_generation": self.dropped_nonfinite_generation,
            "duplicates_removed": self.duplicates_removed_actuals
            + self.duplicates_removed_forecasts,
            "retrocast_rows_dropped": self.retrocast_rows_dropped,
            "non_wind_rows_dropped": self.non_wind_rows_dropped,
            "raw_fuelhh_rows": self.raw_fuelhh_rows,
            "raw_windfor_rows": self.raw_windfor_rows,
            "clean_actuals_rows": self.clean_actuals_rows,
            "clean_forecasts_rows": self.clean_forecasts_rows,
        }


def normalize_actuals(
    records: list[dict[str, Any]],
    window_start: datetime,
    window_end: datetime,
    quality: QualityReport | None = None,
) -> tuple[pd.DataFrame, QualityReport]:
    """Normalize raw FUELHH records to clean actuals DataFrame.

    Filters fuelType to WIND, drops negative/non-finite generation,
    filters by [window_start, window_end), dedupes, and sorts deterministically.
    """
    qr = quality or QualityReport()
    qr.raw_fuelhh_rows = len(records)

    if not records:
        empty_df = pd.DataFrame(
            columns=["start_time", "actual_mw", "settlement_date", "settlement_period"]
        ).astype(
            {
                "actual_mw": "float64",
                "settlement_period": "int32",
            }
        )
        empty_df["start_time"] = pd.to_datetime(empty_df["start_time"], utc=True)
        return empty_df, qr

    df = pd.DataFrame(records)

    # 1. Column standardization (snake_case)
    col_map = {
        "startTime": "start_time",
        "publishTime": "publish_time",
        "generation": "actual_mw",
        "settlementDate": "settlement_date",
        "settlementPeriod": "settlement_period",
        "fuelType": "fuel_type",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # 2. Defensive fuelType filter
    if "fuel_type" in df.columns:
        non_wind_mask = df["fuel_type"] != "WIND"
        qr.non_wind_rows_dropped += int(non_wind_mask.sum())
        df = df[~non_wind_mask].copy()

    # 3. Parse timestamps to tz-aware UTC
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    if "publish_time" in df.columns:
        df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)

    # Ensure numeric generation
    df["actual_mw"] = pd.to_numeric(df["actual_mw"], errors="coerce")

    # 4. Drop non-finite and negative generation
    nonfinite_mask = df["actual_mw"].isna() | np.isinf(df["actual_mw"])
    qr.dropped_nonfinite_generation += int(nonfinite_mask.sum())
    df = df[~nonfinite_mask].copy()

    negative_mask = df["actual_mw"] < 0
    qr.dropped_negative_generation += int(negative_mask.sum())
    df = df[~negative_mask].copy()

    # 5. Target window filter: [window_start, window_end)
    w_start = (
        pd.Timestamp(window_start).tz_convert("UTC")
        if window_start.tzinfo
        else pd.Timestamp(window_start, tz="UTC")
    )
    w_end = (
        pd.Timestamp(window_end).tz_convert("UTC")
        if window_end.tzinfo
        else pd.Timestamp(window_end, tz="UTC")
    )

    window_mask = (df["start_time"] >= w_start) & (df["start_time"] < w_end)
    qr.outside_target_window_actuals += int((~window_mask).sum())
    df = df[window_mask].copy()

    # 6. Dedupe on start_time (keep last by publish_time or arrival)
    if "publish_time" in df.columns:
        df = df.sort_values(["start_time", "publish_time"], ascending=[True, True])
    else:
        df = df.sort_values("start_time", ascending=True)

    before_dedupe = len(df)
    df = df.drop_duplicates(subset=["start_time"], keep="last")
    qr.duplicates_removed_actuals += before_dedupe - len(df)

    # 7. Select final columns and enforce fixed dtypes
    keep_cols = ["start_time", "actual_mw", "settlement_date", "settlement_period"]
    for c in keep_cols:
        if c not in df.columns:
            df[c] = None

    df = df[keep_cols].copy()
    df["actual_mw"] = df["actual_mw"].astype("float64")
    df["settlement_period"] = (
        pd.to_numeric(df["settlement_period"], errors="coerce").fillna(0).astype("int32")
    )
    df["settlement_date"] = df["settlement_date"].fillna("").astype("string")

    # Deterministic final sort
    df = df.sort_values("start_time", ascending=True).reset_index(drop=True)
    qr.clean_actuals_rows = len(df)

    return df, qr


def normalize_forecasts(
    records: list[dict[str, Any]],
    window_start: datetime,
    window_end: datetime,
    quality: QualityReport | None = None,
) -> tuple[pd.DataFrame, QualityReport]:
    """Normalize raw WINDFOR records to clean forecasts DataFrame.

    Computes horizon_h, drops negative horizons (retrocasts),
    drops non-finite/negative generation, dedupes on (start_time, publish_time),
    and sorts deterministically by start_time, horizon_h.
    """
    qr = quality or QualityReport()
    qr.raw_windfor_rows = len(records)

    if not records:
        empty_df = pd.DataFrame(
            columns=["start_time", "publish_time", "forecast_mw", "horizon_h"]
        ).astype(
            {
                "forecast_mw": "float64",
                "horizon_h": "float32",
            }
        )
        empty_df["start_time"] = pd.to_datetime(empty_df["start_time"], utc=True)
        empty_df["publish_time"] = pd.to_datetime(empty_df["publish_time"], utc=True)
        return empty_df, qr

    df = pd.DataFrame(records)

    # 1. Column standardization (snake_case)
    col_map = {
        "startTime": "start_time",
        "publishTime": "publish_time",
        "generation": "forecast_mw",
    }
    df = df.rename(columns={k: v for k, v in col_map.items() if k in df.columns})

    # 2. Parse timestamps to tz-aware UTC
    df["start_time"] = pd.to_datetime(df["start_time"], utc=True)
    df["publish_time"] = pd.to_datetime(df["publish_time"], utc=True)

    # Ensure numeric generation
    df["forecast_mw"] = pd.to_numeric(df["forecast_mw"], errors="coerce")

    # 3. Compute horizon_h = (start_time - publish_time) in hours
    diff_s = (df["start_time"] - df["publish_time"]).dt.total_seconds()
    df["horizon_h"] = (diff_s / 3600.0).astype("float32")

    # 4. Drop negative horizons (retrocasts: start_time < publish_time)
    retrocast_mask = df["horizon_h"] < 0
    qr.retrocast_rows_dropped += int(retrocast_mask.sum())
    df = df[~retrocast_mask].copy()

    # 5. Drop non-finite and negative generation
    nonfinite_mask = df["forecast_mw"].isna() | np.isinf(df["forecast_mw"])
    qr.dropped_nonfinite_generation += int(nonfinite_mask.sum())
    df = df[~nonfinite_mask].copy()

    negative_mask = df["forecast_mw"] < 0
    qr.dropped_negative_generation += int(negative_mask.sum())
    df = df[~negative_mask].copy()

    # 6. Target window filter on start_time: [window_start, window_end)
    w_start = (
        pd.Timestamp(window_start).tz_convert("UTC")
        if window_start.tzinfo
        else pd.Timestamp(window_start, tz="UTC")
    )
    w_end = (
        pd.Timestamp(window_end).tz_convert("UTC")
        if window_end.tzinfo
        else pd.Timestamp(window_end, tz="UTC")
    )

    window_mask = (df["start_time"] >= w_start) & (df["start_time"] < w_end)
    qr.outside_target_window_forecasts += int((~window_mask).sum())
    df = df[window_mask].copy()

    # 7. Dedupe on (start_time, publish_time) keep last
    before_dedupe = len(df)
    df = df.drop_duplicates(subset=["start_time", "publish_time"], keep="last")
    qr.duplicates_removed_forecasts += before_dedupe - len(df)

    # 8. Fixed dtypes & deterministic sort
    keep_cols = ["start_time", "publish_time", "forecast_mw", "horizon_h"]
    df = df[keep_cols].copy()
    df["forecast_mw"] = df["forecast_mw"].astype("float64")
    df["horizon_h"] = df["horizon_h"].astype("float32")

    df = df.sort_values(["start_time", "horizon_h"], ascending=[True, True]).reset_index(drop=True)

    if not df.empty:
        qr.min_horizon_h = float(df["horizon_h"].min())
        qr.max_horizon_h = float(df["horizon_h"].max())

    qr.clean_forecasts_rows = len(df)
    return df, qr
