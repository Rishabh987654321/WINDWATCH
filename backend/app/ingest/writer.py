"""Deterministic snapshot writer for Parquet files and manifest.json."""

import hashlib
import json
import os
from datetime import UTC, datetime
from typing import Any

import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq

from app.ingest.normalize import QualityReport


def calculate_file_sha256(filepath: str) -> str:
    """Calculate hex SHA-256 checksum of a file."""
    sha = hashlib.sha256()
    with open(filepath, "rb") as f:
        while chunk := f.read(65536):
            sha.update(chunk)
    return sha.hexdigest()


def compute_snapshot_id(actuals_sha256: str, forecasts_sha256: str) -> str:
    """Compute snapshot ID deterministically from parquet checksums."""
    combined = f"{actuals_sha256}:{forecasts_sha256}".encode()
    return f"sha256:{hashlib.sha256(combined).hexdigest()}"


def write_snapshot(
    output_dir: str,
    df_actuals: pd.DataFrame,
    df_forecasts: pd.DataFrame,
    quality: QualityReport,
    actual_validation: dict[str, Any],
    forecast_validation: dict[str, Any],
    windows: dict[str, Any],
    code_version: str = "0.1.0",
    fixed_ingested_at: str | None = None,
) -> dict[str, Any]:
    """Write actuals.parquet, forecasts.parquet, and manifest.json deterministically.

    Args:
        output_dir: Directory where snapshot files will be written.
        df_actuals: Normalized actuals dataframe.
        df_forecasts: Normalized forecasts dataframe.
        quality: QualityReport with counters.
        actual_validation: Validation results for actuals grid.
        forecast_validation: Validation results for forecasts grid.
        windows: Ingestion and evaluation windows description.
        code_version: Version of the ingestion codebase.
        fixed_ingested_at: Optional fixed ISO string for deterministic test assertions.

    Returns:
        Manifest dictionary.
    """
    os.makedirs(output_dir, exist_ok=True)

    actuals_path = os.path.join(output_dir, "actuals.parquet")
    forecasts_path = os.path.join(output_dir, "forecasts.parquet")
    manifest_path = os.path.join(output_dir, "manifest.json")

    # Write actuals.parquet deterministically
    table_actuals = pa.Table.from_pandas(df_actuals, preserve_index=False)
    pq.write_table(
        table_actuals,
        actuals_path,
        compression="zstd",
        store_schema=True,
    )

    # Write forecasts.parquet deterministically
    table_forecasts = pa.Table.from_pandas(df_forecasts, preserve_index=False)
    pq.write_table(
        table_forecasts,
        forecasts_path,
        compression="zstd",
        store_schema=True,
    )

    # Calculate checksums
    actuals_sha = calculate_file_sha256(actuals_path)
    forecasts_sha = calculate_file_sha256(forecasts_path)
    snapshot_id = compute_snapshot_id(actuals_sha, forecasts_sha)

    ingested_at = fixed_ingested_at or datetime.now(UTC).isoformat()

    manifest: dict[str, Any] = {
        "snapshot_id": snapshot_id,
        "ingested_at": ingested_at,
        "code_version": code_version,
        "windows": windows,
        "sources": [
            {
                "dataset": "FUELHH",
                "url_template": "https://data.elexon.co.uk/bmrs/api/v1/datasets/FUELHH/stream",
                "params": {
                    "settlementDateFrom": windows.get("actuals", {}).get("from"),
                    "settlementDateTo": windows.get("actuals", {}).get("to"),
                    "fuelType": "WIND",
                    "format": "json",
                },
                "row_count": len(df_actuals),
                "sha256": actuals_sha,
            },
            {
                "dataset": "WINDFOR",
                "url_template": "https://data.elexon.co.uk/bmrs/api/v1/datasets/WINDFOR/stream",
                "params": {
                    "publishDateTimeFrom": windows.get("forecasts", {}).get("from"),
                    "publishDateTimeTo": windows.get("forecasts", {}).get("to"),
                    "format": "json",
                },
                "row_count": len(df_forecasts),
                "sha256": forecasts_sha,
            },
        ],
        "quality": {
            "dropped_negative_generation": quality.dropped_negative_generation,
            "dropped_nonfinite_generation": quality.dropped_nonfinite_generation,
            "duplicates_removed": quality.duplicates_removed_actuals
            + quality.duplicates_removed_forecasts,
            "retrocast_rows_dropped": quality.retrocast_rows_dropped,
            "non_wind_rows_dropped": quality.non_wind_rows_dropped,
            "missing_actual_periods": actual_validation.get("n_missing_periods", 0),
            "missing_forecast_hours": forecast_validation.get("n_missing_eval_hours", 0),
        },
        "horizon": {
            "min_h": quality.min_horizon_h if quality.min_horizon_h is not None else 0.0,
            "max_h": quality.max_horizon_h if quality.max_horizon_h is not None else 0.0,
        },
    }

    # Write manifest.json with indentation
    with open(manifest_path, "w", encoding="utf-8") as f:
        json.dump(manifest, f, indent=2)

    return manifest
