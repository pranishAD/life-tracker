"""Pydantic v2 schemas for the `milestones` tag of docs/api-contract.yaml."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import TITLE_MAX_LENGTH, BoundedDate


class MilestoneOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    goal_id: uuid.UUID
    title: str
    due_date: Optional[date] = None
    is_done: bool
    done_at: Optional[datetime] = None


class MilestoneCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=TITLE_MAX_LENGTH)
    due_date: Optional[BoundedDate] = None


class MilestoneUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=TITLE_MAX_LENGTH)
    due_date: Optional[BoundedDate] = None
    is_done: Optional[bool] = None
