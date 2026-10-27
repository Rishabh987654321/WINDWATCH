"""WindWatch FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_v1_router
from app.api.v1.system import router as system_router
from app.config import settings
from app.data.store import store
from app.errors import register_error_handlers
from app.logging import RequestLoggingMiddleware, setup_logging
from app.middleware import CacheAndSecurityMiddleware, CleanJSONResponse


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Lifespan context manager loading snapshot into memory at startup."""
    setup_logging(settings.log_level)
    snapshot_path = settings.resolved_snapshot_dir()
    store.load(snapshot_path)
    app.state.store = store
    yield


app = FastAPI(
    title="WindWatch API",
    version=settings.app_version,
    description="UK Wind forecast and actuals analysis API (Phase 3)",
    docs_url="/api/docs",
    openapi_url="/api/openapi.json",
    default_response_class=CleanJSONResponse,
    lifespan=lifespan,
)

# Register RFC 7807 problem+json error handlers
register_error_handlers(app)

# Cache, ETag, security headers, and request logging middleware
app.add_middleware(CacheAndSecurityMiddleware)
app.add_middleware(RequestLoggingMiddleware)

# Enable CORS only if configured
if settings.cors_origins:
    origins = list(settings.cors_origins) if isinstance(settings.cors_origins, list) else [settings.cors_origins]
    app.add_middleware(
        CORSMiddleware,
        allow_origins=origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

# Mount API v1 router
app.include_router(api_v1_router)

# Mount root health/readiness convenience probes
app.include_router(system_router)
