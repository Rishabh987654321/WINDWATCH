import json
import urllib.request
import sys

def check_calibration():
    print("=== STEP 0.1: CALIBRATION ARITHMETIC ===")
    url = "http://localhost:8000/api/v1/day-ahead/calibration?from=2026-01-01&to=2026-01-31&cutoff=09:00&risk_quantile=0.90&window_days=28"
    req = urllib.request.urlopen(url)
    data = json.loads(req.read().decode())
    print(f"Target quantile: {data['target_quantile']}")
    print(f"Realised coverage: {data['realised_coverage_pct']:.4f}%")
    print(f"Days count: {len(data['days'])}")

    total_hits = 0
    total_n = 0
    exact_100 = 0
    zero_hits = 0
    other_days = []

    for d in data["days"]:
        h = d["hits"]
        n = d["n"]
        cov = d["coverage_pct"]
        total_hits += h
        total_n += n
        if h == n:
            exact_100 += 1
        elif h == 0:
            zero_hits += 1
        else:
            other_days.append((d["date"], h, n, cov))
        print(f"{d['date']}: hits={h:2d}, n={n:2d}, coverage={cov:5.1f}%")

    print("-" * 50)
    print(f"Total: hits={total_hits}, n={total_n}")
    print(f"Days with 100%: {exact_100} days")
    print(f"Days with 0 hits: {zero_hits} days")
    print(f"Intermediate days ({len(other_days)} days):")
    for dt, h, n, cov in other_days:
        print(f"  {dt}: {h}/{n} ({cov:.1f}%)")

    assert total_hits == 659, f"Expected 659, got {total_hits}"
    assert total_n == 744, f"Expected 744, got {total_n}"
    print(f"ASSERTION PASSED: sum(hits) == 659 and sum(n) == 744")
    print(f"Arithmetic: 659 / 744 = {659 / 744 * 100:.4f}%")

if __name__ == "__main__":
    check_calibration()
