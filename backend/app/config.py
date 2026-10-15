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

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker"
    jwt_secret: str = "dev-only-change-me"
    jwt_expires_minutes: int = 60
    # Comma-separated list of allowed origins, e.g.
    # "http://localhost:5173,https://bihan.vercel.app"
    cors_origins: str = "http://localhost:5173"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore", case_sensitive=False)

    @property
    def cors_origins_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
