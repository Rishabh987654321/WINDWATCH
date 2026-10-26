# AGENTS.md — Read this first (rules for the AI coder)

You are building **WindWatch**, a take-home full-stack challenge: a React + FastAPI app that shows UK day-ahead buyers the wind forecast *as available at decision time* and quantifies forecast error (Elexon FUELHH actuals vs WINDFOR forecasts, January 2026 decisions). The human owner must be able to **explain every line** in a review video, so favour clarity over cleverness.

## Read order
1. `docs/DOMAIN.md` — definitions, sign convention, selection policies (**source of truth for numbers**)
2. `docs/ARCHITECTURE.md` — stack, layout, layering rules
3. `docs/SYSTEM_DESIGN.md` — data model, algorithms, performance budgets
4. `docs/API.md` — contract (**source of truth for endpoints**)
5. `docs/DESIGN.md` — Neo-Brutalism design system (**source of truth for UI**)
6. `docs/PHASES.md` — what to build now; work **one phase at a time**
7. `docs/TESTING.md`, `docs/DEPLOYMENT.md`, `docs/DECISIONS.md`

If docs conflict with each other or with reality, **stop and flag it**; don't silently pick. Update the doc in the same change once resolved.

## Hard rules
1. **No data leakage.** Day-ahead selection uses only forecasts with `publish_time ≤ cutoff(D)`. Risk error samples use delivery days ≤ **D−2**. Never backfill a missing forecast from a later one.
2. **Time**: internal = tz-aware UTC. Day boundaries = `Europe/London` via `zoneinfo`. Never naive datetimes. API times = ISO-8601 `Z`.
3. **Sign**: `error_mw = forecast_mw − actual_mw`. Units in field names (`_mw`, `_h`, `_pct`).
4. **No MAPE.** Normalise by mean actual (nMAE).
5. **Domain layer is pure** (`backend/app/domain`): no I/O, no FastAPI, no settings, no store. Routers contain no pandas. API never calls Elexon at request time.
6. **Never invent Elexon API details.** Param names, range limits, resolution, horizon range come from the Phase-0 probe (ADR-002). Do not hardcode 48 h; read `max_horizon_hours`.
7. **Never emit `NaN`/`Infinity` in JSON** — use `null`.
8. **Frontend types are generated from `openapi.json`**; don't hand-write API types. Server state → TanStack Query; UI/filter state → Zustand (URL-synced). Charts are dumb components fed by pure `buildOption` functions.
9. **Design**: follow `docs/DESIGN.md` tokens exactly: 3px ink borders, hard `6px 6px 0` shadows, **no blur, no gradients**, Archivo Black / Space Grotesk / Space Mono. WCAG AA. Never white text on yellow/pink.
10. **Tests are part of "done".** Test-first for `domain/`. Name tests after the rule they prove. Add tests for every bug fixed.

## Working agreements
- **One phase at a time.** Do not start Phase N+1 before Phase N's DoD in `PHASES.md` is met. Show a brief plan before large edits.
- **Small commits**, Conventional Commits (`feat:`, `fix:`, `test:`, `docs:`, `chore:`, `refactor:`). One logical change per commit. Branch per phase/feature.
- **Don't add dependencies casually.** Justify any addition not in ARCHITECTURE §3 in your message and in `DECISIONS.md` if significant.
- **No secrets** in the repo. Public Elexon API needs none.
- Prefer boring, readable code. Type everything (`mypy`, `tsc --strict`). Docstrings on domain functions state the rule they implement and link the DOMAIN.md section.
- Keep **bundle size** (<350 KB gz initial JS) and **latency budgets** (SYSTEM_DESIGN §5) in mind; measure before optimising.
- When unsure about a product/domain assumption: **ask the owner** or record it in DOMAIN.md §7 (assumptions log) — don't bury it in code.
- Final README must disclose AI-tool use (brief requirement) — already drafted; keep it accurate.

## Commands (create these in the Makefile in Phase 0)
```
make dev          # backend (reload) + frontend (vite) 
make test         # pytest + vitest
make lint         # ruff, mypy, eslint, tsc
make ingest       # rebuild Parquet snapshot from Elexon
make golden       # regenerate API golden files (review the diff!)
make docker-up    # docker compose up --build  → http://localhost:8080
make vercel-reqs  # export runtime requirements.txt for Vercel
```

## Definition of Done (every PR)
- [ ] Lint, types, tests pass locally and in CI
- [ ] New behaviour has tests (incl. edge cases / leakage where relevant)
- [ ] Docs updated (API.md / DOMAIN.md / DECISIONS.md as needed)
- [ ] UI states: loading, empty, error handled; keyboard + contrast OK
- [ ] No console errors; no TODOs without an issue/ADR reference
