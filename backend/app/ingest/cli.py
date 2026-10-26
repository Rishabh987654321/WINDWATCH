"""CLI for Elexon data ingestion and Parquet snapshot generation."""

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, date, datetime, timedelta
from typing import Any

import structlog

from app.ingest.elexon_client import ElexonAsyncClient
from app.ingest.normalize import QualityReport, normalize_actuals, normalize_forecasts
from app.ingest.validate import validate_actuals_grid, validate_forecasts_grid
from app.ingest.writer import write_snapshot

logger = structlog.get_logger(__name__)


def parse_args(args: list[str] | None = None) -> argparse.Namespace:
    """Parse CLI arguments."""
    parser = argparse.ArgumentParser(
        description="Ingest Elexon BMRS FUELHH actuals and WINDFOR forecasts into Parquet snapshot."
    )
    parser.add_argument(
        "--from",
        dest="date_from",
        type=str,
        default="2025-12-01",
        help="Start date for actuals (YYYY-MM-DD, default 2025-12-01)",
    )
    parser.add_argument(
        "--to",
        dest="date_to",
        type=str,
        default="2026-01-31",
        help="End date for actuals (inclusive, YYYY-MM-DD, default 2026-01-31)",
    )
    parser.add_argument(
        "--out",
        dest="out_dir",
        type=str,
        default="data/snapshot",
        help="Output directory for snapshot files (default data/snapshot)",
    )
    parser.add_argument(
        "--chunk-days",
        dest="chunk_days",
        type=int,
        default=7,
        help="Date window chunk size in days (default 7)",
    )
    parser.add_argument(
        "--dry-run",
        dest="dry_run",
        action="store_true",
        help="Fetch and validate data without writing snapshot to disk",
    )
    parser.add_argument(
        "--from-fixtures",
        dest="from_fixtures",
        type=str,
        default=None,
        help="Load raw records from fixture directory instead of calling Elexon API",
    )
    return parser.parse_args(args)


