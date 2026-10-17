"""Add journal_entries (Journal feature).

One row per free-form journal entry, owned by a user (ON DELETE CASCADE
from users). Not used by scoring.

Like 0001, this migration does NOT import backend/app/models -- it's a
frozen, replayable snapshot of the table as of this revision.

Revision ID: 0002_journal_entries
Revises: 0001_initial_schema
Create Date: 2026-10-17
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0002_journal_entries"
down_revision: Union[str, None] = "0001_initial_schema"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "journal_entries",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=120), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("mood", sa.SmallInteger(), nullable=True),
        sa.Column(
            "tags",
            postgresql.ARRAY(sa.Text()),
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "mood IS NULL OR mood BETWEEN 1 AND 5", name="ck_journal_entries_mood_range"
        ),
    )
    # Journal list/timeline query: one user's entries ordered by created_at.
    op.create_index(
        "ix_journal_entries_user_id_created_at",
        "journal_entries",
        ["user_id", "created_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_journal_entries_user_id_created_at", table_name="journal_entries")
    op.drop_table("journal_entries")
