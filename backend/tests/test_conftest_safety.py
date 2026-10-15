"""Regression test for the TEST_DATABASE_URL safety guard in conftest.py.

Incident: `TEST_DATABASE_URL` used to silently fall back to the ambient
`DATABASE_URL` (the real dev database inside the backend Docker container)
when not set explicitly, so `_db_schema`'s `Base.metadata.drop_all()` wiped
the real dev DB. `conftest._assert_test_database_url_is_safe` now fails loud
at import/collection time instead. This test exercises that guard function
directly (no DB connection needed, no subprocess) -- it does not depend on
`db_session`/`client`, so it still runs fine even when no Postgres is
reachable.
"""

from __future__ import annotations

import pytest

from tests.conftest import _assert_test_database_url_is_safe


@pytest.mark.parametrize(
    "url",
    [
        # The exact shape of the real incident: TEST_DATABASE_URL falling
        # back to the ambient docker-compose DATABASE_URL for the dev DB.
        "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker",
        "postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker",
        "postgresql+psycopg2://user:pass@neon-host/life_tracker_prod",
        "postgresql+psycopg2://user:pass@host/mydb",
    ],
)
def test_rejects_non_test_database_names(url: str) -> None:
    with pytest.raises(RuntimeError, match="does not have 'test' in its name"):
        _assert_test_database_url_is_safe(url)


@pytest.mark.parametrize(
    "url",
    [
        "postgresql+psycopg2://lifetracker:lifetracker@localhost:5432/life_tracker_test",
        "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker_test",
        # Case-insensitive match.
        "postgresql+psycopg2://user:pass@host/MyApp_TEST",
    ],
)
def test_accepts_test_database_names(url: str) -> None:
    _assert_test_database_url_is_safe(url)  # must not raise


def test_rejects_malformed_url() -> None:
    with pytest.raises(RuntimeError, match="not a valid database URL"):
        _assert_test_database_url_is_safe("not-a-valid-url")
