# ARCHITECTURE.md

## 1. Product in one line
**WindWatch** — a Neo-Brutalist web portal that shows a UK utility's day-ahead buyers the wind forecast *as it stood when they had to decide*, and puts hard numbers on how wrong those forecasts tend to be.

## 2. Context diagram

```
┌──────────────┐   ingest CLI (offline, idempotent)   ┌────────────────────────┐
│ Elexon BMRS  │ ───────────────────────────────────▶ │ Snapshot (Parquet +    │
│ FUELHH,      │   httpx async, chunked, retries      │ manifest.json) in repo │
│ WINDFOR      │                                      └───────────┬────────────┘
└──────────────┘                                                  │ loaded at startup
                                                                  ▼
┌──────────────┐   HTTPS / JSON   ┌──────────────────────────────────────────────┐
│ React 19 SPA │ ───────────────▶ │ FastAPI (async)                               │
│ Vite + TS    │ ◀─────────────── │  routes → services → domain (pure) → DataStore│
│ ECharts      │   /api/v1/*      │  pandas/numpy in-memory frames                │
└──────────────┘                  └──────────────────────────────────────────────┘
```

**Key idea:** the *domain layer is pure* (functions over DataFrames/arrays, no I/O, no FastAPI). That's where the rigour lives and where nearly all tests go.

## 3. Tech stack & why

| Layer | Choice | Reason (and what the reviewer should hear) |
|---|---|---|
| Frontend | React 19, Vite, **TypeScript strict** | Brief demands strong React; TS catches contract drift |
| State | **Zustand** (UI/filter state, URL-synced) + **TanStack Query** (server state) | Clear split: server cache vs. client state; shareable URLs |
| Charts | **Apache ECharts** (canvas renderer) | Handles zoom/brush/linked charts/heatmaps at 60 fps; canvas fits "rich interactive UI" nice-to-have |
| Styling | **Tailwind CSS v4** + CSS variables (design tokens) | Fast to hit Neo-Brutalism (hard borders/shadows) consistently — see DESIGN.md |
| Backend | **FastAPI** + Pydantic v2, async, Python 3.12 | Brief demands FastAPI/async; typed contracts; auto OpenAPI |
| HTTP client | **httpx.AsyncClient** | async ingestion with retry/backoff |
| Numerics | **pandas + numpy** (pyarrow for Parquet) | Scientific-computing nice-to-have; vectorised selection and metrics |
| Storage | **Frozen Parquet snapshot** loaded in memory | Data is a closed month (~100k rows). A DB would be ceremony; snapshot gives determinism + zero runtime dependency on Elexon. ADR-001 |
| Lint/type | ruff, mypy (strict-ish) / eslint, tsc | "Engineering discipline" |
| Tests | pytest (+hypothesis), httpx ASGI client / Vitest, Testing Library, Playwright smoke | "Real rigour" |
| Logging | structlog JSON + request-id middleware | Observability |
| Packaging | **Docker** (multi-stage) + docker-compose | Brief requires Docker |
| Deploy | **Vercel** (primary) — see DEPLOYMENT.md | Brief requires Vercel or Heroku |
| CI | GitHub Actions | lint → type → test → build → docker build |

## 4. Repository layout (target)

