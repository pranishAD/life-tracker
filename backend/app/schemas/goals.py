"""Pydantic v2 schemas for the `goals` tag of docs/api-contract.yaml."""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.models import Category, GoalStatus, GoalType
from app.schemas.milestones import MilestoneOut


class GoalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    user_id: uuid.UUID
    title: str
    description: Optional[str] = None
    category: Category
    type: GoalType
    target_value: Optional[float] = None
    current_value: Optional[float] = None
    unit: Optional[str] = None
    frequency_per_week: Optional[int] = None
    start_date: date
    deadline: Optional[date] = None
    weight: float
    status: GoalStatus
    milestones: list[MilestoneOut] = Field(default_factory=list)
    created_at: datetime


class GoalCreateRequest(BaseModel):
    title: str = Field(min_length=1)
    description: Optional[str] = None
    category: Category
    type: GoalType
    target_value: Optional[float] = None
    unit: Optional[str] = None
    frequency_per_week: Optional[int] = None
    start_date: date
    deadline: Optional[date] = None
    weight: float = 1.0

    @model_validator(mode="after")
    def _validate_type_requirements(self) -> "GoalCreateRequest":
        if self.weight <= 0:
            raise ValueError("weight must be greater than 0")
        if self.target_value is not None and self.target_value <= 0:
            raise ValueError("target_value must be greater than 0")
        if self.frequency_per_week is not None and self.frequency_per_week <= 0:
            raise ValueError("frequency_per_week must be greater than 0")
        if self.type == GoalType.NUMERIC and self.target_value is None:
            raise ValueError("target_value is required for numeric goals")
        if self.type == GoalType.HABIT and self.frequency_per_week is None:
            raise ValueError("frequency_per_week is required for habit goals")
        return self


class GoalUpdateRequest(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1)
    description: Optional[str] = None
    category: Optional[Category] = None
    target_value: Optional[float] = None
    unit: Optional[str] = None
    frequency_per_week: Optional[int] = None
    deadline: Optional[date] = None
    weight: Optional[float] = None
    status: Optional[GoalStatus] = None

    @model_validator(mode="after")
    def _validate_values(self) -> "GoalUpdateRequest":
        if self.weight is not None and self.weight <= 0:
            raise ValueError("weight must be greater than 0")
        if self.target_value is not None and self.target_value <= 0:
            raise ValueError("target_value must be greater than 0")
        if self.frequency_per_week is not None and self.frequency_per_week <= 0:
            raise ValueError("frequency_per_week must be greater than 0")
        return self
