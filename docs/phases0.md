# PHASE 0 PROMPT — paste everything below into Antigravity

---

You are the AI coder for **WindWatch**, a take-home full-stack project (React + FastAPI) that shows UK day-ahead power buyers the wind forecast available at decision time and quantifies forecast error, using Elexon BMRS data (FUELHH actuals, WINDFOR forecasts).

**Before doing anything, read in this order:** `AGENTS.md`, `docs/ARCHITECTURE.md`, `docs/DOMAIN.md` (especially §2 and §3), `docs/PHASES.md` (Phase 0 only), `docs/TESTING.md` §4.

## Your task: Phase 0 only — foundations and Elexon API probe

Do **not** write any feature code (no selection logic, metrics, endpoints or pages). Stop when Phase 0's Definition of Done is met and report back.

### Step 1 — Show me a short plan first (5–8 bullets), then proceed.

### Step 2 — Scaffold the monorepo exactly as in `docs/ARCHITECTURE.md` §4

- Root: `.gitignore`, `.editorconfig`, `.env.example` (use the list in `docs/DEPLOYMENT.md` §5), `Makefile`, `docker-compose.yml` (placeholder is fine), `.github/workflows/ci.yml`, `.pre-commit-config.yaml`.
- **Backend** (`backend/`): Python 3.12, `pyproject.toml` with runtime deps `fastapi`, `uvicorn[standard]`, `httpx`, `pandas`, `numpy`, `pyarrow`, `pydantic-settings`, `structlog`; dev deps `pytest`, `pytest-asyncio`, `pytest-cov`, `hypothesis`, `respx`, `ruff`, `mypy`. Create the empty package skeleton (`app/{api/v1,schemas,services,domain,data,ingest}/__init__.py`, `app/main.py` exposing only a `/api/v1/health` endpoint, `tests/{unit,api,fixtures}`). Configure ruff and mypy (strict on `app/domain`) in `pyproject.toml`. Add one trivial passing test.
- **Frontend** (`frontend/`): Vite + React 19 + TypeScript (**strict**), Tailwind CSS v4, Zustand, TanStack Query, ECharts (installed; don't build charts yet), Vitest + Testing Library, Playwright (installed, no tests yet), eslint + prettier. Render a placeholder page that says "WINDWATCH" and calls `/api/v1/health` through a Vite dev proxy (`/api` → `http://localhost:8000`). Add one trivial passing Vitest test.
- **Makefile targets** (per `AGENTS.md`): `dev`, `test`, `lint`, `ingest`, `golden`, `docker-up`, `vercel-reqs` — implement `dev`, `test`, `lint` now; the others can print "not implemented yet".
- **CI** (`ci.yml`): jobs for backend (ruff, mypy, pytest) and frontend (eslint, tsc --noEmit, vitest, build). Must pass on the scaffold.
- **Git**: initialise a repo, first commit `chore: scaffold monorepo`, then work on branch `phase-0-probe`. Use Conventional Commits and a noreply author email (do not use a real name/email in git config for this repo).

### Step 3 — Write and run `scripts/probe_elexon.py`

Standalone script (httpx, no app imports). Base URL: `https://data.elexon.co.uk/bmrs/api/v1`. Probe for a **3-day window in January 2026 (publish/settlement dates 2026-01-05 → 2026-01-08)** and print a clear report of:

1. **FUELHH** `/datasets/FUELHH/stream`: which query params work (try `settlementDateFrom`, `settlementDateTo`, `fuelType=WIND`, `format=json`); whether the `fuelType` filter works server-side; row count; sample rows; unique `fuelType` values if unfiltered; time grid check (is every `startTime` on a 30-min step? any gaps?).
2. **WINDFOR** `/datasets/WINDFOR/stream`: which params work (try `publishDateTimeFrom`, `publishDateTimeTo`, `format=json`); row count; sample rows; **resolution of `startTime`** (30 min vs hourly); **min/max horizon** = `startTime − publishTime` in hours; number of distinct `publishTime`s and how often they occur; whether `(startTime, publishTime)` duplicates exist; any negative horizons.
3. **Max range per request**: binary-search / step-test how many days each endpoint accepts in one call (try 1, 3, 7, 14, 28 days) and record the error message when it refuses.
4. **Timestamp format** (timezone suffix) and field names exactly as returned.
5. **Rate-limit / latency** observations (time per request; any 429s).
6. Whether WINDFOR has forecasts covering **targets on 2026-01-01 00:00 UTC** that were published in **December 2025** (query a publish window like 2025-12-29 → 2025-12-31 and check target times).

Save **trimmed raw JSON samples** (≈50 rows each) to `backend/tests/fixtures/elexon_raw/` (`fuelhh_sample.json`, `windfor_sample.json`). Do **not** commit anything large.

If the network call fails or a param guess is wrong, **do not guess or fabricate** — report the exact HTTP status/error, try the documented alternative once, and tell me what you need.

### Step 4 — Record findings

Fill in **ADR-002** in `docs/DECISIONS.md` with the concrete results (param names, max range, WINDFOR resolution, horizon range, duplicates, timestamp format, impact on design). If reality contradicts `docs/DOMAIN.md` §2, `docs/SYSTEM_DESIGN.md` §1–2 or `docs/API.md` (e.g. horizon range ≠ 48 h, hourly resolution, different max range), **list the proposed doc edits and apply them**, keeping changes minimal.

### Step 5 — Update `README.md` stub

Make sure the quick-start commands in the README actually work on the scaffold.

## Definition of Done (verify each and show me the evidence)

- [ ] `make lint` and `make test` pass locally (show output)
- [ ] CI workflow file is valid and mirrors the same checks
- [ ] Backend `/api/v1/health` returns `{"status":"ok"}`; frontend placeholder renders and reaches it via the proxy
- [ ] `scripts/probe_elexon.py` ran successfully; its console report is pasted in your reply
- [ ] Raw fixture samples saved in `backend/tests/fixtures/elexon_raw/`
- [ ] ADR-002 filled with real findings; any doc contradictions fixed
- [ ] Work is committed on `phase-0-probe` in small conventional commits

## Rules to respect (from AGENTS.md)

Never invent Elexon API details · don't hardcode a 48 h horizon · don't add dependencies beyond ARCHITECTURE §3 without saying why · no secrets in the repo · explain anything non-obvious briefly — I must be able to explain every line in a review video.

## When done

Reply with: (1) the probe report, (2) the key findings that change the design (if any), (3) the commit list, (4) anything blocked or uncertain. **Then stop and wait for me — do not start Phase 1.**
