"""App settings, read from environment variables (see docker-compose.yml /
.env.example for the canonical list: DATABASE_URL, JWT_SECRET,
JWT_EXPIRES_MINUTES, CORS_ORIGINS).

Note: `db/session.py` reads DATABASE_URL itself for the SQLAlchemy engine
(single source of truth for the DB connection, shared with Alembic/seed) --
this module does NOT re-read DATABASE_URL for anything other than exposing it
for completeness; always get your DB session via `db.session.get_session`.

Deploy note (frontend on Vercel, backend as a second Vercel project,
DB on Neon): this module holds no mutable module-level state beyond the
`lru_cache`d Settings instance itself (plain config, safe to recompute on a
cold start), so it's fine as-is for a short-lived serverless function.
"""

from __future__ import annotations

import os
from functools import lru_cache

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# The repo's public dev default (also in docker-compose.yml / .env.example).
DEV_JWT_SECRET = "dev-only-change-me"

# Minimum JWT_SECRET length accepted in production (Vercel). The .env.example
# recipe, `secrets.token_urlsafe(48)`, yields 64 chars.
MIN_PROD_JWT_SECRET_LENGTH = 32

# Values that must never be used as JWT_SECRET in production, compared
# case-insensitively after stripping whitespace (SEC-002).
_INSECURE_JWT_SECRETS = frozenset(
    {
        "",
        DEV_JWT_SECRET,
        "changeme",
        "change-me",
        "change_me",
        "secret",
        "jwt_secret",
        "jwt-secret",
        "your-secret-key",
        "ci-test-secret",
    }
)


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker"
    jwt_secret: str = DEV_JWT_SECRET
    jwt_expires_minutes: int = 60
    # Comma-separated list of allowed origins, e.g.
    # "http://localhost:5173,https://bihan.vercel.app"
    cors_origins: str = "http://localhost:5173"
    # Shared secret for GET /internal/daily-snapshot (Vercel Cron). Empty by
    # default (local dev never runs the cron) -- an empty secret means the
    # endpoint always rejects requests (see app/routers/internal.py), it is
    # never treated as "no auth required".
    cron_secret: str = ""

    # hide_input_in_errors: a failed validation must never echo the raw
    # settings (JWT_SECRET, DATABASE_URL, CRON_SECRET) into logs/tracebacks.
    model_config = SettingsConfigDict(
        env_file=".env", extra="ignore", case_sensitive=False, hide_input_in_errors=True
    )

    @model_validator(mode="after")
    def _refuse_weak_jwt_secret_in_prod(self) -> "Settings":
        """SEC-002: fail closed on Vercel. Vercel sets VERCEL=1 at runtime;
        local dev / docker / tests don't, so the dev default keeps working
        there. Never include the secret value in the error message."""
        if os.environ.get("VERCEL") == "1":
            secret = self.jwt_secret or ""
            if (
                secret.strip().lower() in _INSECURE_JWT_SECRETS
                or len(secret) < MIN_PROD_JWT_SECRET_LENGTH
            ):
                raise ValueError(
                    "JWT_SECRET is missing, a known placeholder, or shorter than "
                    f"{MIN_PROD_JWT_SECRET_LENGTH} characters; refusing to start on Vercel. "
                    "Set a long random JWT_SECRET in the Vercel project env vars."
                )
        return self

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
