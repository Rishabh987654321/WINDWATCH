# Calibration Analysis (January 2026 Delivery Days)

This document records the empirical backtested calibration of the risk-adjusted firm wind quantile models over all January 2026 delivery days ($n = 744$ hourly periods, 2026-01-01 00:00 UTC to 2026-02-01 00:00 UTC) using the day-ahead 09:00 London gate-closure cutoff.

## Summary Table ($w = 28$ days default window)

Trailing historical window $w = 28$ days (with minimum sample requirement `min_days = 7`, trailing sample strictly ending on $D-2$ to avoid data leakage):

| Nominal Target Quantile ($q$) | Total Hourly Periods ($n$) | Covered Periods (`actual ≥ firm`) | Realised Coverage | Realised vs Target |
|---|---|---|---|---|
| **80%** ($q = 0.80$) | 744 | 559 | **75.13%** | −4.87 pts |
| **90%** ($q = 0.90$) | 744 | 659 | **88.58%** | −1.42 pts |
| **95%** ($q = 0.95$) | 744 | 693 | **93.15%** | −1.85 pts |

### Comparison Across Window Sizes ($q = 0.90$)

| Trailing Window ($w$) | Realised Coverage ($n=744$) | Gap vs 90% Target |
|---|---|---|
| **7 days** | 76.75% | -13.25% |
| **14 days** | 83.60% | -6.40% |
| **21 days** | 88.31% | -1.69% |
| **28 days (default)** | **88.58%** | **-1.42%** |

*Methodological Note (ADR-015):* The default window of 28 days was selected based on observed performance over January 2026. This represents an in-sample selection and is transparently disclosed in Methodology and UI sensitivity controls.

## Per-Day Coverage Breakdown ($q = 0.90, w = 28$ days)

Evaluated per delivery day (24 hourly periods each):

| Delivery Day | Covered Hours | Total Hours | Daily Coverage | Notes |
|---|---|---|---|---|
| 2026-01-01 | 15 | 24 | 62.50% | New Year storm regime transition |
| 2026-01-02 | 23 | 24 | 95.83% | |
| 2026-01-03 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-04 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-05 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-06 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-07 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-08 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-09 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-10 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-11 | 6 | 24 | 25.00% | Sudden calm regime shift |
| 2026-01-12 | 7 | 24 | 29.17% | Calms persisting |
| 2026-01-13 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-14 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-15 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-16 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-17 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-18 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-19 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-20 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-21 | 11 | 24 | 45.83% | Significant over-forecast event |
| 2026-01-22 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-23 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-24 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-25 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-26 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-27 | 21 | 24 | 87.50% | Near target |
| 2026-01-28 | 0 | 24 | 0.00% | Severe forecast drop: firm wind failed all day |
| 2026-01-29 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-30 | 24 | 24 | 100.00% | Full coverage |
| 2026-01-31 | 24 | 24 | 100.00% | Full coverage |

Across 31 days:
- 24 days achieved 100% coverage (24/24 hours).
- 2 days achieved 87.5% – 95.8% coverage (2026-01-02: 23/24; 2026-01-27: 21/24).
- 4 days experienced partial coverage between 25.0% and 62.5% (2026-01-01: 15/24; 2026-01-11: 6/24; 2026-01-12: 7/24; 2026-01-21: 11/24).
- 1 day recorded 0% coverage (2026-01-28: 0/24 hours covered).
Total: 24×24 + 23 + 21 + 15 + 6 + 7 + 11 + 0 = 659 / 744 hours covered (88.58%).
