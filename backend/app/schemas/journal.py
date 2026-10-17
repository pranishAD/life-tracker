"""Pydantic v2 schemas for the `journal` tag of docs/api-contract.yaml
(JournalEntry, JournalEntryCreateRequest, JournalEntryUpdateRequest,
JournalEntryPage, JournalStats).
"""

from __future__ import annotations

import uuid
from datetime import date as _date
from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.services.journal_service import (
    BODY_MAX_LENGTH,
    MAX_TAGS,
    TITLE_MAX_LENGTH,
    normalize_tag_list,
)


def _clean_title(value: Optional[str]) -> Optional[str]:
    """Trimmed; empty/whitespace-only is stored as null (contract)."""
    if value is None:
        return None
    value = value.strip()
    if not value:
        return None
    if len(value) > TITLE_MAX_LENGTH:
        raise ValueError(f"title must be at most {TITLE_MAX_LENGTH} characters")
    return value


def _check_body(value: Optional[str]) -> Optional[str]:
    """Stored as sent (not trimmed), but must contain non-whitespace text."""
    if value is None:
        return None
    if not value.strip():
        raise ValueError("body must contain some text")
    return value


class JournalEntryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    title: Optional[str]
    body: str
    mood: Optional[int]
    tags: list[str]
    created_at: datetime
    updated_at: datetime

    @field_validator("tags", mode="before")
    @classmethod
    def _tags_never_null(cls, value: object) -> object:
        return [] if value is None else value


class JournalEntryCreateRequest(BaseModel):
    title: Optional[str] = None
    body: str = Field(min_length=1, max_length=BODY_MAX_LENGTH)
    mood: Optional[int] = Field(default=None, ge=1, le=5)
    tags: list[str] = Field(default_factory=list, max_length=MAX_TAGS)

    @field_validator("title")
    @classmethod
    def _title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_title(value)

    @field_validator("body")
    @classmethod
    def _body(cls, value: str) -> str:
        return _check_body(value)  # type: ignore[return-value]

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: list[str]) -> list[str]:
        return normalize_tag_list(value)


class JournalEntryUpdateRequest(BaseModel):
    """Partial update. Only fields present in the request change
    (`model_fields_set`). `title: null` / `mood: null` clear them; `tags`
    replaces the list; `body` and `tags` may not be null.
    """

    title: Optional[str] = None
    body: Optional[str] = Field(default=None, min_length=1, max_length=BODY_MAX_LENGTH)
    mood: Optional[int] = Field(default=None, ge=1, le=5)
    tags: Optional[list[str]] = Field(default=None, max_length=MAX_TAGS)

    @field_validator("title")
    @classmethod
    def _title(cls, value: Optional[str]) -> Optional[str]:
        return _clean_title(value)

    @field_validator("body")
    @classmethod
    def _body(cls, value: Optional[str]) -> Optional[str]:
        return _check_body(value)

    @field_validator("tags")
    @classmethod
    def _tags(cls, value: Optional[list[str]]) -> Optional[list[str]]:
        return None if value is None else normalize_tag_list(value)

    @model_validator(mode="after")
    def _at_least_one_and_not_null(self) -> "JournalEntryUpdateRequest":
        if not self.model_fields_set:
            raise ValueError("at least one field is required")
        if "body" in self.model_fields_set and self.body is None:
            raise ValueError("body may not be null")
        if "tags" in self.model_fields_set and self.tags is None:
            raise ValueError("tags may not be null (send [] to clear)")
        return self


class JournalEntryPage(BaseModel):
    items: list[JournalEntryOut]
    total: int
    limit: int
    offset: int


class JournalStatsDay(BaseModel):
    date: _date
    entry_count: int
    avg_mood: Optional[float]


class JournalTagCount(BaseModel):
    tag: str
    count: int


class JournalStats(BaseModel):
    month: str
    entry_count: int
    avg_mood: Optional[float]
    days: list[JournalStatsDay]
    total_entries: int
    tags: list[JournalTagCount]
