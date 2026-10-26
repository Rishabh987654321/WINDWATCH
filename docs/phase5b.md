# PHASE 5b PROMPT — fixes + Accuracy Lab + Forecast evolution + Methodology (paste everything below into Antigravity)

---

You are the AI coder for **WindWatch**. Phase 5a is accepted with the fixes in Step 0. Re-read `AGENTS.md`, `docs/DESIGN.md` §5 (Accuracy Lab, Methodology), §6, §8, `docs/DOMAIN.md` §4.4–4.6, §6–7, `docs/API.md` (`/metrics/*`, `/vintages`), `docs/CALIBRATION.md`, `docs/TESTING.md` §3. Branch: `phase-5b-lab`. **Do not commit/push**; give suggested Conventional Commit messages. Windows-safe commands. Same reporting rules as before: raw output for numbers, honest DONE/PARTIAL/NOT DONE, no invented data — every number on screen comes from the API.

## Step 0 — Fix what the 5a review found (show raw output)

1. **Contrast script is wrong — fix it.** Your last output gave ink-on-white 17.77:1 and ink-on-yellow 14.61:1; the correct WCAG values are **18.88:1** (`#111111` on `#FFFFFF`), **17.77:1** (on paper `#FFF8E1`), **15.30:1** (on `#FFE94A`), **7.06:1** (on `#FF6B9E`), **8.34:1** (on `#00C48C`); raw series on white: blue `#4D7CFE` **3.73**, green **2.26**, pink **2.68**. The "ink-cased edge ratio" column was a constant — compute it properly (ratio between the casing colour and the _actual_ canvas background, `#FFF8E1`), and read the casing colour and width from `src/charts/theme.ts`. Use the standard WCAG relative-luminance formula. **Add unit tests for the script** (`#000/#FFF = 21:1`, `#111111/#FFFFFF = 18.88:1`, `#777777/#FFFFFF ≈ 4.48:1`). Paste the new table. Note: the canvas is paper `#FFF8E1`, not white — evaluate on paper too.
2. **Horizon slider mismatch.** In your Journey 1 you advanced the slider to **H = 24** but the page said _"made ≥ 12 h before each target hour"_. Find out which is wrong: print the slider's `aria-valuenow`, the URL `h` param, the `horizon_hours` query param of the actual request to `/series` / `/metrics/summary`, and the callout text — all four must agree. Fix the bug, and **strengthen the test**: it must assert the request URL carries the same `horizon_hours` as the slider, and that the MAE text **numerically differs** between two horizons (print both values).
3. **Missing from your 5a report — provide now:** (a) frontend coverage table for `src/charts/builders`, pages, `src/api/hooks.ts`, `src/components/ui`; (b) **axe tests** for `/` and `/day-ahead` (add if absent); (c) **Lighthouse accessibility** scores for `/` and `/day-ahead` (or "not run" + why); (d) the list of days with **0 % coverage** at q = 0.90, w = 28 straight from `docs/CALIBRATION.md` (so we know whether only 28 Jan failed).
4. **Neutral wording & polish.** The calibration banner must state facts only — replace _"wind ramped down unexpectedly fast, outstripping the trailing 28-day error floor"_ with e.g. _"On 2026-01-28 the forecast exceeded actual wind by {x} MW on average — above the 90th percentile of the trailing errors; firm wind was above actual in 24/24 hours."_ (numbers from the API). Don't use a colour outside the palette ("red" → ink text on a pink block). Header age: when min = max show **"age 1.5 h"** (not "1.5–1.5 h"). Test it.
5. **Bundle audit script**: it labelled the 3.86 KB `UiKitPage` chunk "ECharts" while the ECharts code is in `Chart-*.js` (198 KB gz). Fix the label logic, and make the script **fail if `echarts` appears in the entry chunk** and if entry > 350 KB gz.
6. **Real Playwright tests.** Convert `scripts/e2e_phase5a.mjs` into `@playwright/test` specs under `frontend/e2e/` (`overview.spec.ts`, `day-ahead.spec.ts`) with proper assertions, `playwright.config.ts` (webServer = `npm run dev` + backend on 8000, chromium with msedge fallback on Windows), and `npm run e2e`. Journey 1 must assert **MAE text changes numerically** when horizon changes (see item 2). Add a CI job (allowed to be `continue-on-error: true` for now; Phase 6 will harden it).

