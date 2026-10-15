"""Shared pytest fixtures for backend/tests/ (everything except
backend/tests/scoring/, which is pure-Python and owned by scoring-engine --
this conftest's DB-touching fixtures are request-only, not autouse, so
`pytest backend/tests/scoring` still runs with zero DB/network dependency.

Uses a REAL Postgres database (not mocks): each test runs inside its own
outer transaction that is rolled back afterwards, so tests are isolated from
each other but still exercise the actual SQLAlchemy models / constraints /
case-insensitive unique index, etc.

SAFETY: `_db_schema` below runs `Base.metadata.drop_all()` + `create_all()`
(and `drop_all()` again at teardown) against whatever `TEST_DATABASE_URL`
resolves to. An earlier version of this file resolved that target as
`TEST_DATABASE_URL` env var if set, else the ambient `DATABASE_URL`. Inside
the `backend` Docker service `DATABASE_URL` is *always* set (docker-compose
points it at the real dev `life_tracker` database), so running pytest in that
container without explicitly exporting `TEST_DATABASE_URL` silently dropped
every table in the real dev database -- this is exactly what happened once
and wiped `life_tracker` down to a bare `alembic_version` table. To make that
impossible to repeat silently:

- `TEST_DATABASE_URL` is never derived from the ambient `DATABASE_URL`. If
  unset, it falls back to a hardcoded, safe-by-construction default
  (`life_tracker_test` on localhost) -- never to whatever `DATABASE_URL`
  happens to be.
- Whatever URL it resolves to (explicit or default) is validated at import
  time, below, before `_engine`/`_db_schema` exist: the database name must
  contain "test" (case-insensitive) or we raise `RuntimeError` immediately,
  failing test collection rather than risking a `drop_all()` against the
  wrong database.
- `DATABASE_URL` is then set *from* the validated `TEST_DATABASE_URL` (safe
  direction: a known-safe test URL overwrites whatever `DATABASE_URL` was),
  never the other way around.

Whoever runs pytest against a real Postgres (locally or via
`docker compose exec backend pytest`) MUST export `TEST_DATABASE_URL`
explicitly to a URL whose database name contains "test", e.g.:

    TEST_DATABASE_URL=postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker_test \\
        pytest backend/tests -q

    docker compose exec -e TEST_DATABASE_URL=postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker_test \\
        backend pytest tests -q

Relying on the hardcoded default is fine too (it already contains "test"),
but never rely on `DATABASE_URL` alone -- it is not validated here and, in
every real deployment of this repo, points at a non-test database.
"""

from __future__ import annotations

import os
import sys
import uuid
from pathlib import Path
from typing import Iterator

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.engine import make_url
from sqlalchemy.orm import Session
from fastapi.testclient import TestClient

# Make `app`, `db`, `scoring` importable regardless of invocation cwd, same
# shim pattern as backend/tests/scoring/conftest.py, backend/db/seed.py and
# backend/db/migrations/env.py.
BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

_DEFAULT_TEST_DATABASE_URL = (
    "postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker_test"
)


def _assert_test_database_url_is_safe(url: str) -> None:
    """Fail loud and immediately (at collection time, not inside a fixture)
    if `url` doesn't look like a dedicated test database.

    This is the guard against the incident described in the module docstring:
    a `TEST_DATABASE_URL` that silently resolves to a real/dev database would
    otherwise only surface as data loss, after the fact, inside
    `_db_schema`'s `drop_all()`.
    """
    try:
        database_name = make_url(url).database or ""
    except Exception as exc:  # pragma: no cover - malformed URL is obvious misuse
        raise RuntimeError(
            f"TEST_DATABASE_URL is not a valid database URL: {url!r} ({exc})"
        ) from exc

    if "test" not in database_name.lower():
        raise RuntimeError(
            "Refusing to run DB-backed tests: the resolved test database "
            f"({database_name!r}, from {url!r}) does not have 'test' in its "
            "name. This check exists because TEST_DATABASE_URL silently "
            "falling back to the ambient DATABASE_URL once wiped the real "
            "dev database via Base.metadata.drop_all(). Set TEST_DATABASE_URL "
            "explicitly to a database whose name contains 'test', e.g. "
            "postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker_test "
            "-- see this file's module docstring."
        )


# Never derive this from the ambient DATABASE_URL -- see module docstring.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL", _DEFAULT_TEST_DATABASE_URL)
_assert_test_database_url_is_safe(TEST_DATABASE_URL)

# Safe direction only: a validated-safe test URL overwrites DATABASE_URL, so
# anything in the app that happens to read DATABASE_URL during a test run
# (e.g. app/config.py's Settings) sees the test database too, not whatever
# DATABASE_URL was set to by the ambient environment (e.g. docker-compose's
# real dev DB inside the backend container).
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("JWT_SECRET", "test-only-secret")
os.environ.setdefault("JWT_EXPIRES_MINUTES", "60")
os.environ.setdefault("CORS_ORIGINS", "http://localhost:5173")

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
