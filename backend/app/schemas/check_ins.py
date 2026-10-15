"""Pydantic v2 schemas for the `check-ins` tag of docs/api-contract.yaml."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field


class CheckInOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal_id: uuid.UUID
    value: Optional[float] = None
    note: Optional[str] = None
    effort_rating: int
    logged_for: date
    created_at: datetime


class CheckInCreateRequest(BaseModel):
    value: Optional[float] = None
    note: Optional[str] = None
    effort_rating: int = Field(ge=1, le=5)
    logged_for: date
