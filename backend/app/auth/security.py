"""Password hashing + JWT helpers.

Uses passlib's bcrypt scheme exactly the way `db/seed.py` hashes the demo
users' passwords (`CryptContext(schemes=["bcrypt"], deprecated="auto")`), so
login verifies correctly against the seeded hashes. See requirements.txt for
why `bcrypt` itself is pinned to 4.0.1 (passlib 1.7.4 compatibility).

Stateless by design (no module-level mutable state besides the CryptContext,
which holds no per-request data) -- safe to import from a short-lived
serverless function.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

import jwt
from passlib.context import CryptContext

from app.config import get_settings
from app.errors import unauthorized

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(raw_password: str) -> str:
    return pwd_context.hash(raw_password)


def verify_password(raw_password: str, password_hash: str) -> bool:
    return pwd_context.verify(raw_password, password_hash)


def create_access_token(subject: str) -> str:
    settings = get_settings()
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(minutes=settings.jwt_expires_minutes)
    payload: dict[str, Any] = {"sub": subject, "iat": int(now.timestamp()), "exp": expires_at}
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    """Decode + validate a bearer token. Raises `AppError(401, ...)` (via
    `app.errors.unauthorized`) on any failure -- expired, malformed, wrong
    signature -- so callers never need their own try/except.
    """
    settings = get_settings()
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise unauthorized("Token has expired.") from exc
    except jwt.InvalidTokenError as exc:
        raise unauthorized("Invalid authentication token.") from exc
