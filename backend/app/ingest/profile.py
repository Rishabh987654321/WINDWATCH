"""Snapshot profile and exploratory analytics script.

Generates comprehensive data quality, publish cadence, cutoff sensitivity,
and horizon analysis reports without importing app domain modules.
"""

import json
import os
import sys
import zoneinfo
from collections import Counter
from datetime import UTC, date, datetime, timedelta
from typing import Any

import numpy as np
import pandas as pd
import pyarrow.parquet as pq

LONDON_TZ = zoneinfo.ZoneInfo("Europe/London")


def load_snapshot(snapshot_dir: str) -> tuple[pd.DataFrame, pd.DataFrame, dict[str, Any]]:
    """Load actuals, forecasts, and manifest from snapshot directory."""
    actuals_path = os.path.join(snapshot_dir, "actuals.parquet")
    forecasts_path = os.path.join(snapshot_dir, "forecasts.parquet")
    manifest_path = os.path.join(snapshot_dir, "manifest.json")

    if not os.path.exists(actuals_path) or not os.path.exists(forecasts_path):
        raise FileNotFoundError(f"Missing parquet files in {snapshot_dir}")

    df_actuals = pq.read_table(actuals_path).to_pandas()
    df_forecasts = pq.read_table(forecasts_path).to_pandas()

    manifest: dict[str, Any] = {}
    if os.path.exists(manifest_path):
        with open(manifest_path, encoding="utf-8") as f:
            manifest = json.load(f)

    return df_actuals, df_forecasts, manifest


