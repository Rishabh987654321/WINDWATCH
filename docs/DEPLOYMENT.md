# DEPLOYMENT.md — Docker + Vercel

Brief requires: **use Docker** and **deploy to Vercel or Heroku**. Plan: Docker for local/dev/prod-parity and CI; **Vercel** for the public demo. Heroku is the fallback (container stack).

## 1. Docker (local & CI)

### `backend/Dockerfile` (multi-stage, non-root)
- Stage `builder`: `python:3.12-slim`, install deps into a venv (`pip install --no-cache-dir .`).
- Stage `runtime`: copy venv + `app/` + `data/snapshot/`; `USER app`; `HEALTHCHECK` on `/health`; `CMD ["uvicorn","app.main:app","--host","0.0.0.0","--port","8000"]`.
### `frontend/Dockerfile`
- Stage `build`: `node:22-alpine`, `npm ci && npm run build` (build arg `VITE_API_BASE_URL`, default `/api`).
- Stage `serve`: `nginx:alpine` with `nginx.conf` — SPA fallback (`try_files $uri /index.html`), gzip, long-cache hashed assets, and **reverse-proxy `/api/` → `http://backend:8000/api/`** so the browser sees one origin (no CORS).
### `docker-compose.yml`
```
services:
  backend:  build ./backend,  expose 8000, env_file .env, healthcheck
  frontend: build ./frontend, ports "8080:80", depends_on backend (healthy)
```
`make docker-up` → open http://localhost:8080. Add `docker-compose.dev.yml` override (bind mounts + `--reload` + Vite dev server) only if time permits.

## 2. Vercel (primary public deployment) — single project

**Layout idea:** one Vercel project, repo root. Static frontend built from `frontend/`, Python FastAPI as a serverless function under `/api`.

- `api/index.py`: `from backend.app.main import app` (Vercel's Python runtime serves an ASGI `app`). Make `backend` importable (add `backend/__init__.py` or adjust `sys.path` in `api/index.py`).
- Root `requirements.txt` for Vercel (mirrors `backend/pyproject.toml` runtime deps; generate it with `make vercel-reqs` so they can't drift).
- `vercel.json` (shape; adjust to current Vercel docs when implementing):
  ```json
  {
    "buildCommand": "cd frontend && npm ci && npm run build",
    "outputDirectory": "frontend/dist",
    "functions": { "api/index.py": { "includeFiles": "backend/data/snapshot/**", "maxDuration": 30 } },
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/index" },
      { "source": "/((?!api/).*)", "destination": "/index.html" }
    ]
  }
  ```
- Env vars in Vercel dashboard: copy from `.env.example` (no secrets needed; `ADMIN_TOKEN` unset ⇒ admin disabled).
- **Gotchas to check early (Phase 6, timebox 45 min):**
  - **Bundle size**: pandas + numpy + pyarrow can approach Vercel's function size limit (250 MB unzipped). If exceeded: drop `pyarrow` (store `csv.gz`/`npz`/`feather`-free format and read with pandas) or switch snapshot to CSV.gz; consider polars only if needed. Record in ADR.
  - **Cold start**: loading the snapshot must stay < 1–2 s. Don't compute by-horizon at import time; compute lazily and cache in module globals.
  - **Read-only FS**: the function must never write files. Logging to stdout only.
  - **Region**: choose `lhr1` (London) to be near both the audience and Elexon.
  - If the **single-project** setup fights back, fall back to **two Vercel projects** (frontend static; backend Python) with `VITE_API_BASE_URL` pointing at the backend and CORS allow-list set — or host the backend container on Render/Fly/Railway and keep the frontend on Vercel. Keep whichever works; document it in README + ADR.

## 3. Heroku fallback (container stack)
`heroku.yml` with `build: docker: web: backend/Dockerfile` (serve built frontend from FastAPI `StaticFiles` in that case, one dyno). Needs a paid dyno plan — prefer Vercel.

## 4. Verification checklist (before submitting)
- [ ] Open live URL in an **incognito window**, logged out of everything — app loads, `/api/v1/meta` returns JSON.
- [ ] Deep links work on refresh: `/day-ahead?d=2026-01-15`, `/accuracy`.
- [ ] No console errors; no mixed-content; fonts load.
- [ ] Cold-start (first request after idle) < 5 s and the UI shows skeletons, not a blank page.
- [ ] `docker compose up --build` from a **fresh clone** works with only `.env.example` copied.
- [ ] GitHub repo is **public**, repo name anonymous (random string), no personal info/commit emails (`git config user.email` = noreply address; check history).

## 5. Config reference (`.env.example`)
```
APP_ENV=prod
LOG_LEVEL=INFO
SNAPSHOT_DIR=backend/data/snapshot
DAY_AHEAD_CUTOFF_LOCAL=09:00
EVAL_WINDOW_FROM=2026-01-01
EVAL_WINDOW_TO=2026-01-31
WARMUP_START=2025-12-01
RISK_QUANTILE_DEFAULT=0.9
RISK_WINDOW_DAYS_DEFAULT=14
CORS_ORIGINS=            # only if FE/API on different origins
ADMIN_TOKEN=             # empty = admin endpoint disabled
VITE_API_BASE_URL=/api   # frontend build arg
```
