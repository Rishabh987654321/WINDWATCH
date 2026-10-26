"""DataStore for snapshot loading and caching."""

import json
import math
import os
from datetime import UTC, datetime
from typing import Any

import pandas as pd
import structlog

from app.domain.metrics import by_horizon

logger = structlog.get_logger("windwatch.store")


class StoreNotReadyError(Exception):
    """Raised when data queries are attempted on an uninitialized or failed store."""

    pass


class DataStore:
    """In-memory holder of clean Parquet snapshot data and pre-computed metadata."""

    def __init__(self) -> None:
        self.actuals: pd.DataFrame = pd.DataFrame()
        self.forecasts: pd.DataFrame = pd.DataFrame()
        self.manifest: dict[str, Any] = {}
        self.snapshot_id: str = ""
        self.max_horizon_hours: int = 0
        self.reliable_horizon_hours: int = 0
        self.is_ready: bool = False
        self.load_error: str | None = None

    def load(self, snapshot_dir: str) -> None:
        """Load Parquet snapshot and manifest.json from disk.

        Does not raise on missing files; marks is_ready=False to allow app to start
        and return 503 from health/data endpoints per SYSTEM_DESIGN §6.
        """
        try:
            manifest_path = os.path.join(snapshot_dir, "manifest.json")
            act_path = os.path.join(snapshot_dir, "actuals.parquet")
            fc_path = os.path.join(snapshot_dir, "forecasts.parquet")

            if not os.path.exists(manifest_path):
                raise FileNotFoundError(f"Missing manifest.json at {manifest_path}")
            if not os.path.exists(act_path):
                raise FileNotFoundError(f"Missing actuals.parquet at {act_path}")
            if not os.path.exists(fc_path):
                raise FileNotFoundError(f"Missing forecasts.parquet at {fc_path}")

            with open(manifest_path, encoding="utf-8") as f:
                self.manifest = json.load(f)

            self.snapshot_id = self.manifest.get("snapshot_id", "")

            # Load DataFrames
            df_act = pd.read_parquet(act_path)
            df_fc = pd.read_parquet(fc_path)

            # Ensure tz-aware UTC timestamps and sort as domain expects
            if df_act["start_time"].dt.tz is None:
                df_act["start_time"] = df_act["start_time"].dt.tz_localize(UTC)
            self.actuals = df_act.sort_values("start_time").reset_index(drop=True)

            if df_fc["start_time"].dt.tz is None:
                df_fc["start_time"] = df_fc["start_time"].dt.tz_localize(UTC)
            if df_fc["publish_time"].dt.tz is None:
                df_fc["publish_time"] = df_fc["publish_time"].dt.tz_localize(UTC)

            self.forecasts = df_fc.sort_values(
                ["start_time", "horizon_h"], ascending=[True, True]
            ).reset_index(drop=True)

            # Pre-compute max_horizon_hours
            observed_max = float(self.forecasts["horizon_h"].max())
            self.max_horizon_hours = math.floor(observed_max)

            # Pre-compute reliable_horizon_hours
            # Largest integer H where coverage_pct >= 95% over evaluation window (Jan 2026)
            eval_start = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
            eval_end = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

            by_h_pts = by_horizon(
                self.forecasts,
                self.actuals,
                eval_start,
                eval_end,
                max_h=self.max_horizon_hours,
                step=1,
            )

            rel_h = 0
            for pt in by_h_pts:
                if pt.coverage_pct >= 95.0:
                    rel_h = max(rel_h, pt.horizon_hours)
            self.reliable_horizon_hours = rel_h

            self.is_ready = True
            self.load_error = None
            logger.info(
                "snapshot_loaded",
                snapshot_id=self.snapshot_id,
                actuals_count=len(self.actuals),
                forecasts_count=len(self.forecasts),
                max_horizon_hours=self.max_horizon_hours,
                reliable_horizon_hours=self.reliable_horizon_hours,
            )

        except Exception as e:
            self.is_ready = False
            self.load_error = str(e)
            logger.error("snapshot_load_failed", error=str(e), path=snapshot_dir)

    def check_ready(self) -> None:
        """Assert store is ready, raising StoreNotReadyError otherwise."""
        if not self.is_ready:
            raise StoreNotReadyError(
                f"Data snapshot is not available: {self.load_error or 'Not loaded'}"
            )


# Global store instance for lifespan loading
store = DataStore()
