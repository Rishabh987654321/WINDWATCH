"""Smoke test against deployed or local stack.

Usage:
    python scripts/smoke_deployed.py <base_url> [--frontend-url <frontend_url>]

Examples:
    python scripts/smoke_deployed.py http://localhost:8080
    python scripts/smoke_deployed.py https://my-windwatch.vercel.app
    python scripts/smoke_deployed.py http://localhost:8000 --frontend-url http://localhost:5173
"""

import sys
import httpx

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass


def run_smoke(base_url: str, frontend_url: str | None = None) -> None:
    fe_url = (frontend_url or base_url).rstrip("/")
    api_url = base_url.rstrip("/")

    print("=" * 60)
    print("WINDWATCH DEPLOYMENT SMOKE TEST")
    print(f"API Base URL:      {api_url}")
    print(f"Frontend Base URL: {fe_url}")
    print("=" * 60)

    client = httpx.Client(timeout=15.0, follow_redirects=True)
    failures: list[str] = []

    # 1. Health check
    try:
        url = f"{api_url}/api/v1/health"
        print(f"Checking {url} ...", end=" ")
        resp = client.get(url)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        data = resp.json()
        assert data.get("status") == "ok", f"Expected status 'ok', got {data.get('status')}"
        print("[PASS]")
    except Exception as e:
        print(f"[FAIL]: {e}")
        failures.append(f"/api/v1/health: {e}")

    # 2. Meta check
    try:
        url = f"{api_url}/api/v1/meta"
        print(f"Checking {url} ...", end=" ")
        resp = client.get(url)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        meta = resp.json()
        meta_data = meta.get("data", {})
        snap_id = meta_data.get("snapshot_id")
        rel_h = meta_data.get("reliable_horizon_hours")
        assert snap_id, "Missing snapshot_id in meta response"
        assert isinstance(rel_h, int), f"reliable_horizon_hours must be int, got {type(rel_h)}"
        print(f"[PASS] (snapshot_id={snap_id[:20]}..., reliable_h={rel_h})")
    except Exception as e:
        print(f"[FAIL]: {e}")
        failures.append(f"/api/v1/meta: {e}")

    # 3. Headline Metrics Summary check
    try:
        url = (
            f"{api_url}/api/v1/metrics/summary"
            f"?policy=day_ahead&cutoff=09:00&from=2026-01-01&to=2026-01-31"
        )
        print(f"Checking {url} ...", end=" ")
        resp = client.get(url)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        summ = resp.json()
        n = summ.get("n")
        bias = summ.get("bias_mw")
        mae = summ.get("mae_mw")
        assert n == 744, f"Expected n=744, got {n}"
        assert abs(bias - 1851.5) <= 0.1, f"Expected bias ~ +1851.5, got {bias}"
        assert abs(mae - 2127.5) <= 0.1, f"Expected MAE ~ 2127.5, got {mae}"
        print(f"[PASS] (n={n}, bias={bias:.1f} MW, MAE={mae:.1f} MW)")
    except Exception as e:
        print(f"[FAIL]: {e}")
        failures.append(f"/api/v1/metrics/summary: {e}")

    # 4. Day-ahead 2026-01-15 check
    try:
        url = f"{api_url}/api/v1/day-ahead/2026-01-15"
        print(f"Checking {url} ...", end=" ")
        resp = client.get(url)
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        da = resp.json()
        periods = da.get("periods", [])
        assert len(periods) == 24, f"Expected 24 periods, got {len(periods)}"
        expected_pub = "2026-01-14T07:30:00Z"
        for idx, p in enumerate(periods):
            pub = p.get("forecast_published_at")
            assert pub == expected_pub, f"Period {idx} pub={pub} != {expected_pub}"
        print(f"[PASS] (24 periods, all published at {expected_pub})")
    except Exception as e:
        print(f"[FAIL]: {e}")
        failures.append(f"/api/v1/day-ahead/2026-01-15: {e}")

    # 5. Frontend HTML Routes check
    html_routes = [
        "/",
        "/day-ahead?d=2026-01-15",
        "/accuracy",
        "/methodology",
    ]
    for r in html_routes:
        try:
            url = f"{fe_url}{r}"
            print(f"Checking HTML route {url} ...", end=" ")
            resp = client.get(url)
            assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
            ctype = resp.headers.get("content-type", "")
            assert "text/html" in ctype or "<html" in resp.text.lower() or "<!doctype" in resp.text.lower(), (
                f"Expected HTML response, got Content-Type: {ctype}"
            )
            print("[PASS]")
        except Exception as e:
            print(f"[FAIL]: {e}")
            failures.append(f"HTML route {r}: {e}")

    print("-" * 60)
    if failures:
        print(f"SMOKE TEST FAILED with {len(failures)} failure(s):")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)

    print("ALL SMOKE TESTS PASSED SUCCESSFULLY! Deployment is ready.")
    sys.exit(0)


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)

    base = sys.argv[1]
    fe = None
    if "--frontend-url" in sys.argv:
        idx = sys.argv.index("--frontend-url")
        if idx + 1 < len(sys.argv):
            fe = sys.argv[idx + 1]

    run_smoke(base, fe)