## Step 1 — Caption & builder foundations (pure, unit-tested)

- `src/lib/captions.ts`: pure functions that turn API data into **one-line insight captions** (template strings, no LLM, no hard-coded numbers). Wording rules, enforced by a test: **no causal language** — captions must not contain "because", "due to", "caused", "reason", "confidence"; describe what the numbers show, nothing else. Each caption is conditional on the data (e.g. say "rises" only if the series actually rises).
- New builders in `src/charts/builders/` (same rules as 5a: ink casing on every coloured line, hatch/pattern in addition to colour, `animation: false` on updates, `ariaLabel`, table data):
  - `buildByHorizonOption(points, {reliableH, selectedH})`: lines for **MAE** (ink) and **RMSE** (blue), P90 as a lighter band; secondary thin bar strip for `coverage_pct`; region beyond `reliable_horizon_hours` **hatched** with a "THIN DATA" label; marker at the currently selected horizon. Tooltip shows `n` and coverage.
  - `buildDistributionOption(bins, quantiles)`: histogram; bins with `from_mw ≥ 0` pink (over-forecast), `< 0` green (under-forecast) with ink borders; `markLine` at P5/P50/P95; x-axis labelled "Error = forecast − actual (MW)".
  - `buildByHourOption(points)`: bars = MAE, line = bias, London hour 0–23; `null` hours → gap.
  - `buildByLevelOption(points)`: bars per forecast-level bin with the bin's MW range as the label.
  - `buildHeatmapOption(days, hours, values)`: day × hour MAE, **piecewise 5-step** scale ordered by luminance (paper `#FFF8E1` → yellow → pink → blue → ink) with a labelled MW legend; `null` cells hatched; click → event payload `{date}`.
  - `buildVintagesOption(vintages, actual, selectedPublishedAt, cutoffUtc?)`: x = publish time, y = forecast MW; ink-cased blue line + markers; horizontal ink line at the actual; the vintage chosen by the active policy highlighted with a yellow marker + label.

## Step 2 — `/accuracy` Accuracy Lab (lazy route; grid of cards, one chart + one caption each)

All cards honour the global filters (range, policy, h/cutoff) **except** by-horizon, which is inherently `lead_time`. Show the same active-selection callout as Overview. Each card: skeleton → chart; error Callout with RETRY + request id; empty state; VIEW AS TABLE.

1. **Error vs horizon** (`useByHorizon`): click a point → sets `policy=lead_time` and `h` in the store/URL (and the point is marked). Beyond `reliable_horizon_hours` show the THIN DATA explanation (non-random subset of hours of day, DOMAIN §4.6).
2. **Error distribution** (`useDistribution`, default bin 250 MW).
3. **By hour of day** (`useByHour`).
4. **By generation level** (`useByLevel`, 5 bins, basis = forecast — say so in the card).
5. **Day × hour heatmap** (`useHeatmap`): click a cell → navigate to `/day-ahead?d={date}`.
6. **Forecast evolution** (`useVintages`): target-hour picker (datetime-local clamped to evaluation window; URL param **`t`**, add to `url-state.ts` + `API.md`/`DESIGN.md` URL list) with quick-pick chips **"BIGGEST OVER-FORECAST · {ts}"** and **"BIGGEST UNDER-FORECAST · {ts}"** taken from `/metrics/summary` (`max_over_forecast.ts`, `max_under_forecast.ts`) for the current selection. To mark the vintage that the active policy would have used, **call `/series` for that single hour** (`from = t`, `to = t + 1 h`, current policy params) and use its `forecast_published_at` — do **not** re-implement selection in the browser. Caption example (data-driven): _"Forecast made {h1} h ahead said {x} MW; the run used by the active policy said {y} MW; actual was {z} MW."_

## Step 3 — `/methodology`

Anchored sections (`#mae`, `#rmse`, `#bias`, `#nmae`, `#p90`, `#over-forecast-rate`, `#policies`, `#risk`, `#calibration`, `#assumptions`, `#caveats`, `#lineage`, `#ai`); the "?" popovers from the Overview link here.

