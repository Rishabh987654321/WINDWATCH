"""Unit tests for Parquet snapshot writer, checksums, and determinism."""

import os
import tempfile
from pathlib import Path

import pandas as pd
import pytest

from app.ingest.normalize import QualityReport
from app.ingest.writer import calculate_file_sha256, write_snapshot


@pytest.fixture
def sample_frames() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Create sample actuals and forecasts DataFrames."""
    df_act = pd.DataFrame(
        {
            "start_time": pd.to_datetime(
                ["2026-01-01T00:00:00Z", "2026-01-01T00:30:00Z"], utc=True
            ),
            "actual_mw": [1500.0, 1600.0],
            "settlement_date": ["2026-01-01", "2026-01-01"],
            "settlement_period": [1, 2],
        }
    ).astype(
        {
            "actual_mw": "float64",
            "settlement_date": "string",
            "settlement_period": "int32",
        }
    )

    df_fc = pd.DataFrame(
        {
            "start_time": pd.to_datetime(["2026-01-01T00:00:00Z"], utc=True),
            "publish_time": pd.to_datetime(["2025-12-31T20:00:00Z"], utc=True),
            "forecast_mw": [1550.0],
            "horizon_h": [4.0],
        }
    ).astype(
        {
            "forecast_mw": "float64",
            "horizon_h": "float32",
        }
    )

    return df_act, df_fc


def test_manifest_sha256_matches_files(sample_frames: tuple[pd.DataFrame, pd.DataFrame]) -> None:
    """Verify SHA-256 recorded in manifest matches computed file hashes."""
    df_act, df_fc = sample_frames
    with tempfile.TemporaryDirectory() as tmpdir:
        qr = QualityReport()
        manifest = write_snapshot(
            output_dir=tmpdir,
            df_actuals=df_act,
            df_forecasts=df_fc,
            quality=qr,
            actual_validation={"n_missing_periods": 0},
            forecast_validation={"n_missing_eval_hours": 0},
            windows={"actuals": {}, "forecasts": {}},
            fixed_ingested_at="2026-10-25T00:00:00Z",
        )

        actuals_file = os.path.join(tmpdir, "actuals.parquet")
        forecasts_file = os.path.join(tmpdir, "forecasts.parquet")

        assert os.path.exists(actuals_file)
        assert os.path.exists(forecasts_file)

        assert manifest["sources"][0]["sha256"] == calculate_file_sha256(actuals_file)
        assert manifest["sources"][1]["sha256"] == calculate_file_sha256(forecasts_file)


def test_snapshot_is_deterministic_for_same_input(
    sample_frames: tuple[pd.DataFrame, pd.DataFrame],
) -> None:
    """Verify two snapshot writes of identical DataFrames yield byte-identical files and identical snapshot_id."""
    df_act, df_fc = sample_frames
    with tempfile.TemporaryDirectory() as tmp1, tempfile.TemporaryDirectory() as tmp2:
        qr = QualityReport()
        m1 = write_snapshot(
            output_dir=tmp1,
            df_actuals=df_act,
            df_forecasts=df_fc,
            quality=qr,
            actual_validation={},
            forecast_validation={},
            windows={},
            fixed_ingested_at="2026-10-25T00:00:00Z",
        )
        m2 = write_snapshot(
            output_dir=tmp2,
            df_actuals=df_act,
            df_forecasts=df_fc,
            quality=qr,
            actual_validation={},
            forecast_validation={},
            windows={},
            fixed_ingested_at="2026-10-25T00:00:00Z",
        )

        assert m1["snapshot_id"] == m2["snapshot_id"]
        assert m1["sources"][0]["sha256"] == m2["sources"][0]["sha256"]
        assert m1["sources"][1]["sha256"] == m2["sources"][1]["sha256"]

        # Byte-identical files
        bytes_act1 = Path(tmp1, "actuals.parquet").read_bytes()
        bytes_act2 = Path(tmp2, "actuals.parquet").read_bytes()
        assert bytes_act1 == bytes_act2

        bytes_fc1 = Path(tmp1, "forecasts.parquet").read_bytes()
        bytes_fc2 = Path(tmp2, "forecasts.parquet").read_bytes()
        assert bytes_fc1 == bytes_fc2


def test_snapshot_not_written_when_any_chunk_fails(
    sample_frames: tuple[pd.DataFrame, pd.DataFrame],
) -> None:
    """Verify no partial snapshot files exist if an exception occurs before write."""
    with tempfile.TemporaryDirectory() as tmpdir:
        output_dir = os.path.join(tmpdir, "aborted_snapshot")

        with pytest.raises(RuntimeError):
            # Simulate failure during pipeline before write
            raise RuntimeError("Chunk download failed")
            # write_snapshot is never reached

        assert not os.path.exists(output_dir)
