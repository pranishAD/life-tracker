"""Shared FastAPI dependencies."""

from __future__ import annotations

import uuid

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.auth.security import decode_access_token
from app.errors import unauthorized
from app.models import User
from db.session import get_session

# auto_error=False so a missing Authorization header reaches our own handler
# (and the {"error": {...}} shape) instead of Starlette's default 403 body.
_bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
    db: Session = Depends(get_session),
) -> User:
    if credentials is None or not credentials.credentials:
        raise unauthorized("Missing bearer token.")

    payload = decode_access_token(credentials.credentials)
    subject = payload.get("sub")
    if not subject:
        raise unauthorized("Invalid authentication token.")

    try:
        user_id = uuid.UUID(str(subject))
    except ValueError as exc:
        raise unauthorized("Invalid authentication token.") from exc

    user = db.get(User, user_id)
    if user is None:
        raise unauthorized("User no longer exists.")

    return user
