"""Goal customisation: per-user categories + richer goal fields.

Upgrade (data-preserving, works on an empty DB and on a DB with data):
  1. New enums identity_color_enum, numeric_direction_enum, frequency_type_enum.
  2. New `categories` table; the 4 default categories (Fitness/Study/Career/
     Custom, default_key = the old category_enum value) are inserted for
     EVERY existing user.
  3. goals.category (category_enum) -> goals.category_id (uuid, NOT NULL),
     backfilled by joining on (user_id, default_key = category::text), with a
     composite FK (user_id, category_id) -> categories(user_id, id) ON DELETE
     RESTRICT, so a goal can never point at another user's category.
  4. category_weights.category -> category_id, same mapping, same weight;
     PK becomes (user_id, category_id).
  5. New goal columns: emoji, color, start_value, direction, frequency_type,
     weekdays, why, archived_at. Backfill so scores do not change:
       numeric goals   -> start_value = 0, direction = 'increase'
                          (progress (cur - 0) / (target - 0) == cur / target)
       habit goals     -> frequency_type = 'per_week' (frequency_per_week kept)
       archived goals  -> archived_at = updated_at
  6. CHECK constraints for the new fields; target_value check relaxed from
     > 0 to >= 0 (a decrease goal may target 0).
  7. Old columns and category_enum dropped.

Downgrade (back to 0002_journal_entries) LOSES, by design:
  - every category's name / emoji / colour / sort_order, and every
    NON-default (user-created) category. Goals in a non-default category get
    category = 'custom'; goals in a default category get its default_key.
  - category_weights rows for non-default categories (no old enum value to
    map them to). Default-category weights are kept, same weight.
  - goals.emoji, color, start_value, direction, frequency_type, weekdays,
    why, archived_at. (So a 'decrease' numeric goal silently becomes an
    old-style 0 -> target goal, and 'daily'/'weekdays' habits keep only
    their frequency_per_week.)
  - numeric goals with target_value = 0 (only creatable after this
    revision) are changed to target_value = 0.01 so the restored
    `target_value > 0` CHECK can be added. This is the only step that
    rewrites a value that still exists after downgrade.
  Data that existed at 0002 round-trips exactly (verified: goals,
  category_weights, milestones, check_ins, score_snapshots identical after
  upgrade -> downgrade). Column ORDER differs after a round trip (the
  re-added `category` columns are appended at the end), which does not
  affect the ORM or any query that names its columns.

Like 0001/0002 this migration does NOT import backend/app/models -- it is a
frozen snapshot. Enum literals and the default-category list are copied here
on purpose.

Revision ID: 0003_goal_customisation
Revises: 0002_journal_entries
Create Date: 2026-10-20
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = "0003_goal_customisation"
down_revision: Union[str, None] = "0002_journal_entries"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


identity_color_enum = postgresql.ENUM(
    "slate", "violet", "purple", "pink", "rose", "sand", "lime", "teal", "cyan", "indigo",
    name="identity_color_enum",
    create_type=False,
)
numeric_direction_enum = postgresql.ENUM(
    "increase", "decrease", name="numeric_direction_enum", create_type=False
)
frequency_type_enum = postgresql.ENUM(
    "daily", "per_week", "weekdays", name="frequency_type_enum", create_type=False
)
# Re-created on downgrade only (dropped at the end of upgrade).
category_enum = postgresql.ENUM(
    "fitness", "study", "career", "custom", name="category_enum", create_type=False
)

# Frozen copy of app/models/category.py DEFAULT_CATEGORIES as of this revision:
# (default_key, name, emoji, color, sort_order)
DEFAULT_CATEGORIES = (
    ("fitness", "Fitness", "\U0001F3C3", "teal", 0),     # runner
    ("study", "Study", "\U0001F4DA", "violet", 1),       # books
    ("career", "Career", "\U0001F4BC", "indigo", 2),     # briefcase
    ("custom", "Custom", "✨", "slate", 3),          # sparkles
)

# New goal CHECKs, (name, expression). Kept in one list so upgrade/downgrade
# stay in sync. Mirrored in app/models/goal.py.
GOAL_CHECKS = (
    (
        "ck_goals_emoji_length",
        "emoji IS NULL OR char_length(emoji) BETWEEN 1 AND 16",
    ),
    (
        "ck_goals_numeric_requires_start_and_direction",
        "type <> 'numeric' OR (start_value IS NOT NULL AND direction IS NOT NULL)",
    ),
    (
        "ck_goals_start_direction_only_numeric",
        "type = 'numeric' OR (start_value IS NULL AND direction IS NULL)",
    ),
    (
        "ck_goals_start_value_non_negative",
        "start_value IS NULL OR start_value >= 0",
    ),
    (
        "ck_goals_numeric_start_differs_from_target",
        "type <> 'numeric' OR start_value <> target_value",
    ),
    (
        "ck_goals_direction_matches_values",
        "direction IS NULL"
        " OR (direction = 'increase' AND target_value > start_value)"
        " OR (direction = 'decrease' AND target_value < start_value)",
    ),
    (
        "ck_goals_habit_requires_frequency_type",
        "type <> 'habit' OR frequency_type IS NOT NULL",
    ),
    (
        "ck_goals_frequency_type_only_habit",
        "type = 'habit' OR frequency_type IS NULL",
    ),
    (
        # COALESCE: for frequency_type NULL the left side would be NULL and a
        # CHECK that evaluates to NULL passes -- that would let a non-habit
        # goal carry a weekdays array. COALESCE makes it a strict boolean.
        "ck_goals_weekdays_iff_frequency_type_weekdays",
        "COALESCE(frequency_type = 'weekdays', false) = (weekdays IS NOT NULL)",
    ),
    (
        "ck_goals_weekdays_values",
        "weekdays IS NULL OR ("
        "array_ndims(weekdays) = 1"
        " AND cardinality(weekdays) BETWEEN 1 AND 7"
        " AND weekdays <@ ARRAY[1,2,3,4,5,6,7]::smallint[])",
    ),
    (
        # frequency_per_week is derived for daily (7) and weekdays (number of
        # days); scoring reads only frequency_per_week, so keep it honest.
        "ck_goals_frequency_per_week_matches_schedule",
        "frequency_type IS NULL OR frequency_type = 'per_week'"
        " OR (frequency_type = 'daily' AND frequency_per_week = 7)"
        " OR (frequency_type = 'weekdays' AND frequency_per_week = cardinality(weekdays))",
    ),
    (
        "ck_goals_why_length",
        "why IS NULL OR char_length(why) <= 140",
    ),
    (
        "ck_goals_archived_at_matches_status",
        "(status = 'archived') = (archived_at IS NOT NULL)",
    ),
)


def upgrade() -> None:
    bind = op.get_bind()

    # -- 1. enums ---------------------------------------------------------
    identity_color_enum.create(bind, checkfirst=True)
    numeric_direction_enum.create(bind, checkfirst=True)
    frequency_type_enum.create(bind, checkfirst=True)

    # -- 2. categories ----------------------------------------------------
    op.create_table(
        "categories",
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
        sa.Column("name", sa.String(length=24), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=False),
        sa.Column("color", identity_color_enum, nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("default_key", sa.String(length=16), nullable=True),
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
        sa.UniqueConstraint("user_id", "id", name="uq_categories_user_id_id"),
        sa.UniqueConstraint("user_id", "default_key", name="uq_categories_user_id_default_key"),
        sa.CheckConstraint(
            "char_length(emoji) BETWEEN 1 AND 16", name="ck_categories_emoji_length"
        ),
        sa.CheckConstraint(
            "default_key IS NULL OR default_key IN ('fitness', 'study', 'career', 'custom')",
            name="ck_categories_default_key_values",
        ),
    )
    op.create_index(
        "ix_categories_user_id_name_lower",
        "categories",
        ["user_id", sa.text("lower(name)")],
        unique=True,
    )
    op.create_index("ix_categories_user_id_sort_order", "categories", ["user_id", "sort_order"])

    # One INSERT ... SELECT for all existing users x 4 defaults.
    defaults_values = ", ".join(
        f"('{key}', '{name}', '{emoji}', '{color}'::identity_color_enum, {sort})"
        for key, name, emoji, color, sort in DEFAULT_CATEGORIES
    )
    op.execute(
        f"""
        INSERT INTO categories (user_id, name, emoji, color, sort_order, default_key)
        SELECT u.id, d.name, d.emoji, d.color, d.sort_order, d.default_key
        FROM users u
        CROSS JOIN (VALUES {defaults_values}) AS d(default_key, name, emoji, color, sort_order)
        """
    )

    # -- 3. goals.category -> goals.category_id ---------------------------
    op.add_column("goals", sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.execute(
        """
        UPDATE goals g
        SET category_id = c.id
        FROM categories c
        WHERE c.user_id = g.user_id
          AND c.default_key = g.category::text
        """
    )
    op.alter_column("goals", "category_id", nullable=False)
    # RESTRICT: a category that still has goals can't be deleted (the API
    # moves them first). Deleting a user still works: the users -> goals
    # and users -> categories cascades run in the same statement and the
    # goals are gone by the time the categories' RESTRICT check runs
    # (verified on PG16 with both trigger orders).
    op.create_foreign_key(
        "fk_goals_user_id_category_id_categories",
        "goals",
        "categories",
        ["user_id", "category_id"],
        ["user_id", "id"],
        ondelete="RESTRICT",
    )
    op.create_index("ix_goals_user_id_category_id", "goals", ["user_id", "category_id"])

    # -- 4. category_weights.category -> category_id ----------------------
    op.add_column(
        "category_weights",
        sa.Column("category_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.execute(
        """
        UPDATE category_weights w
        SET category_id = c.id
        FROM categories c
        WHERE c.user_id = w.user_id
          AND c.default_key = w.category::text
        """
    )
    op.alter_column("category_weights", "category_id", nullable=False)
    op.drop_constraint("category_weights_pkey", "category_weights", type_="primary")
    op.create_primary_key("category_weights_pkey", "category_weights", ["user_id", "category_id"])
    op.create_foreign_key(
        "fk_category_weights_user_id_category_id_categories",
        "category_weights",
        "categories",
        ["user_id", "category_id"],
        ["user_id", "id"],
        ondelete="CASCADE",
    )

    # -- 5. new goal columns + backfill ------------------------------------
    op.add_column("goals", sa.Column("emoji", sa.String(length=16), nullable=True))
    op.add_column("goals", sa.Column("color", identity_color_enum, nullable=True))
    op.add_column("goals", sa.Column("start_value", sa.Numeric(12, 2), nullable=True))
    op.add_column("goals", sa.Column("direction", numeric_direction_enum, nullable=True))
    op.add_column("goals", sa.Column("frequency_type", frequency_type_enum, nullable=True))
    op.add_column("goals", sa.Column("weekdays", postgresql.ARRAY(sa.SmallInteger()), nullable=True))
    op.add_column("goals", sa.Column("why", sa.String(length=140), nullable=True))
    op.add_column("goals", sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True))

    # Plain SQL UPDATEs: updated_at is ORM-maintained (no trigger), so these
    # backfills don't touch it -- the round-trip stays byte-identical.
    op.execute(
        "UPDATE goals SET start_value = 0, direction = 'increase' WHERE type = 'numeric'"
    )
    op.execute("UPDATE goals SET frequency_type = 'per_week' WHERE type = 'habit'")
    op.execute("UPDATE goals SET archived_at = updated_at WHERE status = 'archived'")

    # -- 6. CHECKs -----------------------------------------------------------
    op.drop_constraint("ck_goals_target_value_positive", "goals", type_="check")
    op.create_check_constraint(
        "ck_goals_target_value_non_negative", "goals", "target_value IS NULL OR target_value >= 0"
    )
    for name, expr in GOAL_CHECKS:
        op.create_check_constraint(name, "goals", expr)

    # -- 7. drop old columns + enum ----------------------------------------
    op.drop_column("goals", "category")
    op.drop_column("category_weights", "category")
    category_enum.drop(bind, checkfirst=True)


def downgrade() -> None:
    bind = op.get_bind()

    category_enum.create(bind, checkfirst=True)

    # -- goals.category back from the category's default_key ----------------
    op.add_column("goals", sa.Column("category", category_enum, nullable=True))
    op.execute(
        """
        UPDATE goals g
        SET category = COALESCE(c.default_key, 'custom')::category_enum
        FROM categories c
        WHERE c.id = g.category_id
        """
    )
    op.alter_column("goals", "category", nullable=False)

    # -- category_weights back to (user_id, category) -----------------------
    # Non-default categories have no enum value: their weights are dropped.
    op.execute(
        """
        DELETE FROM category_weights w
        USING categories c
        WHERE c.id = w.category_id AND c.default_key IS NULL
        """
    )
    op.add_column("category_weights", sa.Column("category", category_enum, nullable=True))
    op.execute(
        """
        UPDATE category_weights w
        SET category = c.default_key::category_enum
        FROM categories c
        WHERE c.id = w.category_id
        """
    )
    op.alter_column("category_weights", "category", nullable=False)
    op.drop_constraint(
        "fk_category_weights_user_id_category_id_categories", "category_weights", type_="foreignkey"
    )
    op.drop_constraint("category_weights_pkey", "category_weights", type_="primary")
    op.create_primary_key("category_weights_pkey", "category_weights", ["user_id", "category"])
    op.drop_column("category_weights", "category_id")

    # -- goal CHECKs + new columns -----------------------------------------
    for name, _expr in reversed(GOAL_CHECKS):
        op.drop_constraint(name, "goals", type_="check")
    op.drop_constraint("ck_goals_target_value_non_negative", "goals", type_="check")
    # The one lossy rewrite: target 0 is only possible after this revision.
    op.execute("UPDATE goals SET target_value = 0.01 WHERE target_value = 0")
    op.create_check_constraint(
        "ck_goals_target_value_positive", "goals", "target_value IS NULL OR target_value > 0"
    )

    op.drop_column("goals", "archived_at")
    op.drop_column("goals", "why")
    op.drop_column("goals", "weekdays")
    op.drop_column("goals", "frequency_type")
    op.drop_column("goals", "direction")
    op.drop_column("goals", "start_value")
    op.drop_column("goals", "color")
    op.drop_column("goals", "emoji")

    op.drop_index("ix_goals_user_id_category_id", table_name="goals")
    op.drop_constraint("fk_goals_user_id_category_id_categories", "goals", type_="foreignkey")
    op.drop_column("goals", "category_id")

    # -- categories + enums ---------------------------------------------------
    op.drop_index("ix_categories_user_id_sort_order", table_name="categories")
    op.drop_index("ix_categories_user_id_name_lower", table_name="categories")
    op.drop_table("categories")

    frequency_type_enum.drop(bind, checkfirst=True)
    numeric_direction_enum.drop(bind, checkfirst=True)
    identity_color_enum.drop(bind, checkfirst=True)
