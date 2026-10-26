"""Benchmark script for pure domain engine operations on real snapshot data.

Measures median latency of 20 warm runs against performance budgets in SYSTEM_DESIGN.md §5.
Works cross-platform (Windows & Linux).
"""

from datetime import UTC, date, datetime, time
import os
import sys
import time as pytime
import numpy as np
import pandas as pd

from app.domain.align import align
from app.domain.metrics import by_horizon, summary
from app.domain.risk import band, calibration, error_sample, errors_by_day
from app.domain.selection import select_day_ahead, select_lead_time


def load_data(snapshot_dir: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    act_path = os.path.join(snapshot_dir, "actuals.parquet")
    fc_path = os.path.join(snapshot_dir, "forecasts.parquet")

    if not os.path.exists(act_path) or not os.path.exists(fc_path):
        raise FileNotFoundError(f"Snapshot files not found at: {snapshot_dir}")

    df_act = pd.read_parquet(act_path)
    df_fc = pd.read_parquet(fc_path)
    return df_act, df_fc


def bench_operation(func, n_runs: int = 20) -> tuple[float, float, float]:
    """Run function n_runs times after 2 warm-ups and return (median_ms, min_ms, p95_ms)."""
    # 2 warm-up runs
    for _ in range(2):
        func()

    durations: list[float] = []
    for _ in range(n_runs):
        t0 = pytime.perf_counter()
        func()
        t1 = pytime.perf_counter()
        durations.append((t1 - t0) * 1000.0)

    med = float(np.median(durations))
    min_t = float(np.min(durations))
    p95 = float(np.quantile(durations, 0.95))
    return med, min_t, p95


def run_benchmarks(snapshot_dir: str) -> bool:
    print("=" * 80)
    print(f"DOMAIN ENGINE BENCHMARKS (20 warm runs, snapshot: {snapshot_dir})")
    print("=" * 80)

    df_act, df_fc = load_data(snapshot_dir)
    print(f"Loaded snapshot: actuals ({len(df_act)} rows), forecasts ({len(df_fc)} rows)")

    start_jan = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_jan = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

    # 1. Lead-time selection (H=24) + align + summary (Jan 2026)
    def op_lead_time_summary():
        sel = select_lead_time(df_fc, H=24.0)
        matched, _ = align(sel, df_act, start_jan, end_jan)
        _ = summary(matched)

    # 2. by_horizon(0..66h, step=1h) over January 2026
    def op_by_horizon():
        _ = by_horizon(df_fc, df_act, start_jan, end_jan, max_h=66, step=1)

    # 3. Single-day day-ahead decision + risk band (e.g. 2026-01-15)
    d_target = date(2026, 1, 15)
    def op_day_ahead_single():
        sel = select_day_ahead(df_fc, cutoff_local=time(9, 0))
        matched, _ = align(sel, df_act, datetime(2025, 12, 1, 0, 0, tzinfo=UTC), end_jan)
        daily_errs = errors_by_day(matched)
        sample = error_sample(daily_errs, D=d_target, window_days=14, min_days=7)
        if sample is not None:
            # 24 periods for target day
            day_fc = sel[
                (sel["start_time"] >= datetime(2026, 1, 15, 0, 0, tzinfo=UTC))
                & (sel["start_time"] < datetime(2026, 1, 16, 0, 0, tzinfo=UTC))
            ]["forecast_mw"].to_numpy()
            _ = band(day_fc, sample, q=0.90)

    # 4. Day-ahead full month (31 days) + calibration backtest
    def op_day_ahead_calibration():
        sel = select_day_ahead(df_fc, cutoff_local=time(9, 0))
        matched, _ = align(sel, df_act, datetime(2025, 12, 1, 0, 0, tzinfo=UTC), end_jan)
        _ = calibration(matched, q=0.90, window_days=14, min_days=7)

    benchmarks = [
        (
            "select_lead_time(H=24) + align + summary (31d)",
            op_lead_time_summary,
            100.0,  # budget in ms
        ),
        (
            "by_horizon(H=0..66h, step=1) (31d)",
            op_by_horizon,
            400.0,  # budget in ms (SYSTEM_DESIGN §5)
        ),
        (
            "day_ahead(09:00) + error_sample + risk.band (1d)",
            op_day_ahead_single,
            80.0,  # budget in ms
        ),
        (
            "day_ahead(09:00) + align + risk.calibration (all 31d)",
            op_day_ahead_calibration,
            300.0,  # budget in ms
        ),
    ]

    all_passed = True
    print(f"\n{'Operation':<52} | {'Median':<8} | {'Min':<8} | {'P95':<8} | {'Budget':<8} | Status")
    print("-" * 100)

    for name, op_func, budget_ms in benchmarks:
        med_ms, min_ms, p95_ms = bench_operation(op_func, n_runs=20)
        status = "PASS" if med_ms <= budget_ms else "FAIL"
        if status == "FAIL":
            all_passed = False
        print(
            f"{name:<52} | {med_ms:6.1f}ms | {min_ms:6.1f}ms | {p95_ms:6.1f}ms | {budget_ms:6.1f}ms | {status}"
        )

    print("-" * 100)
    print(f"Overall Result: {'ALL BUDGETS PASSED' if all_passed else 'SOME BUDGETS EXCEEDED'}\n")
    return all_passed


if __name__ == "__main__":
    snap = sys.argv[1] if len(sys.argv) > 1 else "backend/data/snapshot"
    if not os.path.exists(snap) and os.path.exists(os.path.join("..", snap)):
        snap = os.path.join("..", snap)
    success = run_benchmarks(snap)
    sys.exit(0 if success else 1)
