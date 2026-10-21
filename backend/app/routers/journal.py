"""/journal routes (docs/api-contract.yaml `journal` tag).

Every route is scoped to the current user: another user's entry (or a
missing / malformed id) is always 404. Journal writes never touch goals,
check-ins or score_snapshots.

`/journal/stats` and `/journal/export` are declared before
`/journal/{entryId}` so they are never captured as an entry id.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

from app.deps import get_current_user
from app.errors import validation_error
from app.models import JournalEntry, User
from app.schemas.common import ensure_dates_in_range
from app.schemas.journal import (
    JournalEntryCreateRequest,
    JournalEntryOut,
    JournalEntryPage,
    JournalEntryUpdateRequest,
    JournalStats,
)
from app.services.journal_service import (
    build_export,
    build_stats,
    get_owned_entry,
    list_entries,
    parse_entry_id,
)
from db.session import get_session

router = APIRouter(tags=["journal"])

TzOffset = Query(default=0, ge=-720, le=840)


@router.get("/journal", response_model=JournalEntryPage)
def list_journal_entries(
    q: Optional[str] = Query(default=None, max_length=200),
    tag: Optional[str] = Query(default=None, max_length=32),
    from_: Optional[date] = Query(default=None, alias="from"),
    to: Optional[date] = Query(default=None),
    tz_offset: int = TzOffset,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> JournalEntryPage:
    ensure_dates_in_range(from_, to)
    items, total = list_entries(
        db,
        current_user.id,
        q=q,
        tag=tag,
        from_date=from_,
        to_date=to,
        tz_offset=tz_offset,
        limit=limit,
        offset=offset,
    )
    return JournalEntryPage(
        items=[JournalEntryOut.model_validate(e) for e in items],
        total=total,
        limit=limit,
        offset=offset,
    )


@router.post("/journal", response_model=JournalEntryOut, status_code=201)
def create_journal_entry(
    payload: JournalEntryCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> JournalEntry:
    entry = JournalEntry(
        user_id=current_user.id,
        title=payload.title,
        body=payload.body,
        mood=payload.mood,
        tags=list(payload.tags),
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.get("/journal/stats", response_model=JournalStats)
def get_journal_stats(
    month: Optional[str] = Query(default=None, pattern=r"^[0-9]{4}-(0[1-9]|1[0-2])$"),
    tz_offset: int = TzOffset,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> JournalStats:
    return JournalStats.model_validate(build_stats(db, current_user.id, month, tz_offset))


@router.get("/journal/export")
def export_journal(
    from_: Optional[date] = Query(default=None, alias="from"),
    to: Optional[date] = Query(default=None),
    include_goals: bool = Query(default=True),
    tz_offset: int = TzOffset,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    ensure_dates_in_range(from_, to)
    if from_ is not None and to is not None and to < from_:
        raise validation_error("to must be on or after from.")

    export = build_export(
        db,
        current_user.id,
        from_date=from_,
        to_date=to,
        include_goals=include_goals,
        tz_offset=tz_offset,
    )
    return Response(
        content=export.markdown.encode("utf-8"),
        media_type="text/markdown; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{export.filename}"',
            "X-Journal-Entry-Count": str(export.entry_count),
            "X-Journal-Word-Count": str(export.word_count),
            "X-Journal-Goal-Count": str(export.goal_count),
        },
    )


@router.get("/journal/{entryId}", response_model=JournalEntryOut)
def get_journal_entry(
    entryId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> JournalEntry:
    return get_owned_entry(db, current_user.id, parse_entry_id(entryId))


@router.patch("/journal/{entryId}", response_model=JournalEntryOut)
def update_journal_entry(
    entryId: str,
    payload: JournalEntryUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> JournalEntry:
    entry = get_owned_entry(db, current_user.id, parse_entry_id(entryId))

    provided = payload.model_fields_set
    if "title" in provided:
        entry.title = payload.title
    if "body" in provided and payload.body is not None:
        entry.body = payload.body
    if "mood" in provided:
        entry.mood = payload.mood
    if "tags" in provided and payload.tags is not None:
        entry.tags = list(payload.tags)

    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/journal/{entryId}", status_code=204)
def delete_journal_entry(
    entryId: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> Response:
    entry = get_owned_entry(db, current_user.id, parse_entry_id(entryId))
    db.delete(entry)
    db.commit()
    return Response(status_code=204)