def run_profiling(snapshot_dir: str = "data/snapshot") -> dict[str, Any]:
    """Profile the snapshot data and return profile report."""
    print("=" * 80)
    print("WINDWATCH SNAPSHOT PROFILE")
    print(f"Snapshot directory: {os.path.abspath(snapshot_dir)}")
    print("=" * 80)

    df_actuals, df_forecasts, manifest = load_snapshot(snapshot_dir)

    report: dict[str, Any] = {
        "generated_at": datetime.now(UTC).isoformat(),
        "snapshot_id": manifest.get("snapshot_id"),
    }

    # =========================================================================
    # SECTION 1: Row counts, coverage, gap lists
    # =========================================================================
    print("\n" + "#" * 80)
    print("SECTION 1: ROW COUNTS & COVERAGE")
    print("#" * 80)

    actuals_min = df_actuals["start_time"].min()
    actuals_max = df_actuals["start_time"].max()
    forecasts_min = df_forecasts["start_time"].min()
    forecasts_max = df_forecasts["start_time"].max()
    pub_min = df_forecasts["publish_time"].min()
    pub_max = df_forecasts["publish_time"].max()

    # Check 30-min grid on actuals
    expected_actuals_grid = pd.date_range(
        start=actuals_min, end=actuals_max, freq="30min", tz="UTC"
    )
    present_actuals = set(df_actuals["start_time"])
    missing_actuals = sorted(set(expected_actuals_grid) - present_actuals)

    sec1 = {
        "actuals_row_count": len(df_actuals),
        "actuals_time_range": {"min": actuals_min.isoformat(), "max": actuals_max.isoformat()},
        "missing_actuals_periods_count": len(missing_actuals),
        "missing_actuals_sample": [ts.isoformat() for ts in missing_actuals[:10]],
        "forecasts_row_count": len(df_forecasts),
        "forecasts_target_range": {
            "min": forecasts_min.isoformat(),
            "max": forecasts_max.isoformat(),
        },
        "forecasts_publish_range": {"min": pub_min.isoformat(), "max": pub_max.isoformat()},
        "quality_stats": manifest.get("quality", {}),
    }
    report["section_1_row_counts_and_coverage"] = sec1

    print(f"Actuals Rows:           {len(df_actuals):,}")
    print(f"Actuals Range:          {actuals_min} to {actuals_max}")
    print(f"Missing Actual Periods: {len(missing_actuals)}")
    print(f"Forecasts Rows:         {len(df_forecasts):,}")
    print(f"Forecasts Target Range: {forecasts_min} to {forecasts_max}")
    print(f"Forecasts Pub Range:    {pub_min} to {pub_max}")
    print(f"Quality Counters:       {manifest.get('quality', {})}")

    # =========================================================================
    # SECTION 2: Publish time-of-day histogram & publication gaps
    # =========================================================================
    print("\n" + "#" * 80)
    print("SECTION 2: PUBLISH TIME-OF-DAY HISTOGRAM & INTERVAL GAPS")
    print("#" * 80)

    unique_pub_times = sorted(df_forecasts["publish_time"].unique())
    unique_pub_series = pd.Series(unique_pub_times)

    # UTC hours
    utc_hours = unique_pub_series.dt.hour
    utc_hist = dict(sorted(Counter(utc_hours).items()))

    # London local hours
    london_hours = unique_pub_series.dt.tz_convert(LONDON_TZ).dt.hour
    london_hist = dict(sorted(Counter(london_hours).items()))

    # Publish intervals in minutes
    intervals_min = (unique_pub_series.diff().dt.total_seconds() / 60.0).dropna()
    interval_counts = dict(sorted(Counter(intervals_min).items()))

    sec2 = {
        "distinct_publications_count": len(unique_pub_times),
        "publish_hour_histogram_utc": utc_hist,
        "publish_hour_histogram_london": london_hist,
        "intervals_minutes_summary": {
            "min": float(intervals_min.min()) if not intervals_min.empty else 0,
            "median": float(intervals_min.median()) if not intervals_min.empty else 0,
            "mean": float(intervals_min.mean()) if not intervals_min.empty else 0,
            "p90": float(intervals_min.quantile(0.90)) if not intervals_min.empty else 0,
            "max": float(intervals_min.max()) if not intervals_min.empty else 0,
            "distribution": {str(k): v for k, v in interval_counts.items()},
        },
    }
    report["section_2_publish_cadence"] = sec2

    print(f"Distinct Publication Events: {len(unique_pub_times)}")
    print(f"Publish Hour Histogram (UTC):    {utc_hist}")
    print(f"Publish Hour Histogram (London): {london_hist}")
    print(
        f"Interval Gaps (min/med/p90/max): {intervals_min.min():.0f}m / {intervals_min.median():.0f}m / {intervals_min.quantile(0.90):.0f}m / {intervals_min.max():.0f}m"
    )
    print(f"Interval Frequency (minutes):    {interval_counts}")

    # =========================================================================
    # SECTION 3: Cutoff sensitivity for January delivery days
    # =========================================================================
    print("\n" + "#" * 80)
    print("SECTION 3: CUTOFF SENSITIVITY (08:00, 09:00, 10:00, 11:00 London)")
    print("#" * 80)

    # Days in Jan 2026
    jan_days = [date(2026, 1, d) for d in range(1, 32)]
    cutoffs = ["08:00", "09:00", "10:00", "11:00"]
    cutoff_results: dict[str, Any] = {}

    for cutoff_str in cutoffs:
        ch, cm = map(int, cutoff_str.split(":"))
        day_records: list[dict[str, Any]] = []
        ages: list[float] = []
        missing_target_counts: list[int] = []

        for d in jan_days:
            # Cutoff is (D - 1) at cutoff_str London time converted to UTC
            d_prev = d - timedelta(days=1)
            cutoff_local = datetime(d_prev.year, d_prev.month, d_prev.day, ch, cm, tzinfo=LONDON_TZ)
            cutoff_utc = cutoff_local.astimezone(UTC)

            # Available forecasts before or at cutoff
            avail = df_forecasts[df_forecasts["publish_time"] <= cutoff_utc]
            if not avail.empty:
                latest_pub = avail["publish_time"].max()
                age_h = (cutoff_utc - latest_pub).total_seconds() / 3600.0
            else:
                latest_pub = None
                age_h = None

            # Hourly targets in D
            d_start_utc = datetime(d.year, d.month, d.day, 0, 0, tzinfo=UTC)
            d_end_utc = d_start_utc + timedelta(days=1)
            d_targets = pd.date_range(
                start=d_start_utc, end=d_end_utc, freq="1h", inclusive="left", tz="UTC"
            )

            # Targets covered by available forecasts
            covered_targets = set(avail["start_time"].unique()) if not avail.empty else set()
            missing_in_d = len(set(d_targets) - covered_targets)

            if age_h is not None:
                ages.append(age_h)
            missing_target_counts.append(missing_in_d)

            day_records.append(
                {
                    "delivery_date": d.isoformat(),
                    "cutoff_utc": cutoff_utc.isoformat(),
                    "latest_publish_utc": latest_pub.isoformat()
                    if latest_pub is not None
                    else None,
                    "forecast_age_h": round(age_h, 2) if age_h is not None else None,
                    "missing_targets_count": missing_in_d,
                }
            )

        cutoff_results[cutoff_str] = {
            "mean_age_h": round(float(np.mean(ages)), 2) if ages else None,
            "min_age_h": round(float(np.min(ages)), 2) if ages else None,
            "max_age_h": round(float(np.max(ages)), 2) if ages else None,
            "days_with_missing_targets": sum(1 for m in missing_target_counts if m > 0),
            "total_missing_target_hours": sum(missing_target_counts),
            "sample_days": day_records[:5],
        }

    sec3 = {
        "cutoffs_analyzed": cutoffs,
        "sensitivity_summary": {
            c: {
                "mean_age_h": cutoff_results[c]["mean_age_h"],
                "min_age_h": cutoff_results[c]["min_age_h"],
                "max_age_h": cutoff_results[c]["max_age_h"],
                "days_with_missing_targets": cutoff_results[c]["days_with_missing_targets"],
            }
            for c in cutoffs
        },
        "details_by_cutoff": cutoff_results,
    }
    report["section_3_cutoff_sensitivity"] = sec3

    for c in cutoffs:
        s = cutoff_results[c]
        print(
            f"Cutoff {c} London: Mean Age = {s['mean_age_h']}h (min {s['min_age_h']}h, max {s['max_age_h']}h) | Missing Targets: {s['days_with_missing_targets']} days"
        )

    # =========================================================================
    # SECTION 4: Horizon distribution
    # =========================================================================
    print("\n" + "#" * 80)
    print("SECTION 4: FORECAST HORIZON DISTRIBUTION")
    print("#" * 80)

    h_series = df_forecasts["horizon_h"]
    h_min = float(h_series.min())
    h_med = float(h_series.median())
    h_mean = float(h_series.mean())
    h_max = float(h_series.max())
    h_p90 = float(h_series.quantile(0.90))

    # 6-hour buckets
    buckets = [
        (0, 6),
        (6, 12),
        (12, 18),
        (18, 24),
        (24, 30),
        (30, 36),
        (36, 42),
        (42, 48),
        (48, 54),
        (54, 60),
        (60, 66),
        (66, 72),
    ]
    bucket_counts: dict[str, dict[str, Any]] = {}
    total_rows = len(df_forecasts)

    for b_low, b_high in buckets:
        cnt = int(((h_series >= b_low) & (h_series < b_high)).sum())
        share = round((cnt / total_rows) * 100, 2) if total_rows > 0 else 0
        b_label = f"{b_low:02d}-{b_high:02d}h"
        bucket_counts[b_label] = {"count": cnt, "share_pct": share}

    sec4 = {
        "min_horizon_h": round(h_min, 2),
        "median_horizon_h": round(h_med, 2),
        "mean_horizon_h": round(h_mean, 2),
        "p90_horizon_h": round(h_p90, 2),
        "max_horizon_h": round(h_max, 2),
        "six_hour_bucket_distribution": bucket_counts,
    }
    report["section_4_horizon_distribution"] = sec4

    print(
        f"Horizon Stats: min={h_min:.1f}h, median={h_med:.1f}h, mean={h_mean:.1f}h, p90={h_p90:.1f}h, max={h_max:.1f}h"
    )
    print("6-Hour Horizon Buckets:")
    for b_lbl, b_val in bucket_counts.items():
        print(f"  {b_lbl}: {b_val['count']:6,d} rows ({b_val['share_pct']:5.2f}%)")

    # =========================================================================
    # SECTION 5: Rough sanity check (January hourly targets, horizon >= 24h)
    # =========================================================================
    print("\n" + "#" * 80)
    print("SECTION 5: SANITY CHECK (JANUARY HOURLY TARGETS, HORIZON >= 24h)")
    print("#" * 80)

    jan_start = pd.Timestamp("2026-01-01T00:00:00Z")
    jan_end = pd.Timestamp("2026-02-01T00:00:00Z")

    # Filter January hourly actuals (:00:00)
    act_jan = df_actuals[
        (df_actuals["start_time"] >= jan_start)
        & (df_actuals["start_time"] < jan_end)
        & (df_actuals["start_time"].dt.minute == 0)
    ].copy()

    # Forecasts for Jan targets with horizon >= 24h
    fc_jan = df_forecasts[
        (df_forecasts["start_time"] >= jan_start)
        & (df_forecasts["start_time"] < jan_end)
        & (df_forecasts["horizon_h"] >= 24.0)
    ].copy()

    # Select latest forecast made at least 24h ahead (smallest horizon >= 24)
    fc_selected = fc_jan.sort_values(
        ["start_time", "horizon_h"], ascending=[True, True]
    ).drop_duplicates("start_time", keep="first")

    merged = pd.merge(act_jan, fc_selected, on="start_time", how="inner")
    merged["error_mw"] = merged["forecast_mw"] - merged["actual_mw"]
    merged["abs_error_mw"] = merged["error_mw"].abs()

    act_min = float(act_jan["actual_mw"].min())
    act_mean = float(act_jan["actual_mw"].mean())
    act_max = float(act_jan["actual_mw"].max())

    mae = float(merged["abs_error_mw"].mean()) if not merged.empty else 0.0
    bias = float(merged["error_mw"].mean()) if not merged.empty else 0.0
    rmse = float(np.sqrt((merged["error_mw"] ** 2).mean())) if not merged.empty else 0.0
    corr = float(merged["forecast_mw"].corr(merged["actual_mw"])) if len(merged) > 1 else 0.0

    sec5 = {
        "evaluation_period": "2026-01-01 to 2026-01-31 (hourly)",
        "expected_hourly_targets": 744,
        "matched_hourly_points": len(merged),
        "actual_wind_stats_mw": {
            "min": round(act_min, 1),
            "mean": round(act_mean, 1),
            "max": round(act_max, 1),
        },
        "lead_time_24h_sanity_metrics": {
            "mae_mw": round(mae, 1),
            "bias_mw": round(bias, 1),
            "rmse_mw": round(rmse, 1),
            "correlation": round(corr, 4),
            "nmae_pct": round(100.0 * mae / act_mean, 2) if act_mean > 0 else None,
        },
    }
    report["section_5_sanity_check"] = sec5

    print(f"Hourly Targets Evaluated: {len(merged)} / 744")
    print(f"Actual Generation (MW):   min={act_min:.1f}, mean={act_mean:.1f}, max={act_max:.1f}")
    print(
        f"Latest FC (>=24h lead):   MAE={mae:.1f} MW, Bias={bias:.1f} MW, RMSE={rmse:.1f} MW, Corr={corr:.4f}"
    )
    if act_mean > 0:
        print(f"nMAE (% of mean actual):  {100.0 * mae / act_mean:.2f}%")

    # Save profile.json
    profile_out = os.path.join(snapshot_dir, "profile.json")
    with open(profile_out, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)

    print("\n" + "=" * 80)
    print(f"Profile saved to: {os.path.abspath(profile_out)}")
    print("=" * 80)
    return report


def main() -> None:
    snapshot_dir = sys.argv[1] if len(sys.argv) > 1 else "data/snapshot"
    if not os.path.isabs(snapshot_dir):
        # Default relative to backend if run from backend, or repo root
        if not os.path.exists(snapshot_dir) and os.path.exists(
            os.path.join("backend", snapshot_dir)
        ):
            snapshot_dir = os.path.join("backend", snapshot_dir)
    run_profiling(snapshot_dir)


if __name__ == "__main__":
    main()
