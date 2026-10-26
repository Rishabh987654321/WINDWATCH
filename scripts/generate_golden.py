"""Script to generate API golden response files from the mini fixture snapshot.

Run via 'make golden' or 'make.bat golden'.
"""

import json
import os
from pathlib import Path
from fastapi.testclient import TestClient

from app.config import settings
from app.data.store import store
from app.main import app

GOLDEN_DIR = Path(__file__).resolve().parent.parent / "backend" / "tests" / "fixtures" / "golden"
MINI_SNAPSHOT_DIR = Path(__file__).resolve().parent.parent / "backend" / "tests" / "fixtures" / "snapshot_mini"


GOLDEN_ENDPOINTS: dict[str, str] = {
    "health.json": "/api/v1/health",
    "ready.json": "/api/v1/ready",
    "meta.json": "/api/v1/meta",
    "series_lead_time.json": "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=lead_time&horizon_hours=12",
    "series_day_ahead.json": "/api/v1/series?from=2026-01-01&to=2026-01-02&policy=day_ahead&cutoff=09:00",
    "day_ahead_valid.json": "/api/v1/day-ahead/2026-01-02?cutoff=09:00&risk_quantile=0.9&window_days=7",
    "day_ahead_no_risk.json": "/api/v1/day-ahead/2025-12-21?cutoff=09:00&risk_quantile=0.9&window_days=7",
    "calibration.json": "/api/v1/day-ahead/calibration?from=2026-01-01&to=2026-01-03&cutoff=09:00&risk_quantile=0.9&window_days=7",
    "metrics_summary.json": "/api/v1/metrics/summary?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "metrics_by_horizon.json": "/api/v1/metrics/by-horizon?from=2026-01-01&to=2026-01-03&step_hours=6&max_hours=24",
    "metrics_by_hour.json": "/api/v1/metrics/by-hour?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "metrics_by_level.json": "/api/v1/metrics/by-level?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00&bins=4",
    "metrics_distribution.json": "/api/v1/metrics/distribution?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00&bin_width_mw=500",
    "metrics_heatmap.json": "/api/v1/metrics/heatmap?from=2026-01-01&to=2026-01-03&policy=day_ahead&cutoff=09:00",
    "vintages.json": "/api/v1/vintages?target=2026-01-02T12:00:00Z",
}


def generate_golden() -> None:
    GOLDEN_DIR.mkdir(parents=True, exist_ok=True)

    # Load mini fixture snapshot
    print(f"Loading mini snapshot from: {MINI_SNAPSHOT_DIR}")
    store.load(str(MINI_SNAPSHOT_DIR))
    assert store.is_ready, f"Mini store failed to load: {store.load_error}"

    client = TestClient(app)

    for filename, url in GOLDEN_ENDPOINTS.items():
        resp = client.get(url)
        assert resp.status_code == 200, f"Failed GET {url}: status {resp.status_code}, {resp.text}"

        data = resp.json()
        out_path = GOLDEN_DIR / filename
        with open(out_path, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, sort_keys=True)
            f.write("\n")
        print(f"  Generated {filename} from {url}")

    print(f"\nSuccessfully generated {len(GOLDEN_ENDPOINTS)} golden files in {GOLDEN_DIR}")


if __name__ == "__main__":
    generate_golden()
