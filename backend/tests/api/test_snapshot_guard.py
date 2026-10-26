"""CI Snapshot Guard test verifying committed Parquet files match manifest.json checksums."""

import json
from pathlib import Path

import pytest

from app.ingest.writer import calculate_file_sha256, compute_snapshot_id


def test_committed_snapshot_matches_manifest() -> None:
    """Verify that committed Parquet snapshot files match the SHA-256 in manifest.json."""
    # Find snapshot directory (from backend directory or root)
    possible_paths = [
        Path("data/snapshot"),
        Path("backend/data/snapshot"),
        Path("../data/snapshot"),
    ]
    snapshot_dir = None
    for p in possible_paths:
        if (p / "manifest.json").exists():
            snapshot_dir = p
            break

    if snapshot_dir is None:
        pytest.skip("Snapshot directory not found (may not be built yet)")

    manifest_path = snapshot_dir / "manifest.json"
    actuals_path = snapshot_dir / "actuals.parquet"
    forecasts_path = snapshot_dir / "forecasts.parquet"

    assert actuals_path.exists(), f"Missing actuals.parquet in {snapshot_dir}"
    assert forecasts_path.exists(), f"Missing forecasts.parquet in {snapshot_dir}"

    with open(manifest_path, encoding="utf-8") as f:
        manifest = json.load(f)

    # Compute actual hashes
    actuals_sha = calculate_file_sha256(str(actuals_path))
    forecasts_sha = calculate_file_sha256(str(forecasts_path))
    expected_snapshot_id = compute_snapshot_id(actuals_sha, forecasts_sha)

    # Find sources in manifest
    manifest_sources = {s["dataset"]: s for s in manifest.get("sources", [])}
    assert "FUELHH" in manifest_sources, "FUELHH entry missing in manifest.json sources"
    assert "WINDFOR" in manifest_sources, "WINDFOR entry missing in manifest.json sources"

    assert manifest_sources["FUELHH"]["sha256"] == actuals_sha, (
        f"actuals.parquet SHA-256 mismatch! "
        f"Recorded in manifest: {manifest_sources['FUELHH']['sha256']}, "
        f"Actual file hash: {actuals_sha}"
    )

    assert manifest_sources["WINDFOR"]["sha256"] == forecasts_sha, (
        f"forecasts.parquet SHA-256 mismatch! "
        f"Recorded in manifest: {manifest_sources['WINDFOR']['sha256']}, "
        f"Actual file hash: {forecasts_sha}"
    )

    assert manifest.get("snapshot_id") == expected_snapshot_id, (
        f"snapshot_id mismatch! "
        f"Recorded: {manifest.get('snapshot_id')}, "
        f"Expected: {expected_snapshot_id}"
    )
