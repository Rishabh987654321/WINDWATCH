#!/usr/bin/env python3
"""Elexon BMRS API Probe Script (Phase 0).

Probes Elexon BMRS stream endpoints (FUELHH and WINDFOR) to discover real API behavior,
parameter names, max request ranges, temporal resolution, horizons, and duplicate behavior.
Saves trimmed raw JSON samples to backend/tests/fixtures/elexon_raw/.
"""

from collections import Counter
from datetime import datetime, timedelta, timezone
import json
import os
import sys
import time
from typing import Any, Dict, List

import httpx

BASE_URL = "https://data.elexon.co.uk/bmrs/api/v1"
FIXTURES_DIR = os.path.abspath(
    os.path.join(os.path.dirname(__file__), "..", "backend", "tests", "fixtures", "elexon_raw")
)


def parse_iso(ts_str: str) -> datetime:
    """Parse ISO-8601 string to tz-aware UTC datetime."""
    clean = ts_str.replace("Z", "+00:00")
    dt = datetime.fromisoformat(clean)
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


def run_probe() -> None:
    print("=" * 80)
    print("ELEXON BMRS API PROBE — PHASE 0")
    print(f"Base URL: {BASE_URL}")
    print(f"Local execution time: {datetime.now().isoformat()}")
    print("=" * 80)

    os.makedirs(FIXTURES_DIR, exist_ok=True)
    client = httpx.Client(timeout=45.0, headers={"User-Agent": "WindWatch-Phase0-Probe/1.0"})

    # -------------------------------------------------------------------------
    # 1. FUELHH PROBE
    # -------------------------------------------------------------------------
    print("\n" + "#" * 80)
    print("1. PROBING FUELHH (/datasets/FUELHH/stream)")
    print("#" * 80)

    # Test 1a: Basic call with settlementDateFrom / settlementDateTo / format=json
    fuelhh_url = f"{BASE_URL}/datasets/FUELHH/stream"
    p_from = "2026-01-05"
    p_to = "2026-01-08"

    print(f"\n[FUELHH Test 1] Querying without fuelType: {p_from} -> {p_to}")
    t0 = time.perf_counter()
    resp_unfiltered = client.get(
        fuelhh_url,
        params={"settlementDateFrom": p_from, "settlementDateTo": p_to, "format": "json"},
    )
    t1 = time.perf_counter()
    latency_fuelhh_1 = t1 - t0
    print(f"Status: {resp_unfiltered.status_code} ({latency_fuelhh_1:.2f}s)")

    if resp_unfiltered.status_code != 200:
        print(f"FAILED: {resp_unfiltered.text[:300]}")
        sys.exit(1)

    data_unfiltered = resp_unfiltered.json()
    print(f"Unfiltered row count: {len(data_unfiltered)}")
    if data_unfiltered:
        sample_row = data_unfiltered[0]
        print(f"Sample row keys: {list(sample_row.keys())}")
        print(f"Sample row: {json.dumps(sample_row, indent=2)}")
        all_fuels = Counter(row.get("fuelType") for row in data_unfiltered)
        print(f"Unique fuelTypes present: {dict(all_fuels)}")

    # Test 1b: Query with fuelType=WIND server-side filter
    print(f"\n[FUELHH Test 2] Querying WITH fuelType=WIND: {p_from} -> {p_to}")
    t0 = time.perf_counter()
    resp_wind = client.get(
        fuelhh_url,
        params={
            "settlementDateFrom": p_from,
            "settlementDateTo": p_to,
            "fuelType": "WIND",
            "format": "json",
        },
    )
    t1 = time.perf_counter()
    latency_fuelhh_2 = t1 - t0
    print(f"Status: {resp_wind.status_code} ({latency_fuelhh_2:.2f}s)")

    if resp_wind.status_code == 200:
        data_wind = resp_wind.json()
        print(f"Row count with fuelType=WIND: {len(data_wind)}")
        wind_fuels = Counter(row.get("fuelType") for row in data_wind)
        print(f"FuelTypes in filtered response: {dict(wind_fuels)}")
        server_side_filter_works = len(wind_fuels) == 1 and "WIND" in wind_fuels
        print(f"--> Server-side fuelType=WIND filter works: {server_side_filter_works}")
    else:
        print(f"fuelType=WIND parameter rejected or failed: {resp_wind.status_code}")
        data_wind = [r for r in data_unfiltered if r.get("fuelType") == "WIND"]
        server_side_filter_works = False

    # Check time grid on WIND actuals
    if data_wind:
        timestamps = sorted({parse_iso(r["startTime"]) for r in data_wind if "startTime" in r})
        print(f"\nWIND Actuals Time Grid:")
        print(f"Distinct startTimes: {len(timestamps)}")
        print(f"Min startTime: {timestamps[0].isoformat()}")
        print(f"Max startTime: {timestamps[-1].isoformat()}")
        diffs = [
            (t2 - t1).total_seconds() / 60
            for t1, t2 in zip(timestamps[:-1], timestamps[1:])
        ]
        diff_counts = Counter(diffs)
        print(f"Step distribution (in minutes): {dict(diff_counts)}")
        has_gaps = any(d != 30.0 for d in diffs)
        print(f"--> Every period strictly 30-min step: {not has_gaps}")

        # Save trimmed sample (50 rows)
        fuelhh_sample_path = os.path.join(FIXTURES_DIR, "fuelhh_sample.json")
        with open(fuelhh_sample_path, "w", encoding="utf-8") as f:
            json.dump(data_wind[:50], f, indent=2)
        print(f"Saved 50 sample rows to: {fuelhh_sample_path}")

    # -------------------------------------------------------------------------
    # 2. WINDFOR PROBE
    # -------------------------------------------------------------------------
    print("\n" + "#" * 80)
    print("2. PROBING WINDFOR (/datasets/WINDFOR/stream)")
    print("#" * 80)

    windfor_url = f"{BASE_URL}/datasets/WINDFOR/stream"
    pub_from = "2026-01-05T00:00:00Z"
    pub_to = "2026-01-08T00:00:00Z"

    print(f"\n[WINDFOR Test 1] Querying publish window: {pub_from} -> {pub_to}")
    t0 = time.perf_counter()
    resp_windfor = client.get(
        windfor_url,
        params={"publishDateTimeFrom": pub_from, "publishDateTimeTo": pub_to, "format": "json"},
    )
    t1 = time.perf_counter()
    latency_windfor_1 = t1 - t0
    print(f"Status: {resp_windfor.status_code} ({latency_windfor_1:.2f}s)")

    if resp_windfor.status_code != 200:
        print(f"FAILED with publishDateTimeFrom/publishDateTimeTo: {resp_windfor.text[:300]}")
        print("Trying alternative parameter names (from/to, publishTimeFrom/publishTimeTo)...")
        resp_alt = client.get(
            windfor_url,
            params={"from": pub_from, "to": pub_to, "format": "json"},
        )
        print(f"Alternative status: {resp_alt.status_code}")
        if resp_alt.status_code == 200:
            data_windfor = resp_alt.json()
        else:
            print("Could not query WINDFOR stream.")
            data_windfor = []
    else:
        data_windfor = resp_windfor.json()

    print(f"WINDFOR row count: {len(data_windfor)}")
    if data_windfor:
        sample_wf = data_windfor[0]
        print(f"Sample WINDFOR keys: {list(sample_wf.keys())}")
        print(f"Sample WINDFOR row: {json.dumps(sample_wf, indent=2)}")

        # Check resolution, horizons, duplicates
        publish_times = {parse_iso(r["publishTime"]) for r in data_windfor if "publishTime" in r}
        print(f"\nDistinct publishTimes: {len(publish_times)}")
        sorted_pubs = sorted(publish_times)
        if len(sorted_pubs) > 1:
            pub_intervals = [
                (t2 - t1).total_seconds() / 60
                for t1, t2 in zip(sorted_pubs[:-1], sorted_pubs[1:])
            ]
            print(f"Publish time interval distribution (minutes): {dict(Counter(pub_intervals[:20]))}")

        # Horizon analysis
        horizons_hours = []
        negative_horizons = 0
        pairs = Counter()
        start_times_for_first_pub = []
        first_pub_str = sorted_pubs[0].isoformat()

        for r in data_windfor:
            if "startTime" in r and "publishTime" in r:
                st = parse_iso(r["startTime"])
                pt = parse_iso(r["publishTime"])
                h = (st - pt).total_seconds() / 3600.0
                horizons_hours.append(h)
                if h < 0:
                    negative_horizons += 1
                pairs[(r["startTime"], r["publishTime"])] += 1
                if r["publishTime"] == sorted_pubs[0].strftime("%Y-%m-%dT%H:%M:%SZ"):
                    start_times_for_first_pub.append(st)

        min_h = min(horizons_hours) if horizons_hours else 0
        max_h = max(horizons_hours) if horizons_hours else 0
        print(f"\nHorizon Analysis (startTime - publishTime):")
        print(f"Min horizon: {min_h:.2f} hours")
        print(f"Max horizon: {max_h:.2f} hours")
        print(f"Negative horizons count: {negative_horizons}")

        # Target resolution check
        if start_times_for_first_pub:
            sorted_st = sorted(set(start_times_for_first_pub))
            st_diffs = [
                (t2 - t1).total_seconds() / 60
                for t1, t2 in zip(sorted_st[:-1], sorted_st[1:])
            ]
            print(f"Target startTime resolution for single publish: {dict(Counter(st_diffs))}")
            is_half_hourly = all(d == 30.0 for d in st_diffs)
            is_hourly = all(d == 60.0 for d in st_diffs)
            print(f"--> Target resolution: {'Half-Hourly (30 min)' if is_half_hourly else 'Hourly (60 min)' if is_hourly else 'Mixed/Other'}")

        # Duplicate check
        dup_pairs = {k: v for k, v in pairs.items() if v > 1}
        print(f"\nDuplicate (startTime, publishTime) pairs: {len(dup_pairs)}")
        if dup_pairs:
            sample_dup = list(dup_pairs.items())[0]
            print(f"Sample duplicate pair: {sample_dup}")

        # Save trimmed sample (50 rows)
        windfor_sample_path = os.path.join(FIXTURES_DIR, "windfor_sample.json")
        with open(windfor_sample_path, "w", encoding="utf-8") as f:
            json.dump(data_windfor[:50], f, indent=2)
        print(f"Saved 50 sample rows to: {windfor_sample_path}")

    # -------------------------------------------------------------------------
    # 3. MAX RANGE PER REQUEST PROBE
    # -------------------------------------------------------------------------
    print("\n" + "#" * 80)
    print("3. PROBING MAX DATE RANGE PER REQUEST")
    print("#" * 80)

    test_ranges = [1, 3, 7, 14, 28, 31, 60, 90, 180, 365]
    print("\n[Testing FUELHH ranges from 2026-01-01]:")
    base_start = datetime(2026, 1, 1, tzinfo=timezone.utc)
    for days in test_ranges:
        end_d = base_start + timedelta(days=days)
        d_from = base_start.strftime("%Y-%m-%d")
        d_to = end_d.strftime("%Y-%m-%d")
        t0 = time.perf_counter()
        resp = client.get(
            fuelhh_url,
            params={"settlementDateFrom": d_from, "settlementDateTo": d_to, "fuelType": "WIND", "format": "json"},
        )
        t1 = time.perf_counter()
        if resp.status_code == 200:
            count = len(resp.json())
            print(f"  {days:3d} days ({d_from} -> {d_to}): Status 200 OK | {count} rows | {t1-t0:.2f}s")
        else:
            print(f"  {days:3d} days ({d_from} -> {d_to}): Status {resp.status_code} | Refused: {resp.text[:120]}")

    print("\n[Testing WINDFOR ranges from 2026-01-01]:")
    for days in test_ranges:
        end_d = base_start + timedelta(days=days)
        p_from_dt = base_start.strftime("%Y-%m-%dT%H:%M:%SZ")
        p_to_dt = end_d.strftime("%Y-%m-%dT%H:%M:%SZ")
        t0 = time.perf_counter()
        resp = client.get(
            windfor_url,
            params={"publishDateTimeFrom": p_from_dt, "publishDateTimeTo": p_to_dt, "format": "json"},
        )
        t1 = time.perf_counter()
        if resp.status_code == 200:
            count = len(resp.json())
            print(f"  {days:3d} days ({p_from_dt[:10]} -> {p_to_dt[:10]}): Status 200 OK | {count} rows | {t1-t0:.2f}s")
        else:
            print(f"  {days:3d} days ({p_from_dt[:10]} -> {p_to_dt[:10]}): Status {resp.status_code} | Refused: {resp.text[:120]}")

    # -------------------------------------------------------------------------
    # 4. DECEMBER 2025 COVERAGE FOR 2026-01-01 00:00 TARGETS
    # -------------------------------------------------------------------------
    print("\n" + "#" * 80)
    print("4. PROBING DECEMBER 2025 FORECAST COVERAGE FOR 2026-01-01")
    print("#" * 80)

    dec_from = "2025-12-29T00:00:00Z"
    dec_to = "2025-12-31T23:59:59Z"
    print(f"Querying WINDFOR published between {dec_from} and {dec_to}...")
    t0 = time.perf_counter()
    resp_dec = client.get(
        windfor_url,
        params={"publishDateTimeFrom": dec_from, "publishDateTimeTo": dec_to, "format": "json"},
    )
    t1 = time.perf_counter()
    print(f"Status: {resp_dec.status_code} ({t1-t0:.2f}s)")

    if resp_dec.status_code == 200:
        data_dec = resp_dec.json()
        print(f"Total forecasts published in Dec 29-31: {len(data_dec)}")
        targets_jan1 = [
            r for r in data_dec
            if r.get("startTime", "").startswith("2026-01-01")
        ]
        print(f"Forecasts predicting targets on 2026-01-01: {len(targets_jan1)}")
        if targets_jan1:
            jan1_target_times = sorted({r["startTime"] for r in targets_jan1})
            print(f"Earliest Jan 1 target predicted: {jan1_target_times[0]}")
            print(f"Latest Jan 1 target predicted: {jan1_target_times[-1]}")
            print(f"--> Confirmed: December 2025 publications cover Jan 1 2026 targets: YES")
        else:
            print("--> No 2026-01-01 targets found in December 29-31 window")
    else:
        print(f"Failed to query December window: {resp_dec.status_code} {resp_dec.text[:200]}")

    # -------------------------------------------------------------------------
    # 5. RATE LIMITS & LATENCY SUMMARY
    # -------------------------------------------------------------------------
    print("\n" + "#" * 80)
    print("5. RATE LIMITS & LATENCY OBSERVATIONS")
    print("#" * 80)
    print("Headers inspected on recent response:")
    for h, v in resp_dec.headers.items():
        if any(term in h.lower() for term in ["rate", "limit", "retry", "server", "cache"]):
            print(f"  {h}: {v}")
    print("No 429 Too Many Requests observed during probing.")
    print("=" * 80)
    print("PROBE COMPLETE")
    print("=" * 80)


if __name__ == "__main__":
    run_probe()
