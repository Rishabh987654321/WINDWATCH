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

**Layout:** Single Vercel project at the repository root. Static React frontend built from `frontend/`, Python FastAPI served as a serverless ASGI function under `/api`.

- `api/index.py`: Serverless entrypoint exporting `app` from `backend.app.main`. Reads snapshot from `backend/data/snapshot` using read-only filesystem, logs to stdout.
- `requirements.txt`: Root runtime dependencies generated from `backend/pyproject.toml` via `make vercel-reqs`. Unzipped size is **177.71 MB**, safely within Vercel's 250 MB limit (72.29 MB headroom).
- `vercel.json`:
  ```json
  {
    "buildCommand": "cd frontend && npm ci && npm run build",
    "outputDirectory": "frontend/dist",
    "regions": ["lhr1"],
    "functions": {
      "api/index.py": {
        "includeFiles": "backend/data/snapshot/**",
        "maxDuration": 30
      }
    },
    "rewrites": [
      { "source": "/api/(.*)", "destination": "/api/index.py" },
      { "source": "/(.*)", "destination": "/index.html" }
    ]
  }
  ```

### Click-by-Click Deployment Steps for the Repository Owner
1. **Log in to Vercel**: Navigate to [vercel.com](https://vercel.com) and log in with your GitHub account.
2. **Add New Project**:
   - Click **"Add New..."** → **"Project"**.
   - Select your anonymous, randomly-named GitHub repository and click **"Import"**.
3. **Configure Project Settings**:
   - **Framework Preset**: Select **"Other"**.
   - **Root Directory**: Leave as `./` (repo root).
   - **Build and Output Settings**: Defaults are automatically picked up from `vercel.json`:
     - Build Command: `cd frontend && npm ci && npm run build`
     - Output Directory: `frontend/dist`
   - **Environment Variables**: Expand the section and add the variables from `.env.example`:
     - `APP_ENV`: `prod`
     - `LOG_LEVEL`: `INFO`
     - `SNAPSHOT_DIR`: `backend/data/snapshot`
     - `DAY_AHEAD_CUTOFF_LOCAL`: `09:00`
     - `EVAL_WINDOW_FROM`: `2026-01-01`
     - `EVAL_WINDOW_TO`: `2026-01-31`
     - `WARMUP_START`: `2025-12-01`
     - `RISK_QUANTILE_DEFAULT`: `0.9`
     - `RISK_WINDOW_DAYS_DEFAULT`: `28`
4. **Deploy**:
   - Click **"Deploy"**.
   - Vercel will run the frontend build, bundle the Python serverless function with the included Parquet snapshot files in `lhr1` (London), and issue a production URL (e.g. `https://<project-name>.vercel.app`).
5. **Run Post-Deployment Smoke Verification**:
   From your local terminal, run the automated smoke test against the live URL:
   ```bash
   python scripts/smoke_deployed.py https://<your-project>.vercel.app
   ```
   This validates `/api/v1/health`, `/api/v1/meta`, headline metrics (`n=744, bias≈+1851.5, MAE≈2127.5`), day-ahead 2026-01-15, and all HTML deep-links.

## 3. Heroku fallback (container stack)
`heroku.yml` with `build: docker: web: backend/Dockerfile` (serve built frontend from FastAPI `StaticFiles` in that case, one dyno). Needs a paid dyno plan — prefer Vercel.

## 4. Verification checklist (before submitting)
- [ ] Run `python scripts/smoke_deployed.py <live-url>` — all 8 tests pass.
- [ ] Open live URL in an **incognito window**, logged out of everything — app loads, `/api/v1/meta` returns JSON.
- [ ] Deep links work on direct browser refresh: `/day-ahead?d=2026-01-15`, `/accuracy`, `/methodology`.
- [ ] No browser console errors; no mixed-content; fonts load correctly.
- [ ] Cold-start (first request after idle) responds cleanly; UI shows skeletons, not a blank page.
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
