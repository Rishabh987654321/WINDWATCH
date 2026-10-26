import os
import sys

backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "backend"))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)
os.chdir(backend_dir)
from app.core.container import container

svc = container.metrics_service
cal = svc.get_calibration_table(lead_time_hours=24, window_days=28, quantile=0.90)

print(f"Summary coverage: {cal.coverage_pct}%, hits: {cal.hits}, n: {cal.n}")
total_hits = 0
total_n = 0
buckets = {}

for d in cal.daily_details:
    print(f"{d.delivery_date}: {d.hits}/{d.n} ({d.coverage_pct:.1f}%)")
    total_hits += d.hits
    total_n += d.n
    pct = round(d.coverage_pct, 1)
    if pct == 100.0:
        bucket = "100%"
    elif pct == 0.0:
        bucket = "0%"
    elif pct >= 80.0:
        bucket = "80-99%"
    else:
        bucket = "<80%"
    buckets[bucket] = buckets.get(bucket, 0) + 1

print("-" * 40)
print(f"Total: {total_hits}/{total_n}")
print("Bucket counts:", buckets)
assert total_hits == 659, f"Expected 659, got {total_hits}"
assert total_n == 744, f"Expected 744, got {total_n}"
print("ASSERTIONS PASSED: Σ hits == 659 and Σ n == 744")
