from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make sure `app`, `db`, `scoring` (the top-level packages that live directly
# under backend/) are importable regardless of the cwd alembic was invoked
# from -- mirrors the sys.path shim in backend/tests/scoring/conftest.py and
# backend/db/seed.py.
BACKEND_ROOT = Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.models import Base  # noqa: E402

# Alembic Config object, giving access to values within alembic.ini.
config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# target_metadata drives `alembic revision --autogenerate`.
target_metadata = Base.metadata


def get_url() -> str:
    """Single source of truth for the DB connection string: the DATABASE_URL
    env var (same one docker-compose.yml / .env.example set), not
    alembic.ini's sqlalchemy.url (left blank there on purpose).
    """
    return os.environ.get(
        "DATABASE_URL",
        "postgresql+psycopg2://lifetracker:lifetracker@db:5432/life_tracker",
    )


def run_migrations_offline() -> None:
    """Emit SQL to stdout without a live DB connection (`alembic upgrade head --sql`)."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live DB connection (the normal case)."""
    configuration = config.get_section(config.config_ini_section) or {}
    configuration["sqlalchemy.url"] = get_url()

    connectable = engine_from_config(
        configuration,
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
