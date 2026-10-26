# PHASES.md — Build Plan (budget: ≤ 16 h; plan = 15 h + 1 h buffer)

Rules for every phase: work on a short-lived branch → small conventional commits → PR (even if self-reviewed) → CI green → merge to `main`. Update docs in the same PR as behaviour changes. A phase is done only when its **Definition of Done (DoD)** is met.

> **How to use with the AI coder:** paste the phase's *Agent prompt*, tell it to read `AGENTS.md` and the docs listed. Review diffs yourself — you'll need to explain every line in the tech-lead video.

---

## Phase 0 — Foundations & API probe (≈ 1 h)
**Goal:** repo skeleton, tooling, and *facts about the Elexon API* before designing around guesses.
- Create monorepo layout (ARCHITECTURE §4), `.gitignore`, `.editorconfig`, `.env.example`, `Makefile`.
- Backend: `pyproject.toml` (fastapi, uvicorn, httpx, pandas, numpy, pyarrow, pydantic-settings, structlog; dev: pytest, pytest-asyncio, hypothesis, ruff, mypy, respx, pytest-cov). Frontend: Vite + React 19 + TS strict + Tailwind v4 + Zustand + TanStack Query + ECharts (modular) + Vitest + Playwright.
- Pre-commit (ruff, eslint, prettier). CI skeleton running lint + empty tests.
- **`scripts/probe_elexon.py`**: call FUELHH and WINDFOR stream for 2–3 days, print param names that worked, max allowed range, row counts, sample rows, WINDFOR time resolution, min/max `horizon_h`, duplicate stats. Save raw samples to `backend/tests/fixtures/`.
- Write findings to **ADR-002** in `DECISIONS.md`; patch `DOMAIN.md §2` if reality differs.

**DoD:** `make lint test` passes; probe findings committed; README stub lists run commands.
**Agent prompt:** *"Read AGENTS.md, docs/ARCHITECTURE.md, docs/DOMAIN.md §2. Scaffold the monorepo exactly as in ARCHITECTURE §4 (no feature code yet). Then write scripts/probe_elexon.py to empirically determine the Elexon FUELHH/WINDFOR stream query params, max date range, WINDFOR resolution, horizon range and duplicate behaviour, and summarise the results in docs/DECISIONS.md ADR-002."*

## Phase 1 — Ingestion & snapshot (≈ 1.5 h)
- `elexon_client.py` (async, chunked, retry/backoff), `normalize.py`, `ingest/cli.py`, quality counters, manifest with SHA-256.
- Run for `2025-12-01 → 2026-02-01` (warm-up + Jan + tail). Commit `backend/data/snapshot/*`. Keep snapshot < 20 MB.
- Tests: respx-mocked client (retry on 503, honours Retry-After, chunk planning), normalize (dedupe, negative drop, horizon calc, timezone), manifest checksum.

**DoD:** `make ingest` reproduces snapshot; coverage report of gaps printed; tests green offline; `/meta`-ready quality numbers exist in manifest.
**Agent prompt:** *"Implement docs/SYSTEM_DESIGN.md §2. Ingestion must be idempotent, chunked per the probe findings (ADR-002), and write Parquet + manifest.json. Include respx tests with fixtures from backend/tests/fixtures. No network in tests."*

## Phase 2 — Domain engine (pure) + tests (≈ 2.5 h)  ← the most important phase
- `timeutil.py` (London day boundaries, cutoff→UTC, DST-safe), `selection.py` (lead_time, day_ahead), `metrics.py`, `risk.py`, `quality.py`.
- **Test-first.** Tiny hand-built fixtures with hand-computed expected values (put the arithmetic in comments). Hypothesis property tests for selection. Leakage tests (cutoff, D−2 error-sample rule). DST day test. Metrics edge cases (empty, single point, NaNs, zero actuals).
- Benchmark script for `by_horizon` (budget in SYSTEM_DESIGN §5).

**DoD:** domain coverage ≥ 95 %; mypy clean on `domain/`; every definition in DOMAIN.md §4 has a test named after it.
**Agent prompt:** *"Implement app/domain per docs/DOMAIN.md §3–4 and docs/SYSTEM_DESIGN.md §4, test-first. Pure functions only (no I/O, no FastAPI). Write the leakage and DST tests before the implementation and show me they fail first."*

## Phase 3 — API (≈ 1.5 h)
- `DataStore` + lifespan loading, config, logging/request-id, problem+json handlers, CORS (config), ETag/Cache-Control.
- Routers/services/schemas for every endpoint in `API.md`. Param validation with bounds; unknown params rejected.
- API tests via `httpx.ASGITransport`: golden-file contract tests against fixture snapshot; error cases; OpenAPI export → `frontend/src/api/openapi.json`.

