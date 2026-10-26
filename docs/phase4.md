# PHASE 4 PROMPT — paste everything below into Antigravity

---

You are the AI coder for **WindWatch**. Phases 0–3 are done. Re-read `AGENTS.md`, `docs/DESIGN.md` (**in full — it is the spec for this phase**), `docs/ARCHITECTURE.md` §3, §4, §6, `docs/API.md`, `docs/TESTING.md` §3–4, `docs/PHASES.md` (Phase 4). Branch: `phase-4-frontend-foundation`. **Do not commit or push**; give me suggested Conventional Commit messages at the end. Commands must work on Windows.

Scope: design system + app shell + typed API layer + chart foundation. **Do not build the feature pages** (Overview, Day-ahead, Accuracy Lab, Methodology) — only routed placeholders.

## Step 0 — Close out Phase 3 leftovers (backend; keep it tight, show real output)

1. **Weekly-bias recheck (you answered a different question last time).** Using the _same selection as the Phase 2 diagnostic_ (`lead_time`, H = 24), print for each calendar week: date range, `n`, and the **unrounded** mean error. Phase 2 reported Week 2 = Week 3 = +1,397 MW; note that +1,397 is also the _day-ahead_ full-month bias (+1,396.85). State clearly whether the Phase 2 weekly table was mislabeled/buggy or genuinely identical, fix `scripts/bias_diagnostic.py` if buggy, and correct any doc that quotes the wrong weekly numbers.
2. **ADR-013 must label the selection policy for every number.** Two figures exist and both are valid: `lead_time H=24` → bias **+1,854 MW**, MAE 2,050 MW; `day_ahead 09:00` → bias **+1,397 MW** (≈ 12 % of mean actual). Rewrite so each figure names its policy. Keep wording neutral: report the bias, don't explain its cause (hypotheses only: scope difference, curtailment, genuine bias). Bias magnitude being larger when forecast generation is high is supported by the tercile data — you may state that.
3. **Two mutation checks you skipped**, with **real pytest output pasted** (before/after): (a) flip the error sign to `actual − forecast`; (b) change `>= H` to `> H` in `select_lead_time`. Add a killer test if either survives. (Also paste the failing output for one of the earlier four so I can see real evidence.)
4. **Required-test mapping, only for the gaps:** print a table mapping each of these to `file::test_name` (or add them): DST 23-hour (2026-03-29) and 25-hour (2026-10-25) day; cutoff in [07:30, 09:30) → 07:30 run; cutoff 09:30 → 09:30 run; real-data day-ahead smoke (24 targets, `publish_time` 07:30Z on D−1, age 1.5 h); `heatmap` edge case (all-missing day → `None` cells); `by_hour` with missing hours.
5. **Reconcile `reliable_horizon_hours`**: `/meta` says **44**, Phase 2 said **42**, and Phase 3's smoke test was specified as 42. Show the by-horizon `coverage_pct` around H = 40…48 and the exact window/threshold used; decide which definition is right (≥ 95 % coverage over the evaluation window), make code, test, docs consistent, and tell me the final value.
6. **Report the calibration result** I never saw: `/day-ahead/calibration` for Jan 2026 at defaults (q = 0.9, window 14, cutoff 09:00) → overall realised coverage and the per-day list; also overall realised coverage for q = 0.8 and 0.95. Honest numbers, no tuning. If realised coverage is far from target (|Δ| > 10 pts), tell me and show why (e.g. days where the trailing sample misses a regime change).
7. **Cache `/metrics/heatmap`** at the service layer (warm p95 was 95 ms vs a 100 ms budget); re-run `scripts/bench_api.py`.

## Step 1 — Dependencies (justify any beyond this list in your reply and `DECISIONS.md`)

`react-router-dom`, `@fontsource/archivo-black`, `@fontsource/space-grotesk`, `@fontsource/space-mono`, `openapi-typescript` (dev), `openapi-fetch` (tiny typed client that pairs with it), `echarts` (modular imports only), `zustand`, `@tanstack/react-query`, `msw` (dev), `@testing-library/user-event` (dev), `vitest-axe` or `jest-axe` (dev) for a11y assertions. Tailwind v4 is already in. **No MUI, no other UI kits, no CSS-in-JS.**

## Step 2 — Typed API layer (`src/api/`)

