"""Engine + session factory, shared by Alembic (`db/migrations/env.py`),
`db/seed.py`, and backend-dev's FastAPI app.

backend-dev: use `get_session` as a FastAPI dependency, e.g.

    from db.session import get_session

    @router.get("/goals")
    def list_goals(db: Session = Depends(get_session)):
        ...

`DATABASE_URL` comes from the environment (see .env.example / docker-compose.yml);
it already matches the `postgresql+psycopg2://...` form psycopg2 expects.
"""

from __future__ import annotations

import os
from typing import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker",
)
# No special-casing needed for Neon here: `create_engine` + psycopg2 accept the
# URL as-is, including a `?sslmode=require` query param and a `-pooler`
# (PgBouncer) hostname. Locally, docker-compose's plain URL (no sslmode) also
# passes through unchanged.

# Pooling: deployed backend runs as Vercel serverless functions, where each
# invocation can be a fresh, short-lived process and many instances can run
# concurrently. SQLAlchemy's default QueuePool holds a handful of persistent
# connections *per process*, which multiplies across cold-start instances and
# can blow past Neon free tier's connection cap. NullPool opens one DB
# connection per checkout and closes it when the session is returned/closed,
# so an idle or dead serverless instance never holds a connection open. The
# tradeoff is a new TCP+TLS+auth handshake on every request instead of reusing
# a warm connection — acceptable here because Neon's pooled (`-pooler`)
# endpoint is itself backed by PgBouncer, which keeps the handshake cheap and
# absorbs the connection churn. Locally (docker-compose, one long-lived
# backend process) this is slightly less efficient than QueuePool but not
# noticeable at dev traffic, so we use the same engine config everywhere
# rather than branching on environment.
#
# pool_pre_ping is a no-op with NullPool (every checkout is already a brand
# new connection, so there's nothing stale to ping) and is dropped to avoid
# an extra round trip per request.
#
# hide_parameters=True (SEC-003): DBAPI errors keep the SQL text in their
# message but drop the bound values, so a failed INSERT/UPDATE never writes
# password hashes, emails or journal text into logs via logger.exception().
engine = create_engine(
    DATABASE_URL, poolclass=NullPool, future=True, hide_parameters=True
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def get_session() -> Iterator[Session]:
    """FastAPI-dependency-shaped session generator: one session per request,
    always closed afterwards.
    """
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