- **Definitions** per DOMAIN §4.4 (sign convention in plain words: _"Over-forecast = forecast above actual."_), and **why not MAPE**.
- **Selection policies** explained with an inline **SVG timeline diagram** in neo style (D−1 07:30 / 09:30 runs, the 09:00 cutoff, delivery day D hours, "latest run before cutoff" arrow). Static, token-coloured, with `<title>/<desc>` for a11y.
- **Risk method** (firm wind / expected / at-risk, D−2 rule, window length) and **Calibration**: _live_ tables from `useCalibration` — q ∈ {0.80, 0.90, 0.95} at the default window, and q = 0.90 for w ∈ {7, 14, 21, 28} (lazy-load when the section scrolls into view). State plainly: _"Default window (28 d) was chosen after seeing January 2026 results on one month of data."_ (ADR-015).
- **Assumptions** A1–A5 (+ ADR-011 hourly grid, ADR-012 publication cadence) and **Caveats** (one month of data, national aggregate, scope of FUELHH vs WINDFOR not verified, bias reported not explained) — render from a single typed content module `src/content/methodology.ts` so wording lives in one place.
- **Data lineage** from `/meta` (snapshot id, ingest time, sources, row counts, quality counters with retrocast rows marked informational) and links to the Elexon dataset pages.
- **AI-use disclosure** (same text as README) and a repo link placeholder.
  Numbers on this page come from the API; static text must contain **no hard-coded figures** other than definitions.

## Step 4 — Tests

- Builders: by-horizon marks THIN region + selected marker; distribution colours by sign; heatmap has exactly 5 pieces and hatches nulls; vintages includes actual line + highlighted vintage; **every line series has the ink casing**; null handling everywhere.
- Captions: conditional wording (rise vs fall vs flat), **forbidden-words test** over all caption outputs for a grid of synthetic inputs.
- Pages (RTL + MSW): Accuracy renders six cards from mocked responses; by-horizon click sets `h` and `policy=lead_time` in URL; heatmap cell click navigates to `/day-ahead?d=…`; chips set `t`; vintages highlight uses the mocked `/series` response; error/empty/RETRY states; Methodology anchors exist, calibration tables render from mocked data, no hard-coded MW figures in static content (grep test over `src/content`).
- axe on `/accuracy` and `/methodology`; Lighthouse accessibility on both (report scores or "not run").
- **Playwright specs**: `accuracy.spec.ts` (open `/accuracy` → by-horizon visible → click a point → URL has `policy=lead_time&h=…`; heatmap click → lands on `/day-ahead?d=…`; BIGGEST OVER-FORECAST chip sets `t` and the vintages chart renders), `methodology.spec.ts` (anchor links scroll; calibration table has 3 + 4 rows).
- Screenshots (desktop 1280 / mobile 390) of `/accuracy` and `/methodology` → `docs/screens/phase5b/`.
- `npm run check:bundle` (entry < 350 KB gz; ECharts not in entry), `make lint`, `make test`, coverage tables.

## Definition of Done (show evidence)

- [ ] Step 0 items 1–6 with raw output (new contrast table + tests; slider evidence of four matching values + strengthened test output; coverage/axe/Lighthouse; zero-coverage days; banner wording; bundle audit; Playwright specs run output)
- [ ] `/accuracy` with all 6 cards, `/methodology` complete; every number from the API; grep shows no hard-coded figures in components or `src/content`
- [ ] Captions have no causal language (test output)
- [ ] All tests green (backend 132+ and frontend), lint/types clean, bundle budget OK
- [ ] Screenshots saved; list remaining visual problems **honestly**
- [ ] Suggested commit messages (not committed)

## Rules

No new dependencies without justification. Neutral language: report numbers; don't explain causes the data can't support. No selection/metric logic in the browser. Don't start Docker/CI/deploy work (Phase 6) beyond the Playwright CI job in Step 0.6.

## When done

Reply with a DONE / PARTIAL / NOT DONE checklist for Steps 0–4 with raw outputs underneath. **Then stop and wait — do not start Phase 6.**
