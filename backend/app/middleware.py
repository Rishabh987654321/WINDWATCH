"""Middleware for caching, ETag, security headers, and clean JSON rendering."""

import hashlib
import math
from typing import Any

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.data.store import store


def sanitize_nan_inf(obj: Any) -> Any:
    """Recursively replace NaN and Infinite floats with None (JSON null).

    Never emit NaN/Infinity in JSON responses per AGENTS.md rule 7.
    """
    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    elif isinstance(obj, dict):
        return {k: sanitize_nan_inf(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [sanitize_nan_inf(v) for v in obj]
    return obj


class CleanJSONResponse(JSONResponse):
    """JSONResponse that serializes NaN and Infinity as null."""

    def render(self, content: Any) -> bytes:
        return super().render(sanitize_nan_inf(content))


class CacheAndSecurityMiddleware(BaseHTTPMiddleware):
    """Adds security headers, ETag generation, Cache-Control, and 304 handling."""

    async def dispatch(self, request: Request, call_next) -> Response:
        path = request.url.path
        is_get = request.method in ("GET", "HEAD")
        is_data_api = path.startswith("/api/v1/") and not path.endswith(("/health", "/ready"))

        # Calculate ETag for ready data endpoints
        etag: str | None = None
        if is_get and is_data_api and store.is_ready and store.snapshot_id:
            # Canonicalize query params: sorted key=value pairs
            canonical_query = "&".join(
                f"{k}={v}" for k, v in sorted(request.query_params.multi_items())
            )
            canonical_url = f"{path}?{canonical_query}" if canonical_query else path
            etag_raw = f"{store.snapshot_id}:{canonical_url}"
            etag = f'"{hashlib.sha256(etag_raw.encode("utf-8")).hexdigest()[:16]}"'

            # Check If-None-Match
            inbound_etag = request.headers.get("if-none-match")
            if inbound_etag:
                clean_inbound = inbound_etag.strip()
                if clean_inbound.startswith("W/"):
                    clean_inbound = clean_inbound[2:].strip()
                clean_inbound = clean_inbound.strip('"')

                if clean_inbound == etag.strip('"'):
                    headers = {
                        "ETag": etag,
                        "Cache-Control": "public, max-age=300",
                        "X-Content-Type-Options": "nosniff",
                        "Referrer-Policy": "strict-origin-when-cross-origin",
                        "X-Frame-Options": "DENY",
                    }
                    req_id = getattr(request.state, "request_id", None)
                    if req_id:
                        headers["X-Request-ID"] = req_id
                    return Response(status_code=304, headers=headers)

        response: Response = await call_next(request)

        # Apply security headers to all responses
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        response.headers.setdefault("X-Frame-Options", "DENY")

        # Apply Cache-Control & ETag to successful GET data API responses
        if is_get and response.status_code == 200:
            if is_data_api and etag:
                response.headers["ETag"] = etag
                response.headers["Cache-Control"] = "public, max-age=300"
            elif path.endswith(("/health", "/ready")):
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"

        return response
