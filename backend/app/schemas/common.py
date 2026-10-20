"""Shared input bounds (SEC-006 / SEC-008 / SEC-012 in docs/security-review.md).

Every limit here mirrors docs/api-contract.yaml and the DB column it guards,
so bad input fails as a clean 422 in the normal error shape instead of a 500
from Postgres (string too long, numeric overflow) or from Python's `date`
arithmetic (OverflowError near year 1 / 9999).

Use the Annotated types below on request schemas *and* on query parameters
(FastAPI runs the same pydantic validators for both), so there is exactly one
definition of each bound.
"""

from __future__ import annotations

from datetime import date
from typing import Annotated

from pydantic import AfterValidator, Field

from app.errors import validation_error

# --- Dates (SEC-008) --------------------------------------------------------

MIN_DATE = date(1970, 1, 1)
MAX_DATE = date(2100, 12, 31)
DATE_RANGE_MESSAGE = "Dates must be between 1970-01-01 and 2100-12-31."


def check_date_in_range(value: date | None) -> date | None:
    """Raise ValueError (-> 422) if `value` is outside MIN_DATE..MAX_DATE."""
    if value is not None and not (MIN_DATE <= value <= MAX_DATE):
        raise ValueError(DATE_RANGE_MESSAGE)
    return value


# For request *bodies* (pydantic models). Do NOT use this as a query param
# type: FastAPI flattens a top-level Annotated query param and drops the
# AfterValidator -- use `ensure_dates_in_range` in the router instead.
BoundedDate = Annotated[date, AfterValidator(check_date_in_range)]


def ensure_dates_in_range(*values: date | None) -> None:
    """Router-side check for date query parameters: raises the standard 422
    AppError (VALIDATION_ERROR shape) if any given date is out of range."""
    for value in values:
        if value is not None and not (MIN_DATE <= value <= MAX_DATE):
            raise validation_error(DATE_RANGE_MESSAGE)


# --- Text lengths (SEC-006) -------------------------------------------------

NAME_MAX_LENGTH = 120  # users.name String(120)
TITLE_MAX_LENGTH = 200  # goals.title / milestones.title String(200)
DESCRIPTION_MAX_LENGTH = 2000  # goals.description (Text; product limit)
UNIT_MAX_LENGTH = 32  # goals.unit String(32)
NOTE_MAX_LENGTH = 2000  # check_ins.note (Text; product limit)

# --- Numbers (SEC-006) ------------------------------------------------------
# Numeric(12,2) holds up to 9999999999.99; Numeric(5,2) up to 999.99.

LARGE_NUMBER_LIMIT = 10**10
WEIGHT_LIMIT = 1000


def _fits_after_rounding(limit: float, positive: bool):
    """Postgres rounds to 2 decimal places on insert, so e.g. 9999999999.999
    (which is < 1e10) would round up to 1e10 and overflow Numeric(12,2), and
    a weight of 0.001 (> 0) would round to 0.00 and break CHECK (weight > 0).
    Reject those few edge values with a 422 rather than letting them 500."""

    def _check(value: float | None) -> float | None:
        if value is None:
            return value
        rounded = round(value, 2)
        if abs(rounded) >= limit:
            raise ValueError(
                f"value must round (to 2 decimal places) to less than {limit:g} in magnitude"
            )
        if positive and rounded <= 0:
            raise ValueError("value must be at least 0.01")
        return value

    return _check


PositiveLargeNumber = Annotated[
    float,
    Field(gt=0, lt=LARGE_NUMBER_LIMIT, allow_inf_nan=False),
    AfterValidator(_fits_after_rounding(LARGE_NUMBER_LIMIT, positive=True)),
]
SignedLargeNumber = Annotated[
    float,
    Field(gt=-LARGE_NUMBER_LIMIT, lt=LARGE_NUMBER_LIMIT, allow_inf_nan=False),
    AfterValidator(_fits_after_rounding(LARGE_NUMBER_LIMIT, positive=False)),
]
Weight = Annotated[
    float,
    Field(gt=0, lt=WEIGHT_LIMIT, allow_inf_nan=False),
    AfterValidator(_fits_after_rounding(WEIGHT_LIMIT, positive=True)),
]
FrequencyPerWeek = Annotated[int, Field(ge=1, le=100)]
