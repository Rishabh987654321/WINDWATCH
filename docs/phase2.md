# PHASE 2 PROMPT — paste everything below into Antigravity

---

You are the AI coder for **WindWatch**. Phases 0–1 are done and reviewed. This is the **most important phase**: the pure analytics engine. Re-read `AGENTS.md`, `docs/DOMAIN.md` (all), `docs/SYSTEM_DESIGN.md` §4–5, `docs/TESTING.md` §2, `docs/DECISIONS.md` (ADR-011, ADR-012), `docs/SNAPSHOT_PROFILE.md`, `docs/PHASES.md` (Phase 2). Branch: `phase-2-domain`. **Do not commit or push**; give me suggested Conventional Commit messages at the end. Commands must work on Windows.

Scope: `backend/app/domain/` + tests + one benchmark script. **No API endpoints, no DataStore, no UI.**

## Step 0 — Small doc corrections (list the files you touched)

1. `docs/SNAPSHOT_PROFILE.md` and `docs/DOMAIN.md` §7: remove the label "11:00 (EPEX DA)" — we have **not verified** any GB day-ahead gate-closure time. State only what the data shows: WINDFOR runs are published at **:30 past 02,04,07,09,11,15,18,22 (UTC)**. Replace the "100 % stable" conclusion with the precise finding: **any cutoff in [07:30, 09:30) selects the 07:30 run; any cutoff in [09:30, 11:30) selects the 09:30 run**, so A1 (09:00) is safe against ±1 h wobble _below 09:30_ but the forecast changes if the real gate closure is ≥ 09:30. Add this to the assumptions log (A1) and as a note for the UI (a cutoff control should make this visible).
2. `docs/DOMAIN.md` §4.6 / `docs/API.md` `/metrics/by-horizon`: horizons observed are of the form _x.5 h_ (publish at :30, targets at :00), range 0.5–66.5 h. Evaluate integer H using "forecast made ≥ H hours ahead". **Fewer targets have a forecast that far ahead for large H** (6-h bucket counts fall after 42 h), so each by-horizon point must carry `n`, `n_expected` and `coverage_pct`, and `/meta` will expose `max_horizon_hours` (= floor of max, 66) and `reliable_horizon_hours` (= the largest H whose coverage ≥ 95 %). Add these fields to `API.md` (additive).

## Step 1 — Diagnostic: is the +1.85 GW bias real, or an artifact? (exploratory; extend `app/ingest/profile.py` or add `scripts/bias_diagnostic.py`; **no logic in `app/domain` yet**)

The Phase 1 sanity check found MAE 2,050 MW with bias +1,854 MW (≈ 16 % of mean actual) at "forecast made ≥ 24 h ahead". Before building on it, report:

