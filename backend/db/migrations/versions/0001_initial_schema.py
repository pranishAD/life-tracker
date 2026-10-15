"""Initial schema: users, goals, milestones, check_ins, score_snapshots,
category_weights.

This migration intentionally does NOT import backend/app/models -- it
defines its own literal copies of the three Postgres ENUM types so the
migration stays a frozen, replayable snapshot even if the ORM enums change
in a later commit (a future enum value change belongs in a NEW migration,
e.g. `ALTER TYPE ... ADD VALUE`, not a silent edit of this file).

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-10-15
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0001_initial_schema"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Literal enum definitions (kept in sync with app/models/enums.py by hand --
# see module docstring for why this migration doesn't import that module).
category_enum = postgresql.ENUM(
    "fitness", "study", "career", "custom", name="category_enum", create_type=False
)
goal_type_enum = postgresql.ENUM(
    "numeric", "habit", "milestone", name="goal_type_enum", create_type=False
)
goal_status_enum = postgresql.ENUM(
    "active", "completed", "archived", name="goal_status_enum", create_type=False
)


def upgrade() -> None:
    bind = op.get_bind()

    # Create the enum types up front (checkfirst so `alembic upgrade head`
    # is safe to re-run against a half-applied DB). create_type=False on the
    # column definitions below stops SQLAlchemy from trying to CREATE TYPE a
    # second time when each enum is reused across multiple tables/columns.
    category_enum.create(bind, checkfirst=True)
    goal_type_enum.create(bind, checkfirst=True)
    goal_status_enum.create(bind, checkfirst=True)

    # -- users ---------------------------------------------------------
    op.create_table(
        "users",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
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
    )
    # Case-insensitive unique email via a functional index on lower(email)
    # rather than the citext extension (see app/models/user.py docstring).
    op.create_index(
        "ix_users_email_lower", "users", [sa.text("lower(email)")], unique=True
    )

    # -- goals -----------------------------------------------------------
    op.create_table(
        "goals",
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
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", category_enum, nullable=False),
        sa.Column("type", goal_type_enum, nullable=False),
        sa.Column("target_value", sa.Numeric(12, 2), nullable=True),
        sa.Column("current_value", sa.Numeric(12, 2), nullable=True),
        sa.Column("unit", sa.String(length=32), nullable=True),
        sa.Column("frequency_per_week", sa.Integer(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("deadline", sa.Date(), nullable=True),
        sa.Column("weight", sa.Numeric(5, 2), nullable=False, server_default=sa.text("1")),
        sa.Column(
            "status",
            goal_status_enum,
            nullable=False,
            server_default=sa.text("'active'::goal_status_enum"),
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
        sa.CheckConstraint("weight > 0", name="ck_goals_weight_positive"),
        sa.CheckConstraint(
            "target_value IS NULL OR target_value > 0", name="ck_goals_target_value_positive"
        ),
        sa.CheckConstraint(
            "frequency_per_week IS NULL OR frequency_per_week > 0",
            name="ck_goals_frequency_per_week_positive",
        ),
        sa.CheckConstraint(
            "type <> 'numeric' OR target_value IS NOT NULL",
            name="ck_goals_numeric_requires_target_value",
        ),
        sa.CheckConstraint(
            "type <> 'habit' OR frequency_per_week IS NOT NULL",
            name="ck_goals_habit_requires_frequency_per_week",
        ),
    )
    # Required index (master-plan section 5): goals filtered by user + status.
    op.create_index("ix_goals_user_id_status", "goals", ["user_id", "status"])

    # -- milestones --------------------------------------------------------
    op.create_table(
        "milestones",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "goal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("is_done", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
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
            "NOT is_done OR done_at IS NOT NULL", name="ck_milestones_done_requires_done_at"
        ),
    )
    op.create_index("ix_milestones_goal_id", "milestones", ["goal_id"])

    # -- check_ins -----------------------------------------------------------
    op.create_table(
        "check_ins",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "goal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("value", sa.Numeric(12, 2), nullable=True),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("effort_rating", sa.SmallInteger(), nullable=False),
        sa.Column("logged_for", sa.Date(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.CheckConstraint(
            "effort_rating BETWEEN 1 AND 5", name="ck_check_ins_effort_rating_range"
        ),
    )
    # Required index (master-plan section 5): goal history + every scoring
    # window query scans check-ins by goal + date range.
    op.create_index("ix_check_ins_goal_id_logged_for", "check_ins", ["goal_id", "logged_for"])

    # -- score_snapshots -----------------------------------------------------
    op.create_table(
        "score_snapshots",
        sa.Column(
            "id",
            postgresql.UUID(as_uuid=True),
            primary_key=True,
            server_default=sa.text("gen_random_uuid()"),
        ),
        sa.Column(
            "goal_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("goals.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("pace", sa.Numeric(5, 4), nullable=False),
        sa.Column("consistency", sa.Numeric(5, 4), nullable=False),
        sa.Column("momentum", sa.Numeric(5, 4), nullable=False),
        sa.Column("effort", sa.Numeric(5, 4), nullable=False),
        sa.Column("total", sa.Integer(), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.UniqueConstraint(
            "goal_id", "snapshot_date", name="uq_score_snapshots_goal_id_snapshot_date"
        ),
        sa.CheckConstraint("pace BETWEEN 0 AND 1", name="ck_score_snapshots_pace_range"),
        sa.CheckConstraint(
            "consistency BETWEEN 0 AND 1", name="ck_score_snapshots_consistency_range"
        ),
        sa.CheckConstraint("momentum BETWEEN 0 AND 1", name="ck_score_snapshots_momentum_range"),
        sa.CheckConstraint("effort BETWEEN 0 AND 1", name="ck_score_snapshots_effort_range"),
        sa.CheckConstraint(
            "total IS NULL OR total BETWEEN 0 AND 100", name="ck_score_snapshots_total_range"
        ),
    )
    # The UniqueConstraint above already creates a unique index on
    # (goal_id, snapshot_date), which is also the required index from
    # master-plan section 5 -- no separate index needed.

    # -- category_weights ------------------------------------------------
    op.create_table(
        "category_weights",
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            primary_key=True,
        ),
        sa.Column("category", category_enum, primary_key=True),
        sa.Column("weight", sa.Numeric(5, 2), nullable=False, server_default=sa.text("1")),
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
        sa.CheckConstraint("weight > 0", name="ck_category_weights_weight_positive"),
    )


def downgrade() -> None:
    bind = op.get_bind()

    op.drop_table("category_weights")
    op.drop_table("score_snapshots")
    op.drop_index("ix_check_ins_goal_id_logged_for", table_name="check_ins")
    op.drop_table("check_ins")
    op.drop_index("ix_milestones_goal_id", table_name="milestones")
    op.drop_table("milestones")
    op.drop_index("ix_goals_user_id_status", table_name="goals")
    op.drop_table("goals")
    op.drop_index("ix_users_email_lower", table_name="users")
    op.drop_table("users")

    goal_status_enum.drop(bind, checkfirst=True)
    goal_type_enum.drop(bind, checkfirst=True)
    category_enum.drop(bind, checkfirst=True)
