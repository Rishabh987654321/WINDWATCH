"""RFC 7807 problem+json error handlers."""

from typing import Any

import structlog
from fastapi import FastAPI, HTTPException, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.data.store import StoreNotReadyError
from app.middleware import CleanJSONResponse

logger = structlog.get_logger("windwatch.errors")

PROBLEM_MEDIA_TYPE = "application/problem+json"


def get_request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "unknown")


def problem_response(
    status: int,
    title: str,
    detail: str,
    instance: str,
    request_id: str,
    error_type: str = "about:blank",
    extra: dict[str, Any] | None = None,
) -> JSONResponse:
    content: dict[str, Any] = {
        "type": error_type,
        "title": title,
        "status": status,
        "detail": detail,
        "instance": instance,
        "request_id": request_id,
    }
    if extra:
        content.update(extra)

    return CleanJSONResponse(
        status_code=status,
        content=content,
        media_type=PROBLEM_MEDIA_TYPE,
        headers={"X-Request-ID": request_id},
    )


async def validation_exception_handler(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    req_id = get_request_id(request)
    raw_errors = exc.errors()
    # Format readable detail message
    details = []
    for err in raw_errors:
        loc = " -> ".join(str(x) for x in err.get("loc", []))
        msg = err.get("msg", "Validation failed")
        details.append(f"{loc}: {msg}")
    detail_str = "; ".join(details)

    logger.warning(
        "validation_error",
        route=request.url.path,
        detail=detail_str,
        request_id=req_id,
    )

    encoded_errors = jsonable_encoder(raw_errors)

    return problem_response(
        status=422,
        title="Invalid parameter",
        detail=detail_str,
        instance=request.url.path,
        request_id=req_id,
        error_type="https://windwatch/errors/validation",
        extra={"validation_errors": encoded_errors},
    )


async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    req_id = get_request_id(request)
    titles = {
        400: "Bad request",
        404: "Resource not found",
        422: "Unprocessable entity",
        503: "Service unavailable",
    }
    title = titles.get(exc.status_code, "HTTP error")
    detail = str(exc.detail) if exc.detail else title

    logger.warning(
        "http_error",
        status=exc.status_code,
        route=request.url.path,
        detail=detail,
        request_id=req_id,
    )

    error_type = f"https://windwatch/errors/{exc.status_code}"
    return problem_response(
        status=exc.status_code,
        title=title,
        detail=detail,
        instance=request.url.path,
        request_id=req_id,
        error_type=error_type,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    req_id = get_request_id(request)
    logger.exception(
        "unhandled_server_error",
        route=request.url.path,
        error=str(exc),
        request_id=req_id,
    )
    return problem_response(
        status=500,
        title="Internal server error",
        detail="An unexpected error occurred. Please quote the request_id to support.",
        instance=request.url.path,
        request_id=req_id,
        error_type="https://windwatch/errors/server-error",
    )


async def store_not_ready_handler(request: Request, exc: StoreNotReadyError) -> JSONResponse:
    req_id = get_request_id(request)
    logger.error("store_not_ready", route=request.url.path, error=str(exc), request_id=req_id)
    return problem_response(
        status=503,
        title="Service unavailable",
        detail=str(exc),
        instance=request.url.path,
        request_id=req_id,
        error_type="https://windwatch/errors/service-unavailable",
    )


def register_error_handlers(app: FastAPI) -> None:
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore
    app.add_exception_handler(StoreNotReadyError, store_not_ready_handler)  # type: ignore
    app.add_exception_handler(HTTPException, http_exception_handler)  # type: ignore
    app.add_exception_handler(Exception, unhandled_exception_handler)
