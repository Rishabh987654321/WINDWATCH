import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from app.config import settings
from app.data.store import store
from app.domain.selection import select_day_ahead
from app.domain.risk import calibration, errors_by_day, error_sample
from app.domain.timeutil import LONDON_TZ
import numpy as np

store.load(settings.resolved_snapshot_dir())

from datetime import date, time
from app.domain.align import align
from app.services.analytics import COVERAGE_START_UTC, COVERAGE_END_UTC

cutoff_t = time.fromisoformat("09:00")
full_selected = select_day_ahead(store.forecasts, cutoff_t)
full_aligned, _ = align(full_selected, store.actuals, COVERAGE_START_UTC, COVERAGE_END_UTC)
calib = calibration(full_aligned, q=0.90, window_days=28, min_days=5)

full_aligned["london_date"] = full_aligned["start_time"].dt.tz_convert(LONDON_TZ).dt.date
daily_errs = errors_by_day(full_aligned)
unique_dates = sorted(set(full_aligned["london_date"]))

print(f"Risk quantile: {calib.risk_quantile}")
print(f"Realised coverage: {calib.realised_coverage_pct}%")

total_hits = 0
total_n = 0
day_records = []

jan_dates = [d for d in unique_dates if d >= date(2026, 1, 1) and d <= date(2026, 1, 31)]

for d in jan_dates:
    sample = error_sample(daily_errs, D=d, window_days=28, min_days=5)
    if sample is None:
        continue
    day_group = full_aligned[full_aligned["london_date"] == d]
    if day_group.empty:
        continue
    over_q = float(np.quantile(sample, 0.90, method="linear"))
    f_arr = day_group["forecast_mw"].to_numpy(dtype=float)
    act_arr = day_group["actual_mw"].to_numpy(dtype=float)
    firm_wind = np.maximum(0.0, f_arr - over_q)
    hits = int(np.sum(act_arr >= firm_wind))
    n = len(act_arr)
    cov = (hits / n) * 100.0
    day_records.append((d, hits, n, cov))
    total_hits += hits
    total_n += n
    print(f"{d}: hits={hits:2d}, n={n:2d}, coverage={cov:5.1f}%")

print("-" * 45)
print(f"Total: hits={total_hits}, n={total_n}")
print(f"Arithmetic: {total_hits} / {total_n} = {(total_hits / total_n) * 100.0:.4f}% (rounded to {round(total_hits/total_n*100, 2)}%)")

assert total_hits == 659, f"Expected 659, got {total_hits}"
assert total_n == 744, f"Expected 744, got {total_n}"
print("ASSERTION PASSED: sum(hits) == 659 and sum(n) == 744")

# Categorize days
c_100 = [r for r in day_records if r[1] == r[2]]
c_0 = [r for r in day_records if r[1] == 0]
c_other = [r for r in day_records if r[1] > 0 and r[1] < r[2]]

print(f"\nBreakdown:")
print(f"  Days at 100% (24/24): {len(c_100)} days")
print(f"  Days at 0% (0/24): {len(c_0)} days (Dates: {[str(r[0]) for r in c_0]})")
print(f"  Other days: {len(c_other)} days:")
for r in c_other:
    print(f"    {r[0]}: {r[1]}/{r[2]} ({r[3]:.1f}%)")