async def run_ingest(args: argparse.Namespace) -> int:
    """Execute ingestion workflow."""
    start_date = date.fromisoformat(args.date_from)
    end_date = date.fromisoformat(args.date_to)

    if start_date > end_date:
        logger.error("invalid_date_range", start=args.date_from, end=args.date_to)
        return 1

    # Define target windows
    # FUELHH covers start_date to end_date inclusive
    # WINDFOR publish window starts 3 days prior (2025-11-28) to cover target 2025-12-01 with ~66h horizon
    wf_start_dt = datetime(
        start_date.year, start_date.month, start_date.day, 0, 0, tzinfo=UTC
    ) - timedelta(days=3)
    wf_end_dt = datetime(end_date.year, end_date.month, end_date.day, 0, 0, tzinfo=UTC) + timedelta(
        days=1
    )

    target_window_start = datetime(
        start_date.year, start_date.month, start_date.day, 0, 0, tzinfo=UTC
    )
    target_window_end = datetime(
        end_date.year, end_date.month, end_date.day, 0, 0, tzinfo=UTC
    ) + timedelta(days=1)

    eval_start_dt = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    eval_end_dt = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

    logger.info(
        "ingest_started",
        actuals_from=start_date.isoformat(),
        actuals_to=end_date.isoformat(),
        forecasts_pub_from=wf_start_dt.isoformat(),
        forecasts_pub_to=wf_end_dt.isoformat(),
        target_from=target_window_start.isoformat(),
        target_to=target_window_end.isoformat(),
        chunk_days=args.chunk_days,
        from_fixtures=args.from_fixtures,
        dry_run=args.dry_run,
    )

    raw_fuelhh: list[dict[str, Any]] = []
    raw_windfor: list[dict[str, Any]] = []

    # 1. Fetch data (API or Fixtures)
    if args.from_fixtures:
        fixture_dir = args.from_fixtures
        fuelhh_file = os.path.join(fixture_dir, "fuelhh_sample.json")
        if not os.path.exists(fuelhh_file):
            fuelhh_file = os.path.join(fixture_dir, "fuelhh.json")

        windfor_file = os.path.join(fixture_dir, "windfor_sample.json")
        if not os.path.exists(windfor_file):
            windfor_file = os.path.join(fixture_dir, "windfor.json")

        if os.path.exists(fuelhh_file):
            with open(fuelhh_file, encoding="utf-8") as f:
                raw_fuelhh = json.load(f)
        if os.path.exists(windfor_file):
            with open(windfor_file, encoding="utf-8") as f:
                raw_windfor = json.load(f)

        logger.info(
            "loaded_fixtures",
            fuelhh_rows=len(raw_fuelhh),
            windfor_rows=len(raw_windfor),
        )
    else:
        async with ElexonAsyncClient() as client:
            try:
                # Concurrent chunked fetching of FUELHH and WINDFOR
                task_fuelhh = client.fetch_all_fuelhh(
                    start_date, end_date, chunk_days=args.chunk_days
                )
                task_windfor = client.fetch_all_windfor(
                    wf_start_dt, wf_end_dt, chunk_days=args.chunk_days
                )
                raw_fuelhh, raw_windfor = await asyncio.gather(task_fuelhh, task_windfor)
            except Exception as e:
                logger.error("ingest_fetch_failed", error=str(e))
                return 1

    # 2. Normalize and clean
    quality = QualityReport()
    df_actuals, quality = normalize_actuals(
        raw_fuelhh,
        target_window_start,
        target_window_end,
        quality=quality,
    )
    df_forecasts, quality = normalize_forecasts(
        raw_windfor,
        target_window_start,
        target_window_end,
        quality=quality,
    )

    # 3. Validate time grids
    actual_val = validate_actuals_grid(df_actuals, target_window_start, target_window_end)
    forecast_val = validate_forecasts_grid(df_forecasts, eval_start_dt, eval_end_dt)

    logger.info(
        "validation_complete",
        actuals_expected=actual_val["n_expected_periods"],
        actuals_present=actual_val["n_present_periods"],
        actuals_missing=actual_val["n_missing_periods"],
        forecasts_eval_expected=forecast_val["n_expected_eval_hours"],
        forecasts_eval_covered=forecast_val["n_covered_eval_hours"],
        forecasts_eval_missing=forecast_val["n_missing_eval_hours"],
    )

    if args.dry_run:
        logger.info("dry_run_complete_skipping_write")
        print("\n=== DRY RUN QUALITY REPORT ===")
        print(f"Clean actuals rows:   {len(df_actuals)}")
        print(f"Clean forecasts rows: {len(df_forecasts)}")
        print(f"Quality: {quality.to_manifest_dict()}")
        return 0

    # 4. Write snapshot
    windows = {
        "actuals": {"from": start_date.strftime("%Y-%m-%d"), "to": end_date.strftime("%Y-%m-%d")},
        "forecasts": {
            "from": wf_start_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": wf_end_dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "target": {
            "from": target_window_start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "to": target_window_end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        "evaluation": {
            "from": eval_start_dt.strftime("%Y-%m-%d"),
            "to": (eval_end_dt - timedelta(days=1)).strftime("%Y-%m-%d"),
        },
    }

    manifest = write_snapshot(
        args.out_dir,
        df_actuals,
        df_forecasts,
        quality=quality,
        actual_validation=actual_val,
        forecast_validation=forecast_val,
        windows=windows,
    )

    logger.info("snapshot_written", snapshot_id=manifest["snapshot_id"], out_dir=args.out_dir)
    print("\n" + "=" * 70)
    print("SNAPSHOT GENERATED SUCCESSFULLY")
    print(f"Directory:    {os.path.abspath(args.out_dir)}")
    print(f"Snapshot ID:  {manifest['snapshot_id']}")
    print(f"Actuals:      {len(df_actuals)} rows (30-min)")
    print(f"Forecasts:    {len(df_forecasts)} rows (hourly)")
    print(
        f"Horizon:      {manifest['horizon']['min_h']:.1f}h to {manifest['horizon']['max_h']:.1f}h"
    )
    print(f"Retrocasts:   {manifest['quality']['retrocast_rows_dropped']} rows dropped")
    print("=" * 70)
    return 0


def main() -> None:
    """CLI entrypoint."""
    args = parse_args()
    code = asyncio.run(run_ingest(args))
    sys.exit(code)


if __name__ == "__main__":
    main()
