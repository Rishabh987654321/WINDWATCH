# PHASE 6 PROMPT — Fixes + Docker, CI, Deployment prep, PII scan (paste everything below into Antigravity)

---

You are the AI coder for **WindWatch**. Phase 5b is accepted with the checks in Step 0. This phase makes the project **runnable by a stranger from a fresh clone**, **CI-gated**, and **ready to deploy**. Re-read `AGENTS.md`, `docs/DEPLOYMENT.md`, `docs/ARCHITECTURE.md` §3 & §7, `docs/TESTING.md` §4, `docs/PHASES.md` (Phase 6). Branch: `phase-6-ship`. **Do not commit/push; do not deploy** (I will push to GitHub and deploy to Vercel myself) — give suggested Conventional Commit messages. Windows-safe commands. Same reporting rules: raw output for numbers, honest DONE/PARTIAL/NOT DONE, no invented data.

## Step 0 — Close the 5b review items (raw output)

1. **Calibration arithmetic must close.** Your summary said: 28 Jan = 0 hits, 20 days at 100 %, 2 days at 87.5–95.8 %, 8 days at 25–62.5 %. Even at the top of every range that is ≤ 646 hits, but the stated total is **659 / 744**. Print the **per-day hits for q = 0.90, w = 28** (date, hits, n) and assert `Σ hits == 659` and `Σ n == 744`. Fix whatever is wrong (the summary text in `docs/CALIBRATION.md`, the UI caption, or the code) and tell me which it was.
2. **Check the 12-hour horizon number.** The Overview showed **MAE 1,794.2 MW at H = 12**, but the Phase 2 bucket analysis had 1,794.2 for the _0–12 h_ bucket and **1,897.5 for the 12–24 h bucket** (the latest forecast made ≥ 12 h ahead should land in the 12–24 h bucket). Print raw JSON for `GET /api/v1/metrics/summary?policy=lead_time&horizon_hours={0,12,24}&from=2026-01-01&to=2026-01-31` and the `/metrics/by-horizon` points for H = 0, 12, 24, plus the _current_ output of `scripts/bias_diagnostic.py` horizon buckets. Explain any discrepancy: is the UI showing stale data (e.g. the H = 0 result), is the diagnostic's bucket definition off by one step, or is the domain right and I'm mis-reading? Fix the bug if there is one and add a regression test asserting `summary(H)` MAE equals the `by_horizon` MAE at the same H for H ∈ {0, 6, 12, 24, 36}.
3. **By-horizon click evidence.** Show a test where clicking/activating a point on the by-horizon chart sets `policy=lead_time` and `h`. If a canvas click is impractical, add a keyboard-accessible alternative (a "SET HORIZON" button per row in VIEW AS TABLE) **and** test it; also test the real heatmap _chart_ cell click (via ECharts `dispatchAction` or a pointer click) — not only the table link.
4. **Polish the vintages caption**: local time (London) instead of raw ISO, thousands separators, no "INSIGHT:" prefix duplication. Example: _"16 forecasts were published for 12 Jan 01:00; they ranged from 20,232 to 21,353 MW; actual was 14,048 MW."_ Update tests. (Neutral wording — no causes.)
5. **Lighthouse accessibility** for `/day-ahead`, `/accuracy`, `/methodology` (you only reported `/`) — paste scores or "not run".

## Step 1 — Python version consistency

Local runs use **Python 3.13.2**, but Docker and Vercel target **3.12**. Set `requires-python = ">=3.12,<3.14"`, run the whole backend suite under **3.12** (Docker or a 3.12 venv) and paste the summary line. CI matrix: 3.12 and 3.13.

## Step 2 — Docker (per `docs/DEPLOYMENT.md` §1)

