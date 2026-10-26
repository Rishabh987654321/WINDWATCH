"""Unit tests for snapshot profiling script."""

import os

import pytest

from app.ingest.profile import load_snapshot, run_profiling


def test_profile_runs_on_snapshot() -> None:
    """Verify run_profiling reads snapshot and generates 5 report sections."""
    snapshot_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "snapshot")
    )
    if not os.path.exists(os.path.join(snapshot_dir, "manifest.json")):
        pytest.skip("Snapshot files not present")

    df_act, df_fc, manifest = load_snapshot(snapshot_dir)
    assert not df_act.empty
    assert not df_fc.empty
    assert "snapshot_id" in manifest

    report = run_profiling(snapshot_dir)

    assert "section_1_row_counts_and_coverage" in report
    assert "section_2_publish_cadence" in report
    assert "section_3_cutoff_sensitivity" in report
    assert "section_4_horizon_distribution" in report
    assert "section_5_sanity_check" in report

    assert report["section_1_row_counts_and_coverage"]["actuals_row_count"] == len(df_act)
    assert len(report["section_3_cutoff_sensitivity"]["cutoffs_analyzed"]) == 4
    assert report["section_5_sanity_check"]["expected_hourly_targets"] == 744


def test_load_snapshot_missing(tmp_path) -> None:
    """Verify load_snapshot raises FileNotFoundError when snapshot files do not exist."""
    with pytest.raises(FileNotFoundError):
        load_snapshot(str(tmp_path))


def test_profile_main(monkeypatch: pytest.MonkeyPatch, tmp_path) -> None:
    """Verify profile main() invocation with CLI argument."""
    from app.ingest.profile import main

    snapshot_dir = os.path.abspath(
        os.path.join(os.path.dirname(__file__), "..", "..", "data", "snapshot")
    )
    if not os.path.exists(os.path.join(snapshot_dir, "manifest.json")):
        pytest.skip("Snapshot files not present")

    monkeypatch.setattr("sys.argv", ["profile.py", snapshot_dir])
    main()
