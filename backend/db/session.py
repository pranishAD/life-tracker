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

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker",
)

# pool_pre_ping avoids handing out dead connections after the db container
# restarts/reconnects (e.g. after `docker compose restart db`).
engine = create_engine(DATABASE_URL, pool_pre_ping=True, future=True)

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
