"""Cross-validation tests against the real Phase 1 snapshot.

Verifies domain engine reproduces Phase 1 profile sanity metrics and real-data smoke rules.
"""

import os
from datetime import UTC, date, datetime, time, timedelta

import pandas as pd
import pytest

from app.domain.align import align
from app.domain.metrics import summary
from app.domain.selection import select_day_ahead, select_lead_time

SNAPSHOT_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "..", "data", "snapshot")
)


def load_snapshot_data() -> tuple[pd.DataFrame, pd.DataFrame] | None:
    act_path = os.path.join(SNAPSHOT_DIR, "actuals.parquet")
    fc_path = os.path.join(SNAPSHOT_DIR, "forecasts.parquet")
    if not os.path.exists(act_path) or not os.path.exists(fc_path):
        return None
    return pd.read_parquet(act_path), pd.read_parquet(fc_path)


@pytest.mark.snapshot
def test_domain_reproduces_profile_sanity_numbers() -> None:
    """Cross-validation: select_lead_time(H=24) + align + summary over Jan 2026.

    Must reproduce the Phase 1 profile sanity check numbers:
    - n = 744
    - mae ≈ 2050.2 MW (tol 0.1 MW)
    - bias ≈ +1854.2 MW (tol 0.1 MW)
    - rmse ≈ 2518.0 MW (tol 0.1 MW)
    - corr ≈ 0.9402 (tol 0.0005)
    - nmae ≈ 17.70 % (tol 0.05 %)
    """
    data = load_snapshot_data()
    if data is None:
        pytest.skip("Snapshot files not present")

    df_act, df_fc = data

    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

    # 1. Select forecasts with horizon >= 24h
    sel = select_lead_time(df_fc, H=24.0)

    # 2. Align with actuals
    matched, cov = align(sel, df_act, start_eval, end_eval)

    # 3. Compute summary metrics
    s = summary(matched)

    assert s.n == 744
    assert cov.n_expected == 744
    assert cov.n_matched == 744
    assert cov.n_missing_actual == 0
    assert cov.n_missing_forecast == 0

    assert s.mae_mw is not None
    assert s.bias_mw is not None
    assert s.rmse_mw is not None
    assert s.corr is not None
    assert s.nmae_pct is not None

    assert abs(s.mae_mw - 2050.2) <= 0.1
    assert abs(s.bias_mw - 1854.2) <= 0.1
    assert abs(s.rmse_mw - 2518.0) <= 0.1
    assert abs(s.corr - 0.9402) <= 0.0005
    assert abs(s.nmae_pct - 17.70) <= 0.05


@pytest.mark.snapshot
def test_real_data_day_ahead_smoke() -> None:
    """Real-data smoke: Day-ahead at 09:00 for every January day.

    Must return 24 targets per day, all with publish_time = 07:30 UTC of D-1 and age = 1.5h.
    """
    data = load_snapshot_data()
    if data is None:
        pytest.skip("Snapshot files not present")

    df_act, df_fc = data

    # Select day-ahead with cutoff 09:00 London
    sel = select_day_ahead(df_fc, cutoff_local=time(9, 0))

    jan_dates = [date(2026, 1, d) for d in range(1, 32)]

    for d in jan_dates:
        d_prev = d - timedelta(days=1)
        start_d = datetime(d.year, d.month, d.day, 0, 0, tzinfo=UTC)
        end_d = datetime(d.year, d.month, d.day, 23, 59, 59, tzinfo=UTC)

        day_fc = sel[(sel["start_time"] >= start_d) & (sel["start_time"] <= end_d)]
        assert len(day_fc) == 24, f"Day {d} has {len(day_fc)} targets instead of 24"

        # Check publish time on D-1 at 07:30 UTC
        expected_pub = datetime(d_prev.year, d_prev.month, d_prev.day, 7, 30, tzinfo=UTC)
        cutoff_utc_dt = datetime(d_prev.year, d_prev.month, d_prev.day, 9, 0, tzinfo=UTC)
        for _, row in day_fc.iterrows():
            assert row["publish_time"] == expected_pub
            # Age at 09:00 London (09:00 UTC in winter) vs 07:30 publication = 1.5h
            age = (cutoff_utc_dt - row["publish_time"]).total_seconds() / 3600.0
            assert age == 1.5
