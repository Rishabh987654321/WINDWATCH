# PHASE 5a PROMPT — Overview + Day-ahead decision view (paste everything below into Antigravity)

---

You are the AI coder for **WindWatch**. Phases 0–4b are accepted. This phase builds the two pages that matter most for the customer pitch: **`/` Overview** and **`/day-ahead` decision view**. Re-read `AGENTS.md`, `docs/DESIGN.md` §3–§9 (pages, chart styling, a11y, copy deck), `docs/API.md`, `docs/DOMAIN.md` §4.5 and §7, `docs/TESTING.md` §3, `docs/PHASES.md` (Phase 5). Branch: `phase-5a-pages`. **Do not commit/push**; give suggested Conventional Commit messages. Windows-safe commands.

Rules for reporting (same as Phase 4b): paste raw command output for numbers; if something isn't done, say so; no invented data anywhere in the UI — every number on screen comes from the API.

## Step 0 — Small backend/doc changes first (show output)

1. **Correct the day-ahead bias everywhere.** Verified numbers for `day_ahead 09:00`, Jan 2026, n = 744: **bias +1,851.5 MW (≈ 16.0 % of mean actual 11,581 MW), MAE 2,127.5 MW**. The earlier "+1,397 MW / MAE 1,674 MW" for day-ahead was wrong. `grep` `docs/`, `README.md`, `scripts/` for `1,397`, `1397`, `1,674`, `1674`, `12.04` and fix every mis-attributed mention (the _weekly H=24 table_ legitimately contains +1,397.45 / +1,396.85 for ISO weeks 2 and 3 — leave those). Show the grep before/after.
2. **Default risk window = 28 days** (was 14). Evidence you printed: q = 0.90 realised coverage by window — 7 d: 76.75 %, 14 d: 83.60 %, 21 d: 88.31 %, **28 d: 88.58 %**. Change the default in config, `/meta.defaults`, `API.md`, `DOMAIN.md` §4.5, `.env.example`; keep the allowed range 3–45 and `min_days` = 7. Add **ADR-015**: _"Default window chosen after observing January 2026 results on a single month → in-sample choice; disclosed in Methodology and the UI; sensitivity shown."_ Regenerate golden files (`make golden`) and review the diff; re-run the whole suite.
3. Re-run calibration (January delivery days only, hourly, n = 744) for **q = 0.80 / 0.90 / 0.95 at w = 28** and print the per-day coverage list for q = 0.90, w = 28. Keep it in `docs/CALIBRATION.md` (small table) for the Methodology page later.
4. Add the dedicated test `test_by_hour_missing_hours_return_none` (fixture with no data in some local hours → those hours have `n = 0`, metrics `None`).
5. Update `scripts/contrast_check.mjs` to model the **ink-casing strategy**: series colours (green, pink, blue) are always drawn over a 1.5 px ink "casing" line (underlay) or with an ink border, so their _graphical contrast is the ink edge (17:1)_. The script must print both "raw colour vs paper" and "with ink casing" and exit non-zero only if a series is used **without** a casing declared in the chart theme. Wire it to read the casing flag from `src/charts/theme.ts` (single source of truth).

## Step 1 — Pure chart option builders (`src/charts/builders/`) with unit tests

Pure functions `(data, theme, opts) → EChartsOption`; no fetching, no React. Every coloured line series is drawn with an ink casing underlay; area bands have ink borders; use **line style/pattern in addition to hue** (DESIGN §6). Animation off for updates.

