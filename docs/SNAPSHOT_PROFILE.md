# Snapshot Profiling Report (Phase 1)

This document provides empirical analysis and characterisation of the ingested Elexon BMRS dataset snapshot covering the evaluation window (January 2026) and warm-up buffer (December 2025).

Snapshot ID: `sha256:9d90165f8183f8d3b618e34f8005c3d603a1ba32cb844af077c09acb6df4c9d7`  
Generated At: `2026-10-24T18:47:55Z`  
Storage Footprint:
- `actuals.parquet`: 36,613 bytes (35.8 KB)
- `forecasts.parquet`: 109,656 bytes (107.1 KB)
- `manifest.json`: 1,736 bytes (1.7 KB)
- **Total Snapshot Size**: 148,005 bytes (~144.5 KB, well below the 20 MB budget)

---

## 1. Row Counts, Coverage, and Quality Counters

### Actuals (`FUELHH` where fuelType = WIND)
- **Row count**: 2,976 rows (30-minute settlement period resolution).
- **Time range**: `2025-12-01T00:00:00Z` to `2026-01-31T23:30:00Z` (62 days × 48 half-hours = 2,976 periods).
- **Missing periods**: 0 (100% complete time grid across all 62 days).

### Forecasts (`WINDFOR`)
- **Row count (post-cleaning)**: 28,767 rows (hourly target resolution).
- **Target time range**: `2025-12-01T00:00:00Z` to `2026-01-31T23:00:00Z` (1,488 hourly periods).
- **Publish time range**: `2025-11-29T02:30:00Z` to `2026-01-31T22:30:00Z`.
- **Evaluation target hours covered (Jan 2026)**: 744 out of 744 (100% coverage, 0 missing hours).

### Quality Counters & Filtering
- `retrocast_rows_dropped`: **7,801 rows** (~21.3% of raw forecasts). These are publications where `startTime < publishTime` (negative horizons down to −25.5 h). Dropped as expected per ADR-011.
- `dropped_negative_generation`: 0 rows.
- `dropped_nonfinite_generation`: 0 rows.
- `duplicates_removed`: 0 rows (all `(start_time, publish_time)` pairs unique in clean set).
- `non_wind_rows_dropped`: 0 rows (server-side `fuelType=WIND` strictly honoured).

---

## 2. Publication Cadence and Intervals

- **Total publication events**: 512 distinct publication timestamps.
- **Publication hour distribution**:
  - Publications occur systematically at `:30` past the hour (e.g. 02:30, 04:30, 07:30, 09:30, 11:30, 15:30, 18:30, 22:30 UTC / London).
  - Distribution by hour:
    - 02:00: 64 publications
    - 04:00: 64 publications
    - 07:00: 64 publications
    - 09:00: 64 publications
    - 11:00: 63 publications
    - 12:00: 1 publication (single irregular event at 12:30)
    - 15:00: 64 publications
    - 18:00: 64 publications
    - 22:00: 64 publications
- **Interval distribution between successive publications**:
  - **Min interval**: 120.0 minutes (2.0 hours) — 191 occurrences
  - **Median interval**: 180.0 minutes (3.0 hours) — 128 occurrences
  - **Mean interval**: 179.88 minutes (~3.0 hours)
  - **90th percentile**: 240.0 minutes (4.0 hours) — 190 occurrences
  - **Max interval**: 240.0 minutes (4.0 hours)
  - Minor drift: two 175m and 185m intervals around the single 12:30 publication.

---

## 3. Cutoff Sensitivity for Day-Ahead Decision Time (January 2026)

For each January delivery day $D$ (31 days), the day-ahead decision is made on $D-1$ at cutoff time (London time). We analyzed the latest available forecast publication and its age at cutoff:

| Cutoff (London) | Latest Publication on $D-1$ | Forecast Age at Cutoff | Days with Missing Target Hours | Total Missing Target Hours |
|---|---|---|---|---|
| **08:00** | 07:30 UTC | **0.5 h** | 0 | 0 |
| **09:00** (Default) | 07:30 UTC | **1.5 h** | 0 | 0 |
| **10:00** | 09:30 UTC | **0.5 h** | 0 | 0 |
| **11:00** | 09:30 UTC | **1.5 h** | 0 | 0 |

### Key Takeaway for Day-Ahead Assumption:
- WINDFOR runs are published at `:30` past **02, 04, 07, 09, 11, 15, 18, 22 (UTC)**.
- **Any cutoff in [07:30, 09:30) selects the 07:30 run; any cutoff in [09:30, 11:30) selects the 09:30 run.**
- Therefore, A1 (09:00 London cutoff) is safe against ±1 h wobble *below 09:30* (e.g. 08:00, 08:30, 09:00 all pick the 07:30 run, with age varying from 0.5 h to 1.5 h). However, the chosen forecast changes if the real decision / gate closure is ≥ 09:30.
- Under all tested cutoff scenarios, 0 delivery days have missing target hours (all 24 hours of delivery day $D$ are fully covered in every case).

---

## 4. Forecast Horizon Distribution

Observed valid horizons ($h = \frac{start\_time - publish\_time}{1\text{ h}}$) range from **0.5 h to 66.5 h**:
- **Min horizon**: 0.5 h
- **Median horizon**: 28.6 h
- **Mean horizon**: 29.4 h
- **90th percentile**: 53.5 h
- **Max horizon**: 66.5 h

### Horizon 6-Hour Bucket Distribution
| Bucket | Row Count | Share (%) |
|---|---|---|
| 00–06 h | 2,976 | 10.35% |
| 06–12 h | 2,976 | 10.35% |
| 12–18 h | 2,976 | 10.35% |
| 18–24 h | 2,976 | 10.35% |
| 24–30 h | 2,976 | 10.35% |
| 30–36 h | 2,976 | 10.35% |
| 36–42 h | 2,976 | 10.35% |
| 42–48 h | 2,914 | 10.13% |
| 48–54 h | 2,418 | 8.41% |
| 54–60 h | 1,735 | 6.03% |
| 60–66 h | 806 | 2.80% |
| 66–72 h | 62 | 0.22% |

*Notice*: All horizons up to 42 hours have exact 100% density across publication runs, tapering off naturally past 48 hours to 66.5 hours.

---

## 5. Sanity Check (Exploratory Error Metrics on January 2026)

Evaluated against all 744 hourly January 2026 targets (`2026-01-01 00:00` to `2026-01-31 23:00`):

### Actual Wind Generation Distribution (MW)
- **Min**: 1,728.0 MW
- **Mean**: 11,581.1 MW
- **Max**: 17,805.0 MW

### Baseline Selection: Latest Forecast Available with Lead Time $\ge$ 24 Hours
- **Sample size ($n$)**: 744 matched hourly points (100% matched)
- **MAE**: **2,050.2 MW**
- **Bias ($\text{forecast} - \text{actual}$)**: **+1,854.2 MW** (systematic over-forecast tendency)
- **RMSE**: **2,518.0 MW**
- **Pearson Correlation ($r$)**: **0.9402** (strong tracking of ramp and diurnal shapes)
- **nMAE ($\frac{\text{MAE}}{\text{Mean Actual}}$)**: **17.70%**
