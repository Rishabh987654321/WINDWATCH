"""Benchmark script evaluating API latency against SYSTEM_DESIGN.md §5 budgets.

Windows-safe, in-process ASGI client against real production snapshot.
Measures cold (first call) and warm (median/p95 over 20 runs) latencies.
"""

import sys
import time
from pathlib import Path
from typing import NamedTuple

import numpy as np
from fastapi.testclient import TestClient

# Ensure backend is in python path
ROOT_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT_DIR / "backend"))

import logging
import structlog

from app.config import settings
from app.data.store import store
from app.main import app
from app.services import analytics

# Quiet down request logs during benchmarking
structlog.configure(
    wrapper_class=structlog.make_filtering_bound_logger(logging.WARNING),
)


class EndpointBenchmark(NamedTuple):
    name: str
    url: str
    cold_budget_ms: float
    warm_budget_ms: float


BENCHMARKS: list[EndpointBenchmark] = [
    EndpointBenchmark(
        name="/meta",
        url="/api/v1/meta",
        cold_budget_ms=20.0,
        warm_budget_ms=5.0,
    ),
    EndpointBenchmark(
        name="/series (31d)",
        url="/api/v1/series?from=2026-01-01&to=2026-01-31&policy=day_ahead&cutoff=09:00",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/day-ahead/{d}",
        url="/api/v1/day-ahead/2026-01-15?cutoff=09:00&risk_quantile=0.9&window_days=14",
        cold_budget_ms=300.0,
        warm_budget_ms=80.0,
    ),
    EndpointBenchmark(
        name="/day-ahead/calibration",
        url="/api/v1/day-ahead/calibration?from=2026-01-01&to=2026-01-31&cutoff=09:00&risk_quantile=0.9&window_days=14",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/metrics/by-horizon (0-66h)",
        url="/api/v1/metrics/by-horizon?from=2026-01-01&to=2026-01-31&step_hours=1&max_hours=66",
        cold_budget_ms=1500.0,
        warm_budget_ms=400.0,
    ),
    EndpointBenchmark(
        name="/metrics/summary",
        url="/api/v1/metrics/summary?from=2026-01-01&to=2026-01-31&policy=lead_time&horizon_hours=24",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/metrics/by-hour",
        url="/api/v1/metrics/by-hour?from=2026-01-01&to=2026-01-31&policy=day_ahead&cutoff=09:00",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/metrics/by-level",
        url="/api/v1/metrics/by-level?from=2026-01-01&to=2026-01-31&policy=day_ahead&cutoff=09:00&bins=5",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/metrics/distribution",
        url="/api/v1/metrics/distribution?from=2026-01-01&to=2026-01-31&policy=day_ahead&cutoff=09:00&bin_width_mw=250",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/metrics/heatmap",
        url="/api/v1/metrics/heatmap?from=2026-01-01&to=2026-01-31&policy=day_ahead&cutoff=09:00",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
    EndpointBenchmark(
        name="/vintages",
        url="/api/v1/vintages?target=2026-01-15T12:00:00Z",
        cold_budget_ms=300.0,
        warm_budget_ms=100.0,
    ),
]


def clear_service_caches() -> None:
    """Clear all service-layer LRU caches."""
    analytics._get_selected_and_aligned.cache_clear()
    analytics._get_daily_errors.cache_clear()
    analytics._get_by_horizon_points.cache_clear()
    analytics._get_calibration_cached.cache_clear()
    analytics._get_meta_cached.cache_clear()
    analytics._get_series_cached.cache_clear()
    analytics._get_heatmap_cached.cache_clear()


def run_benchmarks() -> bool:
    print("=" * 96)
    print(" WindWatch API Latency Benchmark — SYSTEM_DESIGN.md §5 Budgets")
    print("=" * 96)

    real_snapshot = settings.resolved_snapshot_dir()
    print(f"Loading real snapshot: {real_snapshot}")
    store.load(real_snapshot)
    assert store.is_ready, f"Failed to load snapshot: {store.load_error}"

    client = TestClient(app)

    # Initial app stack warmup (Starlette router/middleware dispatch initialization)
    client.get("/api/v1/health")

    header = f"{'Endpoint':<26} | {'Cold (ms)':<9} | {'Cold Budget':<11} | {'Med (ms)':<8} | {'p95 (ms)':<8} | {'Warm Budget':<11} | {'Status'}"
    print("-" * len(header))
    print(header)
    print("-" * len(header))

    all_passed = True

    for bm in BENCHMARKS:
        # Clear cache for honest cold measurement
        clear_service_caches()

        # Cold run
        t0 = time.perf_counter()
        resp_cold = client.get(bm.url)
        client_cold_ms = (time.perf_counter() - t0) * 1000.0
        cold_ms = float(resp_cold.headers.get("X-Process-Time", client_cold_ms))
        assert resp_cold.status_code == 200, f"Error {resp_cold.status_code} on {bm.url}"

        # 20 Warm runs
        warm_times_ms: list[float] = []
        for _ in range(20):
            t1 = time.perf_counter()
            resp_warm = client.get(bm.url)
            client_warm_ms = (time.perf_counter() - t1) * 1000.0
            server_warm_ms = float(resp_warm.headers.get("X-Process-Time", client_warm_ms))
            assert resp_warm.status_code == 200
            warm_times_ms.append(server_warm_ms)

        med_ms = float(np.median(warm_times_ms))
        p95_ms = float(np.percentile(warm_times_ms, 95))

        cold_ok = cold_ms <= bm.cold_budget_ms
        warm_ok = p95_ms <= bm.warm_budget_ms
        passed = cold_ok and warm_ok

        if not passed:
            all_passed = False

        status_str = "PASS" if passed else "FAIL"

        row = (
            f"{bm.name:<26} | "
            f"{cold_ms:>8.1f}  | "
            f"<{bm.cold_budget_ms:<9.0f} | "
            f"{med_ms:>7.2f}  | "
            f"{p95_ms:>7.2f}  | "
            f"<{bm.warm_budget_ms:<9.0f} | "
            f"{status_str}"
        )
        print(row)

    print("-" * len(header))
    if all_passed:
        print("RESULT: ALL ENDPOINTS PASSED LATENCY BUDGETS.")
    else:
        print("RESULT: SOME ENDPOINTS EXCEEDED LATENCY BUDGETS.")
    print("=" * 96)
    return all_passed


if __name__ == "__main__":
    success = run_benchmarks()
    sys.exit(0 if success else 1)
