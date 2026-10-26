"""Unit tests for ingest CLI execution and parameter handling."""

import asyncio
import os
import tempfile

from app.ingest.cli import parse_args, run_ingest


def test_cli_argument_parsing() -> None:
    """Verify CLI argument defaults and custom flags."""
    args = parse_args(
        [
            "--from",
            "2025-12-01",
            "--to",
            "2026-01-31",
            "--out",
            "data/test_snap",
            "--chunk-days",
            "14",
            "--dry-run",
        ]
    )
    assert args.date_from == "2025-12-01"
    assert args.date_to == "2026-01-31"
    assert args.out_dir == "data/test_snap"
    assert args.chunk_days == 14
    assert args.dry_run is True


def test_cli_dry_run_with_fixtures() -> None:
    """Verify CLI runs offline with fixtures in dry-run mode."""
    fixtures_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "fixtures", "elexon_raw")
    )
    args = parse_args(
        [
            "--from",
            "2026-01-05",
            "--to",
            "2026-01-08",
            "--from-fixtures",
            fixtures_dir,
            "--dry-run",
        ]
    )
    code = asyncio.run(run_ingest(args))
    assert code == 0


def test_cli_writes_snapshot_with_fixtures() -> None:
    """Verify CLI writes actuals.parquet, forecasts.parquet, manifest.json to output directory."""
    fixtures_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "fixtures", "elexon_raw")
    )
    with tempfile.TemporaryDirectory() as tmpdir:
        args = parse_args(
            [
                "--from",
                "2026-01-05",
                "--to",
                "2026-01-08",
                "--out",
                tmpdir,
                "--from-fixtures",
                fixtures_dir,
            ]
        )
        code = asyncio.run(run_ingest(args))
        assert code == 0
        assert os.path.exists(os.path.join(tmpdir, "actuals.parquet"))
        assert os.path.exists(os.path.join(tmpdir, "forecasts.parquet"))
        assert os.path.exists(os.path.join(tmpdir, "manifest.json"))


def test_cli_rejects_invalid_date_range() -> None:
    """Verify CLI rejects from > to."""
    args = parse_args(
        [
            "--from",
            "2026-01-10",
            "--to",
            "2026-01-05",
        ]
    )
    code = asyncio.run(run_ingest(args))
    assert code == 1
