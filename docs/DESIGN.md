# DESIGN.md — UI/UX & Neo-Brutalism Design System

**Style chosen: #13 Neo-Brutalism** from the *UI Style Field Guide 2026* (Drive PDF). Why it fits: confident, high-contrast, "visible structure" suits a data-dense analytics tool, thick outlines separate dense information cleanly, and it's memorable in a demo. We **adapt** the guide's prompt: its all-yellow page background is too loud behind charts, so yellow becomes a *frame/accent colour* and the working surface is paper-cream.

> Rules from the guide we keep: thick black borders (3px) on everything · hard offset shadows with **zero blur** · flat saturated clashing colours · chunky grotesk type · tilted sticker badges · marquee ticker · buttons that move down-right and lose their shadow on press · no gradients, no blur, no subtle greys.
> Rules we add for a *professional* tool: WCAG AA contrast, restraint (one loud thing per view), tabular numerals, consistent spacing scale.

## 1. Tokens (define as CSS variables; expose to Tailwind v4 `@theme`)

```css
:root {
  /* palette — from the guide */
  --nb-yellow:  #FFE94A;   /* frame, highlights, primary CTA */
  --nb-pink:    #FF6B9E;   /* over-forecast / risk / alerts */
  --nb-blue:    #4D7CFE;   /* forecast series */
  --nb-green:   #00C48C;   /* good / firm wind / under control */
  --nb-ink:     #111111;   /* borders, text, actuals */
  /* surfaces */
  --nb-paper:   #FFF8E1;   /* app background (warm cream) */
  --nb-card:    #FFFFFF;
  --nb-muted:   #5A5A5A;   /* secondary text — passes AA on paper/white; NEVER lighter */
  /* geometry */
  --nb-border:  3px;
  --nb-radius:  8px;       /* "squared or lightly rounded" */
  --nb-shadow:  6px 6px 0 var(--nb-ink);
  --nb-shadow-sm: 3px 3px 0 var(--nb-ink);
  --nb-shadow-press: 0 0 0 var(--nb-ink);
  /* spacing: 4px base → 4 8 12 16 24 32 48 64 */
}
```
- Dark mode: **not in v1** (state in README). Don't half-do it.
- Never use `opacity`/grey tints for hierarchy; use size, weight, or a solid colour block.

## 2. Typography
| Role | Font | Notes |
|---|---|---|
| Display / H1–H2 | **Archivo Black** | uppercase for H1 only, tight leading 0.95 |
| Body / UI | **Space Grotesk** 400/500/700 | 15–16 px body |
| Numbers / axes / KPIs | **Space Mono** (or JetBrains Mono) | `font-variant-numeric: tabular-nums` everywhere numbers align |
Self-host via `@fontsource/*` (no runtime Google Fonts request → faster, works offline in Docker). Scale: 12 / 14 / 16 / 20 / 28 / 40 / 64.

## 3. Components (build in `components/ui`, with Storybook-free "UI kit" page at `/_kit` for visual QA — dev only)
| Component | Spec |
|---|---|
| **Card** | white, 3px ink border, `--nb-shadow`, 8px radius, 16–24px padding; optional coloured header strip (yellow/blue/pink/green) with Archivo title |
| **Button** | ink border, shadow-sm; variants: `primary` (yellow), `secondary` (white), `danger` (pink). Hover: translate(-1px,-1px) & shadow grows to 4px. **Active: translate(3px,3px), shadow none.** Focus-visible: 3px blue outline offset 2px |
| **Stat (KPI tile)** | big mono number (40px), label (12px caps), delta chip, coloured left edge (8px block) matching meaning; optional sticker |
| **Sticker / Badge** | rotated −3°…+3°, ink border, solid fill, uppercase 12px bold — use for "FORECAST AGE 3.5H", "ASSUMPTION", "LEAKAGE-SAFE" |
| **Slider** | thick 12px ink track, square 28px yellow thumb with border+shadow, value bubble in mono; keyboard accessible (arrow keys; shift = ×5) |
| **Segmented control / Tabs** | joined boxes, active = yellow fill + pressed (no shadow) |
| **DateRange** | two inputs + presets ("Jan 2026", "Week 1…4"); clamp to coverage |
| **Marquee** | ink background strip, yellow mono text, CSS `translateX` loop; pauses on hover and respects `prefers-reduced-motion` (static) |
| **Tooltip (chart)** | white card w/ border+shadow-sm, mono numbers, series colour squares |
| **Skeleton** | hatched/striped solid-colour block (no shimmer gradient — gradients are off-brand) |
| **Callout** | pink or yellow block with icon; used for assumptions & caveats |
| **Table** | 3px outer border, 2px row rules, zebra with cream, sticky header |

## 4. Layout & navigation
- Global shell: **top bar** (logo sticker "WINDWATCH" tilted −2°, nav tabs, snapshot badge "DATA: JAN 2026 · 12 GAPS" opening a quality popover), **marquee ticker** under it showing live KPIs (e.g. `MAE 610 MW ★ BIAS −85 MW ★ P90 1,350 MW ★ …`), content on a 12-col grid, max-width 1280.
- Persistent **Filter bar** (sticky on scroll): date range · policy toggle · horizon slider *or* cutoff select · risk quantile. State ↔ URL.
- Responsive: ≥1024 two-column dashboards; <768 single column, charts full width, filter bar collapses into a "FILTERS" button + drawer. Hard-shadow cards remain.

## 5. Pages (routes)