- `npm run gen:api` → generates `src/api/schema.d.ts` from `src/api/openapi.json`. Commit the generated file; add a **CI drift step** (regenerate + `git diff --exit-code`).
- `client.ts`: `openapi-fetch` client with base URL `import.meta.env.VITE_API_BASE_URL ?? "/api"` (so paths are `/v1/...`); a response helper that parses **problem+json** into an `ApiError { status, title, detail, requestId }`.
- `hooks.ts`: one TanStack Query hook per endpoint (`useMeta`, `useSeries`, `useDayAhead`, `useCalibration`, `useSummary`, `useByHorizon`, `useByHour`, `useByLevel`, `useDistribution`, `useHeatmap`, `useVintages`), query keys derived from the typed params object, `placeholderData: keepPreviousData`, `staleTime` 5 min (data is a frozen snapshot), **no retry on 4xx**, 1 retry on 5xx/network.
- `types.ts` re-exports convenient aliases from `schema.d.ts`. **Never hand-write response types.**

## Step 3 — Filter store with URL sync (`src/store/`, `src/lib/url-state.ts`)

Zustand store `useFilters` holding: `from`, `to`, `policy` (`day_ahead`|`lead_time`), `horizonHours`, `cutoff`, `riskQuantile`, `windowDays`, `deliveryDate`, `revealActuals`.

- URL params: `from, to, policy, h, cutoff, q, w, d, reveal`. Store ⇄ URL round-trip (use `history.replaceState` for slider drags, `pushState` for discrete changes).
- Defaults come from `/meta.defaults` + `/meta.data.evaluation_window`. Out-of-range or malformed params → **fall back to defaults**; clamp dates to coverage and `horizonHours` to `[0, max_horizon_hours]`.
- App bootstraps by loading `/meta` first (skeleton shell while loading; pink error Callout with RETRY if it fails). Store is initialised from URL + meta.
- Pure functions in `url-state.ts` (parse, serialise, clamp) with unit tests.

## Step 4 — Design system (`src/styles/`, `src/components/ui/`) — exactly per `docs/DESIGN.md`

- `tokens.css`: CSS variables from DESIGN §1, mapped into Tailwind v4 `@theme`. Self-hosted fonts via `@fontsource` (no Google Fonts request). Tabular numerals utility for numbers.
- Primitives: `Card` (with coloured header strip option), `Button` (primary/secondary/danger; hover lift; **active = translate(3px,3px) + no shadow**; focus-visible 3px blue ring), `Stat` (big mono number, label, coloured left edge, optional delta chip), `Sticker`/`Badge` (rotated −3°…+3°), `Slider` (thick track, square yellow thumb, value bubble, **keyboard: arrows, Shift = ×5, Home/End**), `Segmented` (`role="radiogroup"`), `Tabs`, `Switch` (neo toggle, used later for REVEAL ACTUALS), `Select`, `DateRange` (clamped to coverage, presets), `Marquee` (pauses on hover; **static when `prefers-reduced-motion`**), `Callout` (pink/yellow), `Skeleton` (hatched solid blocks — **no shimmer gradients**), `Table`, `Tooltip`, `Popover`.
- **Hard rules**: 3px ink borders, `6px 6px 0` shadows with **zero blur**, no gradients anywhere, no opacity-based hierarchy, never white text on yellow/pink, text contrast ≥ 4.5:1.
- Dev-only `/_kit` route (gate with `import.meta.env.DEV`) rendering every primitive in every state (default/hover-able/focus/disabled/loading/error) for visual QA.

## Step 5 — App shell (`src/App.tsx`, `src/routes.tsx`, `src/components/shell/`)

