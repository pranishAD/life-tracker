"""Shared pytest fixtures for backend/tests/ (everything except
backend/tests/scoring/, which is pure-Python and owned by scoring-engine --
this conftest's DB-touching fixtures are request-only, not autouse, so
`pytest backend/tests/scoring` still runs with zero DB/network dependency.

Uses a REAL Postgres database (not mocks): each test runs inside its own
outer transaction that is rolled back afterwards, so tests are isolated from
each other but still exercise the actual SQLAlchemy models / constraints /
case-insensitive unique index, etc.

Connection target: `TEST_DATABASE_URL` env var if set, else `DATABASE_URL`
with a few env vars for JWT secrets etc seeded with safe test defaults (same
approach the CI workflow uses -- see .github/workflows/ci.yml). Defaults to
the docker-compose `db` service's host-mapped port with a separate
`life_tracker_test` database so running tests never touches the dev
`life_tracker` database.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Iterator

import pytest

# Make `app`, `db`, `scoring` importable regardless of invocation cwd, same
# shim pattern as backend/tests/scoring/conftest.py, backend/db/seed.py and
# backend/db/migrations/env.py.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

os.environ.setdefault(
    "DATABASE_URL",
    os.environ.get(
        "TEST_DATABASE_URL",
        "postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker_test",
    ),
)
os.environ.setdefault("JWT_SECRET", "test-only-secret")
os.environ.setdefault("JWT_EXPIRES_MINUTES", "60")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", os.environ["DATABASE_URL"])

from sqlalchemy import create_engine, event  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app.main import create_app  # noqa: E402
from app.models import Base, User  # noqa: E402
from app.auth.security import hash_password  # noqa: E402
from db.session import get_session  # noqa: E402

_engine = create_engine(TEST_DATABASE_URL, future=True)


@pytest.fixture(scope="session")
def _db_schema() -> Iterator[None]:
    """Create every table once per test session, drop them at the end.

    Only ever invoked (transitively) by tests that request `db_session` or
    `client` -- scoring tests never touch this fixture, so they never need a
    database connection at all.
    """
    Base.metadata.drop_all(_engine)
    Base.metadata.create_all(_engine)
    yield
    Base.metadata.drop_all(_engine)


@pytest.fixture()
def db_session(_db_schema: None) -> Iterator[Session]:
    """One connection + outer transaction per test, rolled back afterwards.

    The session is wrapped with a SAVEPOINT so that application code calling
    `session.commit()` (as the real route handlers do) only ends the
    SAVEPOINT, not the outer transaction -- the whole test's writes are still
    undone by the final rollback. Standard SQLAlchemy "join a session into an
    external transaction" recipe.
    """
    connection = _engine.connect()
    outer_transaction = connection.begin()
    session = Session(bind=connection, autoflush=False, autocommit=False, future=True)
    nested = connection.begin_nested()

    @event.listens_for(session, "after_transaction_end")
    def _restart_savepoint(sess: Session, trans) -> None:  # noqa: ANN001
        nonlocal nested
        if not nested.is_active:
            nested = connection.begin_nested()

    try:
        yield session
    finally:
        session.close()
        outer_transaction.rollback()
        connection.close()


@pytest.fixture()
def client(db_session: Session) -> Iterator[TestClient]:
    """A TestClient whose `get_session` dependency is overridden to reuse the
    test's own transactional session, so requests made through it see/share
    data with anything the test set up directly via `db_session`.
    """
    app = create_app()

    def _override_get_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_session] = _override_get_session

    with TestClient(app) as test_client:
        yield test_client

    app.dependency_overrides.clear()


@pytest.fixture()
def make_user(db_session: Session):
    """Factory fixture: create+flush a user with a known plaintext password,
    for tests that need an already-registered account (login tests, /me
    tests, cross-user 404 tests).
    """

    def _make_user(
        *,
        name: str = "Test User",
        email: str = "user@example.com",
        password: str = "password123",
    ) -> User:
        user = User(name=name, email=email, password_hash=hash_password(password))
        db_session.add(user)
        db_session.commit()
        db_session.refresh(user)
        return user

    return _make_user


@pytest.fixture()
def make_goal(db_session: Session):
    """Factory fixture: create+flush a goal for a given user with sane
    defaults per type, so individual tests only need to override what they
    actually care about.
    """
    from datetime import date
    from decimal import Decimal

    from app.models import Category, Goal, GoalStatus, GoalType

    def _make_goal(
        *,
        user_id: uuid.UUID,
        title: str = "Test goal",
        category: Category = Category.FITNESS,
        type: GoalType = GoalType.NUMERIC,
        target_value: "Decimal | None" = Decimal("100"),
        current_value: "Decimal | None" = Decimal("0"),
        unit: str | None = "kg",
        frequency_per_week: int | None = None,
        start_date: "date | None" = None,
        deadline: "date | None" = None,
        weight: Decimal = Decimal("1"),
        status: GoalStatus = GoalStatus.ACTIVE,
        created_at: "object | None" = None,
    ) -> Goal:
        if type == GoalType.HABIT and frequency_per_week is None:
            frequency_per_week = 5
        if type != GoalType.NUMERIC:
            target_value = None
            current_value = None
            unit = None

        goal = Goal(
            user_id=user_id,
            title=title,
            category=category,
            type=type,
            target_value=target_value,
            current_value=current_value,
            unit=unit,
            frequency_per_week=frequency_per_week,
            start_date=start_date or date.today(),
            deadline=deadline,
            weight=weight,
            status=status,
        )
        db_session.add(goal)
        db_session.commit()
        db_session.refresh(goal)
        if created_at is not None:
            goal.created_at = created_at
            db_session.commit()
            db_session.refresh(goal)
        return goal

    return _make_goal


@pytest.fixture()
def auth_headers():
    """Factory fixture: Authorization header dict for a given user id, using
    the app's own token creation so tests don't duplicate JWT internals.
    """
    from app.auth.security import create_access_token

    def _auth_headers(user_id: uuid.UUID) -> dict[str, str]:
        token = create_access_token(str(user_id))
        return {"Authorization": f"Bearer {token}"}

    return _auth_headers