- `backend/Dockerfile`: multi-stage, `python:3.12-slim`, deps in a venv, copy `app/` + `data/snapshot/` only, **non-root user**, `HEALTHCHECK` on `/api/v1/health`, `PYTHONUNBUFFERED=1`, `uvicorn app.main:app --host 0.0.0.0 --port 8000`.
- `frontend/Dockerfile`: `node:22-alpine` build stage (`npm ci`, `npm run build`, build-arg `VITE_API_BASE_URL` default `/api`), `nginx:alpine` serve stage with `nginx.conf`: SPA fallback (`try_files $uri /index.html`), gzip, immutable cache for hashed assets / no-cache for `index.html`, security headers, and **reverse proxy `/api/` → `http://backend:8000/api/`**.
- `docker-compose.yml`: `backend` (healthcheck, `env_file: .env`), `frontend` (`depends_on: backend: condition: service_healthy`, ports `8080:80`). `.dockerignore` for both (exclude `node_modules`, `.venv`, `docs/screens`, `.git`, tests where sensible — but **keep `backend/data/snapshot`**).
- `make docker-up` / `make.bat docker-up`, plus `docker-down`.
- **Verify from a fresh clone**: clone the working tree into a temp folder (`git clone . <tmp>` after staging, or copy tracked files), `copy .env.example .env`, `docker compose up --build -d`, then paste raw output of: `curl http://localhost:8080/api/v1/health`, `/api/v1/meta` (trimmed), `/api/v1/day-ahead/2026-01-15` (first 2 periods + summary), and `curl -I http://localhost:8080/day-ahead?d=2026-01-15` (200 + `text/html`, i.e. SPA fallback works), plus `docker compose exec backend id` (non-root) and `docker images` sizes. **If Docker is not installed on this machine, say so plainly** and rely on the CI docker job (Step 4); tell me what I need to install.

## Step 3 — Vercel readiness (you prepare; I deploy)

Single Vercel project at repo root (frontend static + FastAPI function under `/api`):