- **Top bar**: tilted "WINDWATCH" sticker logo, nav tabs (Overview `/`, Day-ahead `/day-ahead`, Accuracy `/accuracy`, Methodology `/methodology`), **data badge** from `/meta` ("DATA: JAN 2026 · snapshot id short") opening a Popover with the quality counters (retrocast rows shown as _informational_, not a warning).
- **Marquee ticker** under it fed by `/metrics/summary` (day-ahead policy, evaluation window): `MAE … MW ★ BIAS … MW ★ P90 … MW ★ …` with loading and error fallbacks.
- **Filter bar** (sticky): date range · policy `Segmented` ("As of day-ahead cutoff" / "Latest forecast ≥ N h ahead") · horizon `Slider` (0…`max_horizon_hours`, with a visible tick/label at `reliable_horizon_hours` and a Callout/Sticker "THIN DATA BEYOND {n} H" when above it) shown only for `lead_time` · cutoff `Select` (default 09:00, with ASSUMPTION sticker and a tooltip: _"WINDFOR runs publish at :30 past 02, 04, 07, 09, 11, 15, 18, 22 UTC; any cutoff in [07:30, 09:30) uses the 07:30 run"_) shown only for `day_ahead` · risk quantile `Segmented` (80/90/95/99). Show only the controls relevant to the current route; mobile: collapses into a FILTERS button + drawer.
- Routing: `React.lazy` routes for the four pages as **placeholders** (title + yellow Callout "Built in Phase 5"), plus 404 page and a route-level `ErrorBoundary` (pink Callout with RETRY and request id when available).

## Step 6 — Chart foundation (`src/components/charts/`)

- `echarts-setup.ts`: **modular** registration only (`echarts/core` + Line, Bar, Scatter, Heatmap, Grid, Tooltip, DataZoom, MarkLine, MarkArea, Legend, VisualMap piecewise, Canvas renderer). No `import * as echarts`.
- `theme.ts`: `windwatch` theme from DESIGN §6 (series colours, ink axes 2px, mono 12px labels, `animation: false` for updates; entrance animation only on first mount; honour reduced motion).
- `<Chart>` wrapper: typed `option` prop, ResizeObserver, proper dispose, `ariaLabel`, a **VIEW AS TABLE** toggle (takes `tableData`), neo-styled tooltip formatter helper.
- A demo chart on `/_kit` with fake data only. **No business charts yet.**

## Step 7 — Tests

Vitest + Testing Library + `user-event` + MSW (handlers return fixtures shaped by the generated types):

- `url-state`: round-trip, invalid → defaults, clamping to coverage, horizon clamp.
- `Slider` keyboard (arrows / Shift / Home / End) and value announcement; `Segmented` roles & arrow-key behaviour; `Button` pressed styles; `Marquee` static under reduced motion.
- `client`/`ApiError`: problem+json parsing; 4xx not retried.
- Shell: skeleton → loaded with MSW `/meta`; meta failure → error Callout + RETRY; data badge popover content; only relevant filter controls shown per route/policy.
- **a11y**: axe assertion on the shell and on `/_kit` (no serious/critical violations).
- Bundle check: `npm run build` then a small script that prints gzipped sizes and **fails if the initial JS > 350 KB gz** (ECharts must be in a lazy chunk, not the entry).

## Definition of Done (show evidence)

- [ ] Step 0 items 1–7 reported with real output (weekly table, ADR-013 wording, mutation outputs, mapping table, reliable-horizon decision, calibration numbers, bench)
- [ ] `make lint` and `make test` green (backend + frontend); frontend coverage for `store/`, `lib/`, `api/`, `components/ui/` reported
- [ ] `gen:api` works; generated types committed; CI drift step added; no hand-written API types
- [ ] `/_kit` shows every primitive in every state; **screenshots** (desktop 1280 + mobile 390 widths) of `/_kit` and the shell saved to `docs/screens/phase4/` — describe what you see and any rough edges honestly
- [ ] Keyboard-only walkthrough of the shell works (tab order, visible focus, slider by keyboard)
- [ ] Lighthouse accessibility ≥ 95 on the shell (report the score; if you can't run Lighthouse, say so and rely on axe)
- [ ] Bundle report: initial JS gz size and the ECharts chunk size
- [ ] Suggested commit messages (not committed)

## Rules

Follow DESIGN.md exactly; if something in it is ambiguous or you want to deviate, say so instead of improvising. Types come from the generated schema. Server state only in TanStack Query; UI state only in Zustand. Charts take typed props — no fetching inside chart components. Don't build feature pages. No new dependencies beyond Step 1 without justification.

## When done

Reply with: (1) Step 0 findings, (2) what was built (short), (3) test + a11y + bundle numbers, (4) screenshot descriptions and rough edges, (5) deviations/ambiguities in DESIGN.md you hit, (6) suggested commits. **Then stop and wait — do not start Phase 5.**