- `buildSeriesOption(points, {showActual, showForecast, showErrorBars})`: top panel actual (ink, 3 px solid) vs forecast (blue, 2.5 px solid); bottom panel (linked axis) **error bars** (`error_mw`): pink for over-forecast (> 0), green for under-forecast (< 0), ink border; `dataZoom` (inside + neo slider); `null` forecast → gap, not zero; tooltips show **London local time and UTC**, MW with thousands separators, forecast age.
- `buildDayAheadOption(periods, {revealActuals})`: x = 24 hourly targets (London local); series: **forecast** (blue solid), **expected** (`expected_wind_mw`, ink dashed), **firm wind** (green, step line), **at-risk band** between firm and `band_high_mw` (pink, hatched via `decal`, built with a transparent stacked base + band series), **actual** (ink 3 px solid + circle markers) **only when `revealActuals`**. `null` risk fields → series omitted (not zero). Direct end-labels for each series (don't rely on legend/colour alone).
- `buildCalibrationOption(days, {target, selectedDate})`: one bar per delivery day = `coverage_pct`; green ≥ target, pink < target, selected day outlined thicker; a `markLine` at the target.
  Unit tests per builder: series count/names, colours from tokens, casing present for every line series, `revealActuals=false` ⇒ no actual series, null handling, band ordering (`firm ≤ forecast`-side data preserved; band_high ≥ firm), DST-safe label count (23/24/25 periods).

## Step 2 — `/` Overview (customer pitch landing)

Per DESIGN §5, using real hooks (`useSeries`, `useSummary`, `useMeta`):

1. **Hero card** (yellow frame): tagline _"Know your wind before you buy."_, one-sentence value prop, three headline KPIs from `useSummary(day_ahead, Jan)`: **MAE**, **Bias** (label _"Over-forecast = forecast above actual"_, no causal claim), **P90 |error|**; CTA "OPEN DECISION VIEW →" to `/day-ahead`.
2. **Active-selection callout** stating in plain words what is being shown (e.g. _"Showing the forecast available at 09:00 on the day before, from the 07:30 run"_ or _"Showing the latest forecast made ≥ 6 h before each hour"_), generated from state + `/meta`.
3. **Actual vs Forecast chart** (`buildSeriesOption`) driven by the filter bar (range, policy, horizon/cutoff). Loading skeleton, error Callout with RETRY + request id, empty state. **Brush a span → KPI strip updates** by calling `/metrics/summary` with the brushed `from`/`to` (debounced 250 ms) — **do not recompute metrics in the browser** (single source of truth).
4. **KPI strip**: MAE · RMSE · Bias · nMAE · P90 |error| · Over-forecast rate, each with a "?" Popover giving the one-line definition (from DOMAIN §4.4) and a link to `/methodology#<metric>`; show `n` and a coverage badge when `n_matched < n_expected`.
5. When `lead_time` is selected and `h > reliable_horizon_hours`, show the **THIN DATA** sticker with the explanation from DOMAIN §4.6 (non-random subset of hours of day).

## Step 3 — `/day-ahead` decision view (the headline feature)

Per DESIGN §5 and DOMAIN §4.5:

- **Delivery-day picker**: date input clamped to the evaluation window, prev/next buttons, **←/→ keyboard shortcuts** (when focus is not in an input), and two quick-pick chips computed from `/metrics/heatmap` (per-day mean MAE, client-side mean of the returned cells only): **"BIGGEST MISS · {date}"** and **"CLOSE CALL · {date}"**. `d` in the URL; default `2026-01-15` if absent.
- **Header strip** (from `useDayAhead`): _"Forecast as of {cutoff_local} {D−1 date} · latest run published {time} · age {h} h"_ + ASSUMPTION sticker linking to the cutoff note (DOMAIN §7 A1: runs at :30; any cutoff in [07:30, 09:30) uses the 07:30 run).
- **Main chart** (`buildDayAheadOption`) + **REVEAL ACTUALS** `Switch` (state in store/URL `reveal`). Off ⇒ actuals and day-accuracy are hidden (card shows a locked placeholder: _"Hidden — you didn't know this at the cutoff."_). On ⇒ actual series, `day_accuracy` card, and a computed outcome sticker, e.g. _"Actual wind stayed above firm wind in 24/24 hours"_ (count computed from the returned periods).
- **Side cards** (MWh = MW × 1 h): _Total forecast_, _Expected (bias-adjusted)_, _Firm wind (90% target)_, _Wind at risk_ (= forecast − firm). Quantile label follows the selected `q` (e.g. "80% target"). **Never write "confidence".**
- **Plain-English summary** line from data: _"On the 09:00 forecast, plan for at least {mean_firm} MW of average wind (90% target); {mean_forecast − mean_firm} MW of forecast wind is at risk."_
- **Risk controls**: quantile `Segmented` (80/90/95/99) and **window `Segmented` 7/14/21/28** (default 28) — both URL-synced (`q`, `w`).
- **Calibration card** (`useCalibration`, same q/w/cutoff, Jan): headline **"Target {q}% · Realised {x}%"** (honest; pink if below target by > 5 pts), the `buildCalibrationOption` bars (click a bar → select that delivery day), and a caption listing days where coverage was 0 % ("firm wind failed all day on …"). Add a small sensitivity note: _"Window length was chosen after seeing January 2026 results on one month of data."_
- **States**: `risk == null` ⇒ forecast still plotted, Callout explaining the sample was too short; null periods ⇒ gaps + Callout with the count; 404/422 ⇒ pink Callout with RETRY/request id.
- Copy: use DESIGN §9 (with the corrected "90% target" wording) — update that section of `docs/DESIGN.md` too.

## Step 4 — Interaction & performance requirements

- Filter changes use `keepPreviousData`; slider drags use a **150 ms debounce + `useDeferredValue`**; chart option objects memoised on data identity. Prove with a test: simulate a 20-step drag → **≤ 3 network calls**.
- ECharts stays in the lazy chunk; initial JS gz must stay < 350 KB (`npm run check:bundle`).
- `echarts.connect` links the two Overview panels' zoom.
- Every chart has `ariaLabel` and a working **VIEW AS TABLE** toggle with the underlying numbers.

## Step 5 — Tests

- Vitest + RTL + MSW (handlers typed from `schema.d.ts`): Overview loads KPIs; brush triggers one debounced summary call with the brushed range; policy switch shows/hides slider vs cutoff; THIN DATA sticker above `reliable_horizon_hours`; error → RETRY works.
- Day-ahead: `/day-ahead?d=2026-01-15` loads that date; ←/→ changes `d`; **REVEAL toggle adds/removes the actual series** (capture `option` passed to the mocked `<Chart>`); changing `q` issues a new request and totals update; `risk: null` state; calibration bar click changes `d`; "BIGGEST MISS" chip picks the day with the largest mean MAE from mocked heatmap data.
- Copy test: the page never renders the word "confidence" (guards the calibration honesty rule).
- **Playwright** (`npx playwright install chromium` first; run against `make dev` or the docker stack): journey 1 — Overview → drag horizon slider (policy lead_time) → KPI MAE text changes; journey 2 — `/day-ahead?d=2026-01-15` → "Forecast as of" visible → toggle REVEAL → actual series visible → switch q to 80 → "Firm wind (80% target)" label appears. Save desktop 1280 and mobile 390 screenshots of both pages to `docs/screens/phase5a/`.
- Re-run `scripts/contrast_check.mjs`, Lighthouse a11y on `/` and `/day-ahead` (report scores, or say not run), and axe tests for both pages.

## Definition of Done (show evidence)

- [ ] Step 0 items 1–5 with raw output (grep before/after, golden diff summary, calibration table at w = 28, new test name, contrast table with casing)
- [ ] `make lint` + `make test` green (backend + frontend); coverage numbers for `src/charts/builders`, pages, `api/hooks.ts`
- [ ] Overview and Day-ahead fully driven by the API (grep shows no hard-coded MW/MWh/percent figures in components)
- [ ] Playwright journeys pass; screenshots saved; axe + Lighthouse (or "not run") reported
- [ ] Bundle report (initial gz + ECharts chunk)
- [ ] 20-step slider-drag request-count test passes
- [ ] Suggested commit messages (not committed)

## Rules

Single source of truth for all numbers = the API. No new dependencies without justification. No gradients/blur. Don't build Accuracy Lab, Vintages or Methodology (Phase 5b). Neutral language about bias — report it, don't explain it.

## When done

Reply with a checklist (DONE / PARTIAL / NOT DONE) for Step 0–5 with raw outputs underneath, plus a short honest list of visual problems you can see in the screenshots. **Then stop and wait — do not start Phase 5b.**