- `api/index.py` (exists from Phase 0): verify it imports `app` correctly in a serverless layout, never writes to disk, and logs to stdout.
- Root `requirements.txt` generated by `make vercel-reqs` from `backend/pyproject.toml` runtime deps only (no dev deps). Add a CI check that it is in sync.
- `vercel.json`: `buildCommand` (`cd frontend && npm ci && npm run build`), `outputDirectory` (`frontend/dist`), function `includeFiles` for `backend/data/snapshot/**`, `maxDuration`, region `lhr1`, rewrites (`/api/(.*)` → function; everything else → `/index.html`). Check the current Vercel docs for the exact schema before writing it (don't guess); cite what you checked.
- **Size check**: install the runtime requirements into a temp dir (`pip install -r requirements.txt -t <tmp>`), report the **unzipped size in MB** (limit 250 MB). If it's close or over, propose options (drop `pyarrow` by shipping the snapshot as `csv.gz`/`pickle`-free format read by pandas; trim pandas extras) and record in an ADR **before** changing anything — wait for my decision if it requires changing the snapshot format.
- Cold-start check: time `app` import + snapshot load locally (target < 2 s) and paste it.
- `scripts/smoke_deployed.py <base_url>` (httpx): checks `/api/v1/health`, `/api/v1/meta` (snapshot id present, `reliable_horizon_hours` int), `/api/v1/metrics/summary?policy=day_ahead&cutoff=09:00&from=2026-01-01&to=2026-01-31` (**n = 744, bias ≈ +1851.5, MAE ≈ 2127.5**, tolerance 0.1), `/api/v1/day-ahead/2026-01-15` (24 periods, every `forecast_published_at = 2026-01-14T07:30:00Z`), and that `/`, `/day-ahead?d=2026-01-15`, `/accuracy`, `/methodology` return 200 HTML. Exits non-zero on any failure. Run it against your local docker/dev stack and paste the output.
- Update `docs/DEPLOYMENT.md` with **exact click-by-click steps** for me: import the GitHub repo in Vercel → framework "Other" → root directory → build/output settings → env vars (from `.env.example`) → region → deploy → run `scripts/smoke_deployed.py <url>` → incognito checklist.

## Step 4 — CI hardening (`.github/workflows/ci.yml`)

Jobs (cache pip and npm; fail-fast off; `concurrency` cancels superseded runs):

1. **backend** (matrix py 3.12, 3.13): `ruff check`, `ruff format --check`, `mypy app` (strict on `domain/`), `pytest --cov=app --cov-fail-under=90`, snapshot-checksum guard, OpenAPI drift guard, `requirements.txt` sync check.
2. **frontend**: `eslint`, `tsc --noEmit`, `vitest --coverage`, `vite build`, `npm run check:bundle`, `node scripts/contrast_check.mjs`, `gen:api` drift guard.
3. **e2e**: start the backend (uvicorn) + built frontend preview (or dev server), install Playwright browsers (`npx playwright install --with-deps chromium`), `npm run e2e`; **no `continue-on-error`** now; upload the Playwright report/traces as an artifact on failure.
4. **docker**: `docker compose build`, `docker compose up -d`, wait for health, run `scripts/smoke_deployed.py http://localhost:8080`, `docker compose down`.
   Add a CI status badge to `README.md` with placeholder `OWNER/REPO`. Validate the YAML (`actionlint` if available; otherwise a YAML parse + careful read) and paste the result. Be explicit about anything you could **not** run locally.

## Step 5 — Repository hygiene & anonymity (the brief requires an anonymous public repo)

- `.gitignore` check: `.venv`, `node_modules`, `.env`, `dist`, coverage, Playwright artifacts, `__pycache__`. Ensure `.env.example` is committed, `.env` is not.
- **PII scan** of everything that would be committed (`git ls-files` + untracked-not-ignored): search for `risha`, `rishabh`, `perceptiviti`, any e-mail address pattern, `C:\\Users`, `/Users/`, `Downloads\\`, hostnames. Paste the grep and **remove/redact every hit** (benchmark and test outputs saved to docs/screens/logs often contain absolute Windows paths). Check `package.json`/`pyproject.toml` author fields and `LICENSE` holder → neutral placeholder.
- Print `git config user.name` / `user.email` for this repo and tell me what they are; tell me to set a **GitHub noreply** e-mail before my first commit (`git config user.email "<id>+<name>@users.noreply.github.com"`) and that the **repo name must be a random string**.
- Size check of the tree to be committed (`git count-objects -vH` equivalent or sum of tracked files); flag anything > 1 MB (screenshots) and keep only what README/video need (`docs/screens/` may stay but keep it small).
- Add `LICENSE` (MIT) with a neutral holder.

## Step 6 — README finalisation

Rewrite `README.md` so it is **accurate to the real tree**: file/directory map generated from `git ls-files` (2 levels) with one line per entry; how to start (Docker; local dev for Windows PowerShell and macOS/Linux; `make`/`make.bat` equivalents); how to run tests (backend, frontend, e2e); how to rebuild the snapshot; **placeholders** for live URL and video URL; CI badge; link table to `docs/`; key ideas; assumptions & limits (hourly grid ADR-011, 09:00 cutoff A1, window = 28 d chosen after seeing January ADR-015, bias reported not explained, one month of data); **AI usage disclosure** (Antigravity + Claude; all code reviewed by the author). No hard-coded claims in the README that aren't true of the repo (check each command you list actually works; paste the evidence for the Windows commands).

## Definition of Done (show evidence)

- [ ] Step 0 items 1–5 answered with raw output (hits sum 659; H = 0/12/24 JSON; click tests; caption; Lighthouse ×3)
- [ ] Backend suite green on Python 3.12 (paste summary); `requires-python` set
- [ ] Docker: fresh-clone `compose up` verified with the curl outputs, non-root, image sizes — or an explicit "Docker not available here" + CI docker job in place
- [ ] Vercel: `vercel.json`, `requirements.txt` sync, unzipped dependency size (MB), cold-start timing, `smoke_deployed.py` output against the local stack, updated `DEPLOYMENT.md`
- [ ] CI workflow updated with the 4 jobs; YAML validated; list of what couldn't be run locally
- [ ] PII scan output + fixes; repo hygiene items; LICENSE
- [ ] README accurate; commands verified
- [ ] Suggested commit messages (not committed)

## Rules

Don't deploy, push, or create remote repos. Don't change product behaviour except for bugs found in Step 0 (with regression tests). No new runtime dependencies without justification. If a Vercel limit forces a design change (e.g. snapshot format), stop and ask first.

## When done

Reply with a DONE / PARTIAL / NOT DONE checklist for Steps 0–6 with raw outputs underneath, then a short list of **exact things I must do manually** (create repo with random name, set noreply email, push, connect Vercel, run smoke script, incognito check). **Then stop and wait — do not start Phase 7.**