1. **Alignment/lag test**: for that same selection, MAE / bias / correlation of forecast vs actual when the actual used is the value at `:00` (current default), at `:30` of the same hour, at `:30` of the previous hour, and the **hour-average of (:00, :30)** and of (**previous :30, :00**). Which variant minimises MAE? How much does it change bias?
2. **Bias decomposition**: share of the 31 days with positive mean error; bias by hour of day (London); bias by forecast-level tercile; bias by horizon bucket (0–12, 12–24, 24–36, 36–48, 48+ h); weekly bias.
3. **Does the bias vanish if we normalise scope?** (We can't add data, but note whether bias scales with generation level — e.g. ratio actual/forecast by tercile — which would hint at curtailment/scope rather than random error.)
4. A 5-line plain-English conclusion: _systematic forecast bias_, _alignment artifact_, or _inconclusive_ — with numbers. Do not speculate beyond the data.

**Decision rule:** if any alternative actual-alignment variant reduces MAE by **> 10 %** versus the `:00` default, **STOP after this step and ask me** (it would change ADR-011). Otherwise record the result as **ADR-013** and continue.

## Step 2 — Implement `backend/app/domain/` (TEST-FIRST)

Write each test file first, show me it fails, then implement. Pure functions only: no I/O, no FastAPI, no settings, no store imports. Frozen dataclasses for results; metrics that are undefined return `None` (never `NaN`). Type everything; `mypy` strict on this package; docstrings state the rule and cite the DOMAIN.md section.

**`timeutil.py`** — tz-aware UTC internally; `london_date(ts)`; `delivery_day_bounds(date)` (UTC start/end of the London day); `cutoff_utc(delivery_date, cutoff_local: time)` = (D−1 at cutoff, Europe/London) → UTC via `zoneinfo`; `expected_hourly_targets(start, end)` (23/24/25 periods on DST days).

**`selection.py`** — input frame columns: `start_time`, `publish_time`, `forecast_mw`, `horizon_h` (already sorted by `start_time`, `horizon_h` asc, retrocasts already removed).

- `select_lead_time(fc, H)`: latest `publish_time` with `horizon_h ≥ H`, one row per target.
- `select_day_ahead(fc, cutoff_local)`: latest `publish_time ≤ cutoff_utc(D)` per target; **no backfill** from later forecasts; targets without one are absent.
- Return also the chosen `publish_time` and `horizon_h` per target.

**`align.py`** — `align(selected, actuals, start, end)` → matched frame (`start_time`, `forecast_mw`, `actual_mw`, `error_mw = forecast − actual`, `publish_time`, `horizon_h`) via inner join on `start_time` (hourly :00 timestamps only, per ADR-011) + a `Coverage` dataclass (`n_expected`, `n_matched`, `n_missing_actual`, `n_missing_forecast`) where `n_expected` comes from `expected_hourly_targets`.

**`metrics.py`** (definitions in DOMAIN §4.4, §4.6) — `summary()` (n, bias, MAE, RMSE, median |e|, P90/P95 |e|, nMAE % of mean actual, over_forecast_rate, max over/under with timestamps, correlation), `by_hour()` (London hour), `by_level(bins)` (equal-count bins on **forecast**; handle ties and fewer unique values than bins), `distribution(bin_width)`, `heatmap()` (day × London hour MAE, `None` for missing), and **`by_horizon(fc, actuals, start, end, max_h, step)`** returning per-H `n`, `n_expected`, `coverage_pct`, MAE, RMSE, bias, P90 — vectorised (one pass per H on a pre-sorted frame; no per-row Python loops; target < 400 ms warm for H = 0…66 on the real snapshot).

**`risk.py`** (DOMAIN §4.5) — `errors_by_day(matched)`; `error_sample(errors_by_day, D, window_days, min_days)` using delivery days **≤ D−2 only** (D−1 excluded), truncated at data start, returns `None` if fewer than `min_days` full days; `band(forecast, sample, q)` → `firm_wind_mw = max(0, f − Q_q(e))`, `band_high_mw = max(0, f − Q_{1−q}(e))`; `calibration(...)` backtest → per-day and overall share of periods with `actual ≥ firm_wind_mw`.

## Step 3 — Required tests (name each after the rule it proves; hand-computed fixtures with the arithmetic in comments; hourly grid)

- Selection: `test_lead_time_picks_latest_publish_at_least_H_hours_before`, `test_lead_time_one_row_per_target`, `test_lead_time_never_returns_horizon_below_H` (hypothesis), `test_day_ahead_never_uses_publish_after_cutoff` (hypothesis — the leakage test), `test_day_ahead_missing_when_no_forecast_before_cutoff_no_backfill`, `test_day_ahead_cutoff_between_0730_and_0930_selects_0730_run` (fixture mirroring the real :30 cadence), `test_day_ahead_cutoff_0930_selects_0930_run`.
- Time: `test_cutoff_uses_london_time_on_dst_days` (2026-03-29: 23 hourly targets; 2026-10-25: 25), `test_delivery_day_bounds_utc_in_january_equal_london`.
- Align: `test_align_inner_join_ignores_half_hour_actuals`, `test_coverage_counts_missing_actual_and_forecast`.
- Metrics: sign convention (`forecast − actual`); MAE/RMSE/bias on a 4-point hand example; P90 on a known array; `test_empty_input_returns_n0_and_none_metrics`; `test_zero_mean_actual_gives_none_nmae`; non-finite excluded and counted; `by_level` ties/too-few-unique; `by_horizon` coverage_pct falls when targets lack long-lead forecasts (fixture).
- Risk: `test_error_sample_excludes_D_minus_1_and_later` (including a fixture where D−1 contains a huge outlier that must not affect the band), `test_error_sample_truncates_at_data_start_and_requires_min_days`, `test_firm_wind_clipped_at_zero`, `test_band_ordering_low_le_forecast_le_high` (hypothesis, q > 0.5), `test_calibration_on_synthetic_normal_errors_is_close_to_q` (seeded; tolerance stated).
- **Cross-validation on the real snapshot** (mark `@pytest.mark.snapshot`; skip if snapshot missing): `test_domain_reproduces_profile_sanity_numbers` — `select_lead_time(H=24)` + `align` + `summary` over Jan 2026 must give **n = 744, MAE ≈ 2050.2, bias ≈ +1854.2, RMSE ≈ 2518.0, corr ≈ 0.9402, nMAE ≈ 17.70 %** (tolerance 0.1 MW / 0.0005). If this does not match, **find out which implementation is wrong and tell me** — don't tweak tolerances.
- Real-data smoke: day-ahead at 09:00 for every January day returns 24 targets, all with `publish_time` = 07:30 UTC of D−1 and 1.5 h age.

## Step 4 — Benchmark script

`scripts/bench_domain.py` (works on Windows): times warm `select_lead_time`, `by_horizon(0..66)`, day-ahead + risk band + calibration for all 31 days on the real snapshot (median of 20 runs). Compare to budgets in `SYSTEM_DESIGN.md` §5 and print PASS/FAIL per budget.

## Definition of Done (show evidence for each)

- [ ] Step 0 doc edits listed
- [ ] Bias diagnostic report pasted (all 4 parts) + ADR-013 added (or you stopped and asked per the decision rule)
- [ ] `make lint` and `make test` green; coverage for `app/domain` **≥ 95 %**; `mypy` strict clean on `app/domain`
- [ ] You showed at least the leakage tests **failing before** the implementation existed
- [ ] Cross-validation test passes against the profile numbers
- [ ] Benchmark output pasted; all budgets pass (or explain)
- [ ] Suggested commit messages provided (not committed)

## Rules

No pandas in anything outside `domain/`, `data/`, `ingest/`. No hidden global state/caches in `domain/` (caching comes later in the service layer). Don't touch ingestion output files. No new dependencies without saying why.

## When done

Reply with: (1) diagnostic findings and ADR-013 summary, (2) test summary incl. coverage and the failing-first evidence, (3) cross-validation result, (4) benchmark table, (5) anything surprising, (6) suggested commits. **Then stop and wait — do not start Phase 3.**
