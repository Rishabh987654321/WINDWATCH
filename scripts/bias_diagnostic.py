"""Diagnostic script: Investigating the +1.85 GW wind forecast bias in January 2026.

Analyzes alignment variants, temporal and level decompositions, and scope scaling.
"""

from datetime import UTC, datetime, timedelta
import os
import sys
from zoneinfo import ZoneInfo
import numpy as np
import pandas as pd

LONDON_TZ = ZoneInfo("Europe/London")


def load_data(snapshot_dir: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    act_path = os.path.join(snapshot_dir, "actuals.parquet")
    fc_path = os.path.join(snapshot_dir, "forecasts.parquet")

    if not os.path.exists(act_path) or not os.path.exists(fc_path):
        raise FileNotFoundError(f"Snapshot files not found in {snapshot_dir}")

    df_act = pd.read_parquet(act_path)
    df_fc = pd.read_parquet(fc_path)
    return df_act, df_fc


def run_diagnostic(snapshot_dir: str) -> dict:
    df_act, df_fc = load_data(snapshot_dir)

    # 1. Target evaluation range: Jan 1 00:00 to Jan 31 23:00 (744 hours)
    start_eval = datetime(2026, 1, 1, 0, 0, tzinfo=UTC)
    end_eval = datetime(2026, 2, 1, 0, 0, tzinfo=UTC)

    # Baseline selection: Latest forecast with horizon_h >= 24
    fc_jan = df_fc[
        (df_fc["start_time"] >= start_eval)
        & (df_fc["start_time"] < end_eval)
        & (df_fc["horizon_h"] >= 24.0)
    ].copy()

    # Deterministic select latest publish_time per start_time
    fc_selected = (
        fc_jan.sort_values(["start_time", "publish_time", "horizon_h"], ascending=[True, False, True])
        .groupby("start_time")
        .first()
        .reset_index()
    )

    print(f"Matched {len(fc_selected)} hourly forecast targets in January 2026.")

    # Build actual variants
    # Index actuals by start_time
    act_map = dict(zip(df_act["start_time"], df_act["actual_mw"]))

    eval_targets = sorted(fc_selected["start_time"].unique())

    records = []
    for _, row in fc_selected.iterrows():
        t = row["start_time"]
        fc_mw = row["forecast_mw"]

        act_00 = act_map.get(t)
        act_30 = act_map.get(t + timedelta(minutes=30))
        act_prev_30 = act_map.get(t - timedelta(minutes=30))

        act_hour_avg = (
            (act_00 + act_30) / 2.0 if act_00 is not None and act_30 is not None else None
        )
        act_prev_hour_avg = (
            (act_prev_30 + act_00) / 2.0 if act_prev_30 is not None and act_00 is not None else None
        )

        records.append(
            {
                "start_time": t,
                "publish_time": row["publish_time"],
                "horizon_h": row["horizon_h"],
                "forecast_mw": fc_mw,
                "act_00": act_00,
                "act_30": act_30,
                "act_prev_30": act_prev_30,
                "act_hour_avg": act_hour_avg,
                "act_prev_hour_avg": act_prev_hour_avg,
            }
        )

    df_eval = pd.DataFrame(records)

    # =========================================================================
    # PART 1: Alignment / Lag Test
    # =========================================================================
    print("\n" + "=" * 80)
    print("PART 1: ALIGNMENT / LAG TEST (H >= 24h selection, n = 744)")
    print("=" * 80)

    variants = [
        ("actual_00 (Current Default :00)", "act_00"),
        ("actual_30 (:30 same hour)", "act_30"),
        ("actual_prev_30 (:30 previous hour)", "act_prev_30"),
        ("actual_hour_avg (:00 and :30 same hour)", "act_hour_avg"),
        ("actual_prev_hour_avg (prev :30 and :00)", "act_prev_hour_avg"),
    ]

    p1_results = {}
    baseline_mae = None

    for label, col in variants:
        err = df_eval["forecast_mw"] - df_eval[col]
        mae = float(err.abs().mean())
        bias = float(err.mean())
        rmse = float(np.sqrt((err**2).mean()))
        corr = float(df_eval["forecast_mw"].corr(df_eval[col]))

        if baseline_mae is None:
            baseline_mae = mae
            mae_diff_pct = 0.0
        else:
            mae_diff_pct = ((mae - baseline_mae) / baseline_mae) * 100.0

        p1_results[col] = {
            "label": label,
            "mae_mw": round(mae, 1),
            "bias_mw": round(bias, 1),
            "rmse_mw": round(rmse, 1),
            "corr": round(corr, 4),
            "mae_change_pct": round(mae_diff_pct, 2),
        }

        print(
            f"{label:<42} | MAE: {mae:7.1f} MW ({mae_diff_pct:+5.2f}%) | "
            f"Bias: {bias:+7.1f} MW | RMSE: {rmse:7.1f} MW | Corr: {corr:.4f}"
        )

    # =========================================================================
    # PART 2: Bias Decomposition
    # =========================================================================
    print("\n" + "=" * 80)
    print("PART 2: BIAS DECOMPOSITION (using default act_00)")
    print("=" * 80)

    df_eval["error_mw"] = df_eval["forecast_mw"] - df_eval["act_00"]
    df_eval["london_dt"] = df_eval["start_time"].dt.tz_convert(LONDON_TZ)
    df_eval["london_date"] = df_eval["london_dt"].dt.date
    df_eval["london_hour"] = df_eval["london_dt"].dt.hour

    # 1. Share of days with positive mean error
    daily_bias = df_eval.groupby("london_date")["error_mw"].mean()
    pos_days = (daily_bias > 0).sum()
    share_pos_days = (pos_days / len(daily_bias)) * 100.0
    print(f"Daily bias: {pos_days}/{len(daily_bias)} days ({share_pos_days:.1f}%) had positive mean error.")

    # 2. Bias by hour of day (London)
    hourly_bias = df_eval.groupby("london_hour")["error_mw"].agg(["mean", "count"])
    print("\nHourly Bias (sample: 00, 06, 12, 18):")
    for h in [0, 4, 8, 12, 16, 20]:
        print(f"  Hour {h:02d}:00 London -> Bias: {hourly_bias.loc[h, 'mean']:+7.1f} MW")

    # 3. Bias by forecast tercile
    df_eval["fc_tercile"] = pd.qcut(df_eval["forecast_mw"], q=3, labels=["T1_Low", "T2_Mid", "T3_High"])
    tercile_stats = df_eval.groupby("fc_tercile", observed=False).agg(
        mean_fc=("forecast_mw", "mean"),
        mean_act=("act_00", "mean"),
        bias=("error_mw", "mean"),
        mae=("error_mw", lambda x: x.abs().mean()),
        count=("error_mw", "count"),
    )
    tercile_stats["act_to_fc_ratio"] = tercile_stats["mean_act"] / tercile_stats["mean_fc"]
    print("\nBias by Forecast-Level Tercile:")
    print(tercile_stats.to_string())

    # 4. Weekly bias (ISO calendar weeks)
    df_eval["week"] = df_eval["london_dt"].dt.isocalendar().week
    weekly_records = []
    for w, g in df_eval.groupby("week"):
        start_date = g["london_dt"].min().strftime("%Y-%m-%d")
        end_date = g["london_dt"].max().strftime("%Y-%m-%d")
        n = len(g)
        sum_err = g["error_mw"].sum()
        mean_err = g["error_mw"].mean()
        weekly_records.append({
            "week": w,
            "date_range": f"{start_date} to {end_date}",
            "n": n,
            "sum_error_mw": sum_err,
            "mean_error_mw": mean_err,
        })
    df_weekly = pd.DataFrame(weekly_records)
    print("\nWeekly Bias (ISO weeks):")
    print(df_weekly.to_string(index=False))

    # Assert arithmetic closure
    sum_week_errors = df_weekly["sum_error_mw"].sum()
    sum_n = df_weekly["n"].sum()
    weighted_mean = sum_week_errors / sum_n
    monthly_mean = df_eval["error_mw"].mean()
    print(f"\nWeekly closure check: sum(week sums) / sum(n) = {sum_week_errors:.2f} / {sum_n} = {weighted_mean:.6f} MW")
    print(f"Monthly mean error:                            = {monthly_mean:.6f} MW")
    assert abs(weighted_mean - monthly_mean) < 1e-9, "Weekly bias arithmetic does not close!"

    # 5. Bias by Horizon Bucket
    print("\nBias by Lead Time Horizon Bucket (using latest forecast within each bucket):")
    buckets = [
        ("00-12h", 0, 12),
        ("12-24h", 12, 24),
        ("24-36h", 24, 36),
        ("36-48h", 36, 48),
        ("48h+", 48, 72),
    ]
    horizon_results = []
    for b_name, h_min, h_max in buckets:
        sub_fc = df_fc[
            (df_fc["start_time"] >= start_eval)
            & (df_fc["start_time"] < end_eval)
            & (df_fc["horizon_h"] >= h_min)
            & (df_fc["horizon_h"] < h_max)
        ]
        if not sub_fc.empty:
            sel = (
                sub_fc.sort_values(["start_time", "publish_time", "horizon_h"], ascending=[True, False, True])
                .groupby("start_time")
                .first()
                .reset_index()
            )
            merged = pd.merge(sel, df_eval[["start_time", "act_00"]], on="start_time")
            err = merged["forecast_mw"] - merged["act_00"]
            b_mae = err.abs().mean()
            b_bias = err.mean()
            b_rmse = np.sqrt((err**2).mean())
            horizon_results.append(
                {
                    "bucket": b_name,
                    "n": len(merged),
                    "bias_mw": round(b_bias, 1),
                    "mae_mw": round(b_mae, 1),
                    "rmse_mw": round(b_rmse, 1),
                }
            )
            print(f"  {b_name:<8} | n = {len(merged):3d} | Bias: {b_bias:+7.1f} MW | MAE: {b_mae:7.1f} MW")

    # =========================================================================
    # PART 3: Scope Scaling / Normalisation
    # =========================================================================
    print("\n" + "=" * 80)
    print("PART 3: SCOPE SCALING / NORMALISATION RATIOS")
    print("=" * 80)
    overall_mean_act = df_eval["act_00"].mean()
    overall_mean_fc = df_eval["forecast_mw"].mean()
    overall_ratio = overall_mean_act / overall_mean_fc
    print(f"Overall January Mean Actual:   {overall_mean_act:7.1f} MW")
    print(f"Overall January Mean Forecast: {overall_mean_fc:7.1f} MW")
    print(f"Overall Actual / Forecast:     {overall_ratio:.4f} (Actuals are {overall_ratio*100:.1f}% of forecast)")
    print(f"Scale Factor (Forecast / Act): {overall_mean_fc / overall_mean_act:.4f}")

    return {
        "p1_alignment": p1_results,
        "p2_terciles": tercile_stats.to_dict(),
        "p2_daily_pos_days": int(pos_days),
        "p2_daily_total_days": len(daily_bias),
        "overall_mean_act": round(overall_mean_act, 1),
        "overall_mean_fc": round(overall_mean_fc, 1),
    }


if __name__ == "__main__":
    snap_dir = sys.argv[1] if len(sys.argv) > 1 else "backend/data/snapshot"
    if not os.path.exists(snap_dir) and os.path.exists(os.path.join("..", snap_dir)):
        snap_dir = os.path.join("..", snap_dir)
    run_diagnostic(snap_dir)
