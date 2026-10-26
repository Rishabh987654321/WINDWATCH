import urllib.request
import json
import subprocess
import sys

def check_h_numbers():
    print("=== STEP 0.2: CHECK 12-HOUR HORIZON NUMBERS ===")
    
    # 1. Summary at H = 0, 12, 24
    for h in [0, 12, 24]:
        url = f"http://localhost:8000/api/v1/metrics/summary?policy=lead_time&horizon_hours={h}&from=2026-01-01&to=2026-01-31"
        req = urllib.request.urlopen(url)
        data = json.loads(req.read().decode())
        print(f"\n--- /metrics/summary at H = {h} ---")
        print(json.dumps(data, indent=2))

    # 2. /metrics/by-horizon points for H = 0, 6, 12, 24, 36
    url = "http://localhost:8000/api/v1/metrics/by-horizon?from=2026-01-01&to=2026-01-31&step_hours=6&max_hours=48"
    req = urllib.request.urlopen(url)
    by_h = json.loads(req.read().decode())
    print("\n--- /metrics/by-horizon points ---")
    for pt in by_h["points"]:
        if pt["horizon_hours"] in [0, 6, 12, 24, 36]:
            print(f"H={pt['horizon_hours']:2d}h -> MAE: {pt['mae_mw']} MW, Bias: {pt['bias_mw']} MW, RMSE: {pt['rmse_mw']} MW, n: {pt['n']}")

    # 3. Run bias_diagnostic.py
    print("\n--- scripts/bias_diagnostic.py horizon buckets ---")
    cmd = [sys.executable, "scripts/bias_diagnostic.py", "backend/data/snapshot"]
    res = subprocess.run(cmd, capture_output=True, text=True)
    for line in res.stdout.splitlines():
        if "00-12h" in line or "12-24h" in line or "24-36h" in line or "36-48h" in line or "48h+" in line or "Lead Time Horizon Bucket" in line:
            print(line)

if __name__ == "__main__":
    check_h_numbers()