```
/
├─ README.md                     # required: file map, how to run, live link, AI-use disclosure
├─ AGENTS.md                     # rules for the AI coder (read first)
├─ docker-compose.yml
├─ Makefile                      # make dev | test | lint | ingest | docker-up
├─ vercel.json
├─ .env.example
├─ .github/workflows/ci.yml
├─ api/index.py                  # Vercel serverless entry → imports backend.app.main:app
├─ scripts/probe_elexon.py       # Phase-0 API probe
├─ docs/                         # these documents
├─ backend/
│  ├─ pyproject.toml
│  ├─ Dockerfile
│  ├─ app/
│  │  ├─ main.py                 # app factory, lifespan loads DataStore, middleware, routers
│  │  ├─ config.py               # pydantic-settings
│  │  ├─ logging.py              # structlog setup + request-id middleware
│  │  ├─ errors.py               # problem+json handlers
│  │  ├─ api/v1/                 # routers only: parse → call service → return schema
│  │  │   meta.py series.py day_ahead.py metrics.py vintages.py
│  │  ├─ schemas/                # Pydantic request/response models (match API.md)
│  │  ├─ services/               # orchestration: query params → domain calls → schemas
│  │  ├─ domain/                 # PURE logic (no I/O)
│  │  │   timeutil.py selection.py metrics.py risk.py quality.py
│  │  ├─ data/
│  │  │   store.py               # DataStore: load snapshot, expose frames + indexes
│  │  └─ ingest/
│  │      elexon_client.py normalize.py cli.py
│  ├─ data/snapshot/             # actuals.parquet forecasts.parquet manifest.json
│  └─ tests/{unit,api,fixtures}/
└─ frontend/
   ├─ package.json vite.config.ts tsconfig.json Dockerfile nginx.conf
   └─ src/
      ├─ main.tsx App.tsx routes.tsx
      ├─ api/                    # generated types + typed fetch client + query hooks
      ├─ store/                  # zustand: filters (range, policy, horizon, cutoff, quantile)
      ├─ features/
      │   ├─ overview/           # KPI strip + actual-vs-forecast chart
      │   ├─ day-ahead/          # decision view (headline)
      │   ├─ accuracy-lab/       # by-horizon, distribution, by-hour, by-level, heatmap, vintages
      │   └─ methodology/
      ├─ components/ui/          # NB primitives: Button, Card, Badge, Slider, Tabs, Stat, Marquee…
      ├─ charts/                 # ECharts wrappers + windwatch theme (also aliased from components/charts)
      ├─ lib/                    # formatters, date utils, url-state
      ├─ tokens.css              # Neo-Brutalist design tokens (root styles)
      └─ index.css               # Base layout, typography imports, and utilities
```

## 5. Backend layering rules
1. **routers** do only: validate (via schema types) → call a service → return. No pandas here.
2. **services** translate request models into domain calls and domain results into response schemas. May use the `DataStore`.
3. **domain** is pure and deterministic. Inputs/outputs are DataFrames/ndarrays/dataclasses. 100% unit-tested.
4. **data/store** owns the in-memory frames and precomputed indexes. Single instance created in FastAPI `lifespan`, injected via `Depends`.
5. **ingest** is a separate CLI entry (`python -m app.ingest.cli`). The API process never calls Elexon at request time.
6. Dependency direction: `api → services → domain`, `services → data`, `ingest → domain.quality`. **Domain imports nothing from FastAPI, Pydantic settings or the store.**

## 6. Frontend architecture rules
1. **Server state in TanStack Query only.** Query keys derived from the filter object. `placeholderData: keepPreviousData` so charts never blank while the slider moves.
2. **Zustand holds UI/filter state only**, and syncs to the URL (`?from=&to=&policy=&h=&cutoff=&q=`), so any view is a shareable link (great for the demo).
3. **Feature folders** own their components, hooks and tests. Shared primitives live in `components/ui`.
4. **Charts are dumb**: they take typed props and an options builder (pure function, unit-testable). No fetching inside chart components.
5. **Performance**: debounce the horizon slider (150 ms) and use `useDeferredValue`; memoise ECharts option objects; `echarts.connect` for linked zoom; lazy-load the Accuracy Lab route (`React.lazy`).
6. **Accessibility**: Neo-Brutalism must still meet WCAG AA contrast; focus rings are thick and visible; charts have text summaries / data table toggle.
7. Types for API responses are **generated** from the backend OpenAPI — never hand-written.

## 7. Cross-cutting concerns
- **Observability**: JSON logs with `request_id`, route, status, latency_ms, `snapshot_id`; `/health`, `/ready`; ingestion logs per chunk (rows, retries). Optional: `/metrics` Prometheus endpoint.
- **Config**: 12-factor via env (`.env.example` lists all). No secrets are required for the public Elexon API.
- **Security**: CORS allow-list (only needed if FE and API are on different origins), no write endpoints in prod (admin refresh off by default), input bounds on every param, security headers via middleware.
- **Reproducibility**: manifest with checksums; `make ingest` regenerates snapshot; CI verifies the snapshot's checksum matches the manifest.
- **Docs-as-code**: ADRs in `docs/DECISIONS.md`; API contract in `docs/API.md`; any PR that changes behaviour updates the relevant doc.

## 8. Non-goals (say them out loud in the review video)
No auth, no multi-user state, no demand/price data, no other fuels, no regional breakdown, no live Elexon calls in production. Stretch items (LLM insight summaries, level-conditional risk bands, Celery/Ray ingestion) are listed in PHASES.md and are **explicitly not v1**.
