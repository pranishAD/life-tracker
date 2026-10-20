"""Cross-field goal rules from docs/api-contract.yaml 1.1.0
(GoalCreateRequest description), applied to the whole goal on create and to
the *merged* goal on PATCH. Every failure is a 422 VALIDATION_ERROR, raised
before anything touches the DB, so the goals table's CHECK constraints
(models/goal.py) are never what rejects a request.

`sent` is the set of fields the request explicitly gave a non-null value.
It matters for two rules:
- "Non-numeric goals must not send start_value/direction; non-habit goals
  must not send frequency_type/weekdays": only *sent* values are an error.
  Stale values on the merged goal (e.g. weekdays after switching a habit to
  per_week) are silently cleared instead.
- direction: only a *sent* direction must agree with start vs target. A
  stored direction is re-derived, so PATCHing just target_value below
  start_value flips an "increase" goal to "decrease" (contract PATCH note).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional

from app.errors import validation_error
from app.models import FrequencyType, GoalType, NumericDirection

_CENT = Decimal("0.01")


def to_decimal(value: Optional[float | Decimal]) -> Optional[Decimal]:
    """Same 2-dp rounding Postgres applies to Numeric(12,2), so equality and
    ordering checks here agree with the DB's CHECKs."""
    if value is None:
        return None
    return Decimal(str(value)).quantize(_CENT, rounding=ROUND_HALF_UP)


@dataclass
class GoalTypeFields:
    type: GoalType
    start_value: Optional[Decimal]
    target_value: Optional[Decimal]
    current_value: Optional[Decimal]
    unit: Optional[str]
    direction: Optional[NumericDirection]
    frequency_type: Optional[FrequencyType]
    frequency_per_week: Optional[int]
    weekdays: Optional[list[int]]
    start_date: date
    deadline: Optional[date]


def clear_for_type_change(fields: GoalTypeFields, old_type: GoalType, sent: set[str]) -> None:
    """PATCH changed `type`: null the old type's fields so they can't leak
    into the new type. frequency_per_week is allowed on any type as the
    consistency expectation, so it is kept when the request sends it."""
    if old_type == fields.type:
        return
    if old_type == GoalType.NUMERIC:
        fields.start_value = None
        fields.direction = None
        fields.current_value = None
        fields.target_value = None
        fields.unit = None
    elif old_type == GoalType.HABIT:
        fields.frequency_type = None
        fields.weekdays = None
        if "frequency_per_week" not in sent:
            fields.frequency_per_week = None


def resolve(fields: GoalTypeFields, sent: set[str]) -> None:
    """Validate `fields` in place and fill the server-derived values
    (start_value default, direction, frequency_per_week for daily/weekdays,
    sorted weekdays). Raises 422 on any rule violation."""
    if fields.type != GoalType.NUMERIC:
        for name in ("start_value", "direction"):
            if name in sent:
                raise validation_error(f"{name} is only allowed on numeric goals.")
        fields.start_value = None
        fields.direction = None

    if fields.type != GoalType.HABIT:
        for name in ("frequency_type", "weekdays"):
            if name in sent:
                raise validation_error(f"{name} is only allowed on habit goals.")
        fields.frequency_type = None
        fields.weekdays = None

    if fields.type == GoalType.NUMERIC:
        _resolve_numeric(fields, sent)
    elif fields.type == GoalType.HABIT:
        _resolve_habit(fields, sent)

    if fields.deadline is not None and fields.start_date > fields.deadline:
        raise validation_error("start_date must not be after deadline.")


def _resolve_numeric(fields: GoalTypeFields, sent: set[str]) -> None:
    if fields.target_value is None:
        raise validation_error("target_value is required for numeric goals.")
    if fields.start_value is None:
        fields.start_value = Decimal("0.00")
    if fields.start_value == fields.target_value:
        raise validation_error("start_value and target_value must be different.")

    implied = (
        NumericDirection.INCREASE
        if fields.target_value > fields.start_value
        else NumericDirection.DECREASE
    )
    if "direction" in sent and fields.direction != implied:
        raise validation_error(
            f"direction must be '{implied.value}' when target_value is "
            f"{'above' if implied == NumericDirection.INCREASE else 'below'} start_value."
        )
    fields.direction = implied


def _resolve_habit(fields: GoalTypeFields, sent: set[str]) -> None:
    if fields.frequency_type is None:
        raise validation_error("frequency_type is required for habit goals.")

    if fields.frequency_type != FrequencyType.WEEKDAYS:
        if "weekdays" in sent:
            raise validation_error("weekdays is only allowed when frequency_type is 'weekdays'.")
        fields.weekdays = None

    if fields.frequency_type == FrequencyType.PER_WEEK:
        if fields.frequency_per_week is None:
            raise validation_error("frequency_per_week is required when frequency_type is 'per_week'.")
    elif fields.frequency_type == FrequencyType.DAILY:
        fields.frequency_per_week = 7
    else:  # WEEKDAYS
        if not fields.weekdays:
            raise validation_error("weekdays is required when frequency_type is 'weekdays'.")
        if len(set(fields.weekdays)) != len(fields.weekdays):
            raise validation_error("weekdays must not contain duplicates.")
        fields.weekdays = sorted(fields.weekdays)
        fields.frequency_per_week = len(fields.weekdays)


__all__ = ["GoalTypeFields", "clear_for_type_change", "resolve", "to_decimal"]