**DoD:** every endpoint in API.md returns the documented shape; `openapi.json` committed; p95 latencies within budget on the real snapshot (script).
**Agent prompt:** *"Implement the FastAPI layer exactly per docs/API.md and layering rules in ARCHITECTURE §5. Routers must contain no pandas. Add contract tests that fail if response fields drift from API.md. Export openapi.json."*

## Phase 4 — Frontend foundation & design system (≈ 2 h)
- Tokens, fonts, base CSS, all `components/ui` primitives (DESIGN §3) + dev-only `/_kit` page.
- App shell: top bar, marquee, filter bar, router, error boundary, QueryClient, typed API client from `openapi.json`, URL-synced Zustand store.
- ECharts modular setup + `windwatch` theme + `<Chart>` wrapper (resize observer, a11y label, table toggle).

**DoD:** `/_kit` shows every primitive in all states; Lighthouse a11y ≥ 95 on shell; keyboard-only navigation works; Vitest for store/url-sync & a few primitives.
**Agent prompt:** *"Read docs/DESIGN.md fully. Build the design tokens and ui primitives with Tailwind v4, then the app shell with a URL-synced Zustand filter store and TanStack Query client typed from openapi.json. Don't build feature pages yet."*

## Phase 5 — Feature pages (≈ 3 h)
Order = value: **(1)** Overview (chart + KPIs + horizon slider) → **(2)** Day-ahead decision view incl. reveal toggle, risk band, calibration card → **(3)** Accuracy Lab charts → **(4)** Vintages drill-down → **(5)** Methodology.
- Pure `buildOption(data, theme)` functions with unit tests. Loading/empty/error states everywhere. Insight captions from templates.
- `React.lazy` for Accuracy Lab. Check bundle size budget.

**DoD:** all pages match DESIGN §5; slider interaction smooth with real data; Playwright smoke: open `/day-ahead?d=2026-01-15`, toggle reveal, change quantile, assert numbers change; mobile viewport screenshot reviewed.
**Agent prompt:** *"Build the Overview page per DESIGN §5 using the real API. Chart option builders must be pure and unit-tested. Use keepPreviousData and a deferred slider value so dragging never blanks the chart."* (repeat per page)

## Phase 6 — Docker, CI, deploy (≈ 1.5 h)
- Backend & frontend Dockerfiles (multi-stage, non-root, healthcheck), `docker-compose.yml` (one command up), CI: ruff, mypy, pytest+cov, eslint, tsc, vitest, build, docker build, snapshot-checksum guard, Playwright smoke (optional job).
- Deploy per `DEPLOYMENT.md`. Verify the live URL in **incognito**.

**DoD:** `docker compose up` serves app at `localhost:8080`; CI green on `main`; live URL works logged-out in incognito; README has the link.

## Phase 7 — Polish, docs & video (≈ 2 h)
- Fix visual rough edges, empty states, copy. Re-read Methodology page for accuracy. Final README (file map, run steps, live link, **AI-tools disclosure**).
- Record the video per `VIDEO_SCRIPT.md` (≤ 10 min total; unlisted on YouTube). Verify all URLs in incognito. Submit form per `SUBMISSION_CHECKLIST.md`.

**DoD:** checklist fully ticked.

---

## Time ledger
| Phase | Plan | Actual |
|---|---|---|
| 0 | 1.0 | |
| 1 | 1.5 | |
| 2 | 2.5 | |
| 3 | 1.5 | |
| 4 | 2.0 | |
| 5 | 3.0 | |
| 6 | 1.5 | |
| 7 | 2.0 | |
| **Total** | **15.0** | |
Update the Actual column as you go — "do not spend more than 16 hours" is part of the brief.

## Cut-lines if running late (in order)
1. Heatmap, by-level chart → 2. Vintages drill-down → 3. Playwright job in CI (keep local) → 4. Calibration card (keep endpoint) → 5. Mobile drawer polish. **Never cut:** selection correctness + tests, day-ahead view, horizon slider, error metrics, Docker, deploy, video.

## Stretch (only after everything above is done — probably skip)
- Level-conditional risk bands (quantile by forecast tercile).
- LLM "daily briefing" with structured output + a tiny eval set + cost/latency caps (maps to the JD's LLM nice-to-have).
- Celery/Prefect-orchestrated ingestion demo; CSV export; compare two cutoffs side-by-side.