### `/` — Overview  *(customer pitch landing)*
1. **Hero card** (yellow frame): one-sentence value prop, 3 headline KPIs for Jan 2026 at the day-ahead cutoff, CTA "OPEN DECISION VIEW →".
2. **Actual vs Forecast** big chart (ECharts line, canvas): actual = ink 2.5px solid; forecast = blue 2.5px; area between them shaded pink where over-forecast / green where under-forecast (optional: two translucent solid fills, no gradients). `dataZoom` slider (neo-styled), brush to select a span → KPI strip updates for the brushed range.
3. **KPI strip**: MAE · RMSE · Bias · nMAE · P90 |error| · Over-forecast rate. Each with a tiny "?" opening the definition (links to Methodology).
4. **Horizon slider card**: "Use the latest forecast made ≥ **N h** before delivery" — dragging live-updates chart and KPIs. (This *is* the interactive demo moment.)

### `/day-ahead` — Decision view *(headline feature)*
- Date picker for **delivery day D** (prev/next day buttons, keyboard ←/→), cutoff select (default 09:00) with ASSUMPTION sticker.
- Header strip: "Forecast as of **14 Jan 09:00** · latest publish **08:00** · age **1.0 h**".
- **Main chart**: 24 hourly periods. Blue forecast line; **green "firm wind" step line** and a **hatched/solid pink band** between firm and band_high (the uncertainty); actuals hidden by default behind a **"REVEAL ACTUALS" toggle** (neo switch) — the buyer didn't know them at decision time. Revealed actuals = ink line.
- Side cards: *Total forecast MWh*, *Expected MWh*, *Firm wind MWh (90% target)*, *Wind-at-risk MWh* (= difference), *Day accuracy* (only after reveal).
- **Risk controls**: quantile (80/90/95/99 segmented), window days (7/14/21/28, default 28).
- **Calibration card**: "Target 90% · Realised 88.6%" with a mini bar-per-day chart (green where ≥ target, pink where below). Honest, reviewable.
- Copy tone: plain English for traders ("On the 09:00 forecast, plan for at least {mean_firm} MW of average wind (90% target); {mean_risk} MW of forecast wind is at risk").

### `/accuracy` — Accuracy Lab
Grid of cards, each a chart + 1-line insight caption generated from data (template strings, not LLM):
1. **Error vs horizon** (line: MAE, RMSE; area for P90) — x = hours ahead. Click a point to set the global horizon.
2. **Error distribution** (histogram, pink for over-forecast bins, green for under-forecast, vertical lines at P5/P50/P95).
3. **By hour of day** (bars MAE + bias line).
4. **By generation level** (5 bins).
5. **Day × hour heatmap** of MAE (canvas; solid colour steps, 5 discrete levels from paper → pink → ink; legend).
6. **Forecast evolution**: click any point in chart 1/Overview → target period; shows every vintage by publishTime converging (or not) on the actual.

### `/methodology`
Definitions (from DOMAIN.md), sign convention, selection policies with a small diagram, assumptions log (A1–A5), caveats, "why not MAPE", data lineage (manifest, snapshot id, source links), AI-use disclosure, link to repo.

### Empty / error / loading states
Every query-backed card: skeleton → content; error → pink Callout with "RETRY" button and request id; empty → yellow Callout explaining why (e.g. "No forecast published before cutoff for 3 periods").

## 6. Chart styling (ECharts theme `windwatch`)
- Series colours: Actual `#111`, Forecast `#4D7CFE`, Firm wind `#00C48C`, Risk band/over-forecast `#FF6B9E`, Highlight `#FFE94A`.
- **Colour-blind safety**: never encode only by hue — also vary line style (actual solid thick, forecast solid, firm = stepped, band = hatch pattern) and direct-label series ends.
- Axes: ink 2px lines, mono 12px labels, grid lines `#111` at 15% — *exception to "no subtle greys": chart gridlines only*, else use dashed ink lines. Pick one and keep it consistent.
- Tooltips: custom HTML formatter using the Tooltip component styles; show local time (London) and UTC on hover.
- Animation: `animation: false` for data updates (slider drag must feel instant); entrance animation only on first mount.
- Respect `prefers-reduced-motion`.

## 7. Motion & micro-interaction
Press = translate + remove shadow (80 ms). Cards lift 2px on hover only if interactive. Page transitions: none. Marquee: 40 s linear loop. Stickers: slight wiggle on hover (not on touch).

## 8. Accessibility checklist (part of Definition of Done)
- Contrast ≥ 4.5:1 for text (yellow `#FFE94A` with ink text ✓; **never** white text on yellow/pink; pink with ink text ✓).
- All controls reachable by keyboard, visible 3px focus ring.
- Charts: `aria-label` summary + "VIEW AS TABLE" toggle exposing the data.
- Slider announces value; segmented controls use `role="radiogroup"`.
- No information by colour alone (see §6).

## 9. Copy deck (use verbatim for consistency)
- App name: **WINDWATCH** · tagline: *"Know your wind before you buy."*
- Policy labels: **"As of day-ahead cutoff"** (day_ahead) / **"Latest forecast ≥ N h ahead"** (lead_time).
- Firm wind: **"Firm wind (90% target)"** and always display alongside: **"Target 90% · Realised 84%"** (or dynamic backtest realised %). Wind-at-risk: **"Wind at risk"**.
- Sign: **"Over-forecast = forecast above actual."** (Neutral copy; no causal claims).
