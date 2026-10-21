"""Error handling: every error response, for every route, is shaped exactly
like docs/api-contract.yaml's ErrorResponse: {"error": {"code", "message"}}.

Routers should raise `AppError` (via the `unauthorized`/`not_found`/
`conflict`/`validation_error` helpers below) instead of FastAPI's
`HTTPException` directly, so the response body always matches the contract.
A plain `HTTPException` raised by FastAPI/Starlette itself (e.g. from path
parameter parsing) is still caught and reshaped by the handler registered
here, as a safety net.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

logger = logging.getLogger("app.errors")


class AppError(Exception):
    """Raise this from route handlers / services for any expected error
    condition (auth failure, not found, conflict, bad input, ...).
    """

    def __init__(self, status_code: int, code: str, message: str) -> None:
        self.status_code = status_code
        self.code = code
        self.message = message
        super().__init__(message)


def unauthorized(message: str = "Missing or invalid credentials.") -> AppError:
    return AppError(401, "UNAUTHORIZED", message)


def forbidden(message: str = "You do not have access to this resource.") -> AppError:
    return AppError(403, "FORBIDDEN", message)


def not_found(message: str = "Resource not found.") -> AppError:
    return AppError(404, "NOT_FOUND", message)


def conflict(code: str, message: str) -> AppError:
    return AppError(409, code, message)


def validation_error(message: str) -> AppError:
    return AppError(422, "VALIDATION_ERROR", message)


def bad_request(code: str, message: str) -> AppError:
    return AppError(400, code, message)


_CODE_BY_STATUS = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    422: "VALIDATION_ERROR",
}


# SEC-016: added to every API response (see `create_app` in app/main.py).
# Applied with setdefault there, so a route or Vercel can still override.
SECURITY_HEADERS = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


def _error_body(code: str, message: str) -> dict:
    return {"error": {"code": code, "message": message}}


def _format_validation_message(exc: RequestValidationError) -> str:
    errors = exc.errors()
    if not errors:
        return "Validation failed."
    first = errors[0]
    loc = ".".join(str(part) for part in first.get("loc", []) if part != "body")
    msg = first.get("msg", "Invalid value")
    return f"{loc}: {msg}" if loc else msg


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        return JSONResponse(status_code=exc.status_code, content=_error_body(exc.code, exc.message))

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        return JSONResponse(
            status_code=422,
            content=_error_body("VALIDATION_ERROR", _format_validation_message(exc)),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_exception(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _CODE_BY_STATUS.get(exc.status_code, "ERROR")
        message = exc.detail if isinstance(exc.detail, str) else str(exc.detail)
        return JSONResponse(status_code=exc.status_code, content=_error_body(code, message))

    @app.exception_handler(Exception)
    async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unhandled exception while processing request")
        return JSONResponse(
            status_code=500,
            content=_error_body("INTERNAL_ERROR", "An unexpected error occurred."),
            # This handler runs in Starlette's outermost ServerErrorMiddleware,
            # i.e. outside the security-headers middleware, so set them here.
            headers=SECURITY_HEADERS,
        )
