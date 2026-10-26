"""Structured logging configuration using structlog."""

import logging
import sys
import time
import uuid

import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware


def setup_logging(log_level: str = "INFO") -> None:
    """Configure structlog for standard JSON output."""
    level = getattr(logging, log_level.upper(), logging.INFO)
    logging.basicConfig(format="%(message)s", stream=sys.stdout, level=level)

    structlog.configure(
        processors=[
            structlog.contextvars.merge_contextvars,
            structlog.processors.add_log_level,
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.JSONRenderer(),
        ],
        wrapper_class=structlog.make_filtering_bound_logger(level),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


logger = structlog.get_logger("windwatch")


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware assigning request ID and logging structured request metadata."""

    async def dispatch(self, request: Request, call_next) -> Response:
        # Accept inbound X-Request-ID or generate UUIDv4
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        request.state.request_id = req_id

        t0 = time.perf_counter()
        response: Response
        status_code = 500
        try:
            response = await call_next(request)
            status_code = response.status_code
        except Exception:
            latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
            logger.error(
                "request_failed",
                route=request.url.path,
                method=request.method,
                status=500,
                latency_ms=latency_ms,
                request_id=req_id,
            )
            raise

        latency_ms = round((time.perf_counter() - t0) * 1000.0, 2)
        response.headers["X-Request-ID"] = req_id
        response.headers["X-Process-Time"] = str(latency_ms)

        # Attach snapshot_id to log if available
        from app.data.store import store

        snapshot_id = store.snapshot_id if store.is_ready else None

        logger.info(
            "request_completed",
            route=request.url.path,
            method=request.method,
            status=status_code,
            latency_ms=latency_ms,
            request_id=req_id,
            snapshot_id=snapshot_id,
        )
        return response
