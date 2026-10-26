# VIDEO_SCRIPT.md — ≤ 10 min, unlisted YouTube

The evaluators **start with the video**. Two parts, **each ≤ 5 min**, total ≤ 10 min. Rehearse once, record in one or two takes (screen + voice, 1080p, browser zoom ~110 %, close other tabs, use the live deployed URL).

## Part 1 — Customer pitch (target 4:30) — goal: impress
Persona: you're the consultant presenting the pilot result to the utility's day-ahead trading desk. Speak in their language (MW, MWh, cutoff, imbalance), not in code.

| Time | Screen | Say (adapt, don't read) |
|---|---|---|
| 0:00–0:30 | Overview hero | "Every morning you commit to buy power for tomorrow before you know how much wind will blow. WindWatch shows exactly what the wind forecast said when you had to decide — and how far off it typically is." |
| 0:30–1:30 | `/day-ahead` pick a windy day (e.g. a day with a big miss); point at header "Forecast as of 14 Jan 09:00 · age 1.0 h" | "This is tomorrow's wind, **as it stood at your cutoff**. Blue is the forecast. Green is *firm wind* — what you can lean on with 90% confidence. The pink gap is wind at risk — plan thermal cover for it." |
| 1:30–2:15 | Toggle **REVEAL ACTUALS** | "Now the hindsight: actual wind. On this day the forecast was off by X MW at worst — and the firm line would have protected you." |
| 2:15–3:00 | Calibration card | "We don't ask you to trust it: across January, the 90% line held **87%** of the time. Honest numbers, shown." (use real value) |
| 3:00–4:00 | Overview: drag **horizon slider** 36 h → 6 h; then `/accuracy` error-vs-horizon | "A forecast made 6 hours ahead is X% better than one made 36 hours ahead. This tells you how much the next forecast refresh is worth." |
| 4:00–4:30 | Overview KPIs, close | "MAE X MW, P90 miss X MW. Next steps: more weather regimes, demand data to turn firm wind into a procurement number. Happy to take questions." |

**Pitch tips:** open with a *story* (a day when the forecast missed), not a feature tour. One number per sentence. No code, no jargon like "Zustand". Keep cursor movements deliberate.

## Part 2 — Technical review (target 4:45) — goal: easy review + knowledge transfer
Persona: handing over to the tech lead. Open VS Code/Antigravity beside the app.

| Time | Show | Say |
|---|---|---|
| 0:00–0:45 | `ARCHITECTURE.md` diagram, repo tree | "Snapshot-based design: offline ingest → Parquet → in-memory pandas → pure domain layer → thin FastAPI → React. Why: deterministic, no runtime dependency on Elexon (ADR-001)." |
| 0:45–2:00 | `domain/selection.py`, test for leakage, hypothesis test | "The one thing that must be right: *which forecast counts*. Two policies. Day-ahead picks latest publishTime ≤ cutoff — never later, never backfilled. Risk sample ends at D−2 because D−1 is incomplete at cutoff. Property tests prove no leakage." |
| 2:00–2:45 | `metrics.py`, DOMAIN.md metric table | "Sign convention, why no MAPE, nMAE normaliser, what the bias sign means commercially." |
| 2:45–3:30 | `api/v1`, `API.md`, OpenAPI → generated TS types | "Layering: routers → services → domain. Problem+json, ETag, bounds, additive-only versioning. Frontend types are generated; CI fails on drift." |
| 3:30–4:10 | Frontend: store (URL-synced), query hooks, chart `buildOption` test, slider deferred value | "Server state vs UI state split; shareable URLs; charts are pure option builders; slider uses deferred value + keepPreviousData." |
| 4:10–4:45 | CI run, Dockerfile, `docker compose up`, deployment, time ledger, "what I'd do next" | "Lint/type/test gates, Docker, Vercel. AI tools used for scaffolding, all reviewed. At scale: Postgres/DuckDB, Celery/Ray ingestion, conditional quantiles." |

**Tech tips:** show *failing-then-passing* test once; mention one real bug you caught; state assumptions (A1 cutoff 09:00) and limits (one month of data → wide tails). Keep it honest.

## Recording checklist
- [ ] Both parts clearly labelled (title cards "PART 1 — CUSTOMER", "PART 2 — TECH REVIEW").
- [ ] Total ≤ 10:00 (cut hard at 9:45).
- [ ] Audio clear; no notifications; no secrets visible.
- [ ] Upload to YouTube as **Unlisted**; test link in incognito.
- [ ] Put the link in the form (and optionally README).
