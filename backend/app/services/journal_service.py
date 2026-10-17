"""Journal (docs/api-contract.yaml `journal` tag): tag normalisation,
tz_offset day bucketing, list/stats queries and the Markdown export.

Journal entries never feed scoring: nothing here writes goals, check-ins or
score_snapshots. The export's optional "Goals and scores" section only
*reads* live scores through app/services/scoring_service.py /
dashboard_service.py (which call backend/scoring) -- no scoring math here.

Every query is filtered by `user_id`; another user's entry is invisible.
"""

from __future__ import annotations

import calendar
import re
import unicodedata
import uuid
from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal
from typing import Optional, Sequence

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.errors import not_found, validation_error
from app.models import Goal, GoalStatus, GoalType, JournalEntry, ScoreSnapshot
from app.services.dashboard_service import overall_score_as_of
from app.services.scoring_service import compute_live_score, load_check_ins, load_milestones
from scoring import grade as score_grade

TITLE_MAX_LENGTH = 120
BODY_MAX_LENGTH = 50000
TAG_MAX_LENGTH = 32
MAX_TAGS = 10

MOOD_LABELS = {1: "Rough", 2: "Low", 3: "Okay", 4: "Good", 5: "Great"}
_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
_WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

_WHITESPACE_RUN = re.compile(r"\s+")


# ---------------------------------------------------------------------------
# Tags
# ---------------------------------------------------------------------------


def _is_tag_char(ch: str) -> bool:
    """Equivalent of the contract's `[\\p{L}\\p{M}\\p{N}_-]` using the Unicode
    general category (L* letters, M* combining marks, N* numbers), so
    Devanagari tags like "नेपाल" (which contain vowel signs, category Mc/Mn)
    are valid. Avoids adding the third-party `regex` package.
    """
    if ch in "_-":
        return True
    return unicodedata.category(ch)[0] in ("L", "M", "N")


def normalize_tag(raw: str) -> Optional[str]:
    """Contract `JournalTag`: trim, strip leading "#", lowercase, whitespace
    runs -> "-". Returns the normalised tag, or None if invalid (empty, >32
    chars, or containing anything but letters/marks/digits/_/-).
    """
    tag = raw.strip().lstrip("#").strip().lower()
    tag = _WHITESPACE_RUN.sub("-", tag)
    if not tag or len(tag) > TAG_MAX_LENGTH:
        return None
    if not all(_is_tag_char(ch) for ch in tag):
        return None
    return tag


def normalize_tag_list(raw_tags: Sequence[str]) -> list[str]:
    """Normalise every tag (ValueError -> 422 on any invalid one), drop
    duplicates keeping first-seen order, max MAX_TAGS.
    """
    result: list[str] = []
    for raw in raw_tags:
        tag = normalize_tag(raw)
        if tag is None:
            raise ValueError(
                f"invalid tag {raw!r}: tags must be 1-{TAG_MAX_LENGTH} letters, digits, '_' or '-'"
            )
        if tag not in result:
            result.append(tag)
    if len(result) > MAX_TAGS:
        raise ValueError(f"at most {MAX_TAGS} tags are allowed")
    return result


# ---------------------------------------------------------------------------
# tz_offset helpers
# ---------------------------------------------------------------------------


def tz_from_offset(tz_offset: int) -> timezone:
    return timezone(timedelta(minutes=tz_offset))


def local_today(tz_offset: int, now: Optional[datetime] = None) -> date:
    now = now or datetime.now(timezone.utc)
    return now.astimezone(tz_from_offset(tz_offset)).date()


def local_day_start(day: date, tz_offset: int) -> datetime:
    """The UTC-aware instant at which `day` begins in the caller's tz."""
    return datetime.combine(day, time.min, tzinfo=tz_from_offset(tz_offset))


def local_date_of(ts: datetime, tz_offset: int) -> date:
    if ts.tzinfo is None:  # defensive: timestamptz should always be aware
        ts = ts.replace(tzinfo=timezone.utc)
    return ts.astimezone(tz_from_offset(tz_offset)).date()


def _round1(value: float) -> float:
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


# ---------------------------------------------------------------------------
# Single entry
# ---------------------------------------------------------------------------


def parse_entry_id(raw: str) -> uuid.UUID:
    """A malformed id can't match any entry: 404, same as a missing one."""
    try:
        return uuid.UUID(raw)
    except (ValueError, AttributeError, TypeError) as exc:
        raise not_found("Journal entry not found.") from exc


def get_owned_entry(db: Session, user_id: uuid.UUID, entry_id: uuid.UUID) -> JournalEntry:
    entry = db.scalar(
        select(JournalEntry).where(JournalEntry.id == entry_id, JournalEntry.user_id == user_id)
    )
    if entry is None:
        raise not_found("Journal entry not found.")
    return entry


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def _escape_like(value: str) -> str:
    return value.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_entries(
    db: Session,
    user_id: uuid.UUID,
    *,
    q: Optional[str],
    tag: Optional[str],
    from_date: Optional[date],
    to_date: Optional[date],
    tz_offset: int,
    limit: int,
    offset: int,
) -> tuple[list[JournalEntry], int]:
    if from_date is not None and to_date is not None and to_date < from_date:
        raise validation_error("to must be on or after from.")

    conditions = [JournalEntry.user_id == user_id]

    search = (q or "").strip()
    if search:
        pattern = f"%{_escape_like(search)}%"
        conditions.append(
            or_(
                JournalEntry.title.ilike(pattern, escape="\\"),
                JournalEntry.body.ilike(pattern, escape="\\"),
                func.array_to_string(JournalEntry.tags, " ").ilike(pattern, escape="\\"),
            )
        )

    if tag is not None and tag.strip():
        normalised = normalize_tag(tag)
        if normalised is None:
            raise validation_error("tag: not a valid tag.")
        conditions.append(JournalEntry.tags.any(normalised))

    if from_date is not None:
        conditions.append(JournalEntry.created_at >= local_day_start(from_date, tz_offset))
    if to_date is not None:
        conditions.append(
            JournalEntry.created_at < local_day_start(to_date + timedelta(days=1), tz_offset)
        )

    total = db.scalar(select(func.count()).select_from(JournalEntry).where(*conditions)) or 0
    items = db.scalars(
        select(JournalEntry)
        .where(*conditions)
        .order_by(JournalEntry.created_at.desc(), JournalEntry.id.desc())
        .limit(limit)
        .offset(offset)
    ).all()
    return list(items), int(total)


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def parse_month(month: Optional[str], tz_offset: int) -> tuple[int, int]:
    if month is None:
        today = local_today(tz_offset)
        return today.year, today.month
    year_s, month_s = month.split("-")
    return int(year_s), int(month_s)


def build_stats(db: Session, user_id: uuid.UUID, month: Optional[str], tz_offset: int) -> dict:
    year, month_num = parse_month(month, tz_offset)
    days_in_month = calendar.monthrange(year, month_num)[1]
    first_day = date(year, month_num, 1)
    last_day = date(year, month_num, days_in_month)

    rows = db.execute(
        select(JournalEntry.created_at, JournalEntry.mood).where(
            JournalEntry.user_id == user_id,
            JournalEntry.created_at >= local_day_start(first_day, tz_offset),
            JournalEntry.created_at < local_day_start(last_day + timedelta(days=1), tz_offset),
        )
    ).all()

    counts: dict[date, int] = {}
    moods: dict[date, list[int]] = {}
    for created_at, mood in rows:
        d = local_date_of(created_at, tz_offset)
        counts[d] = counts.get(d, 0) + 1
        if mood is not None:
            moods.setdefault(d, []).append(mood)

    days = []
    for i in range(days_in_month):
        d = first_day + timedelta(days=i)
        day_moods = moods.get(d, [])
        days.append(
            {
                "date": d,
                "entry_count": counts.get(d, 0),
                "avg_mood": _round1(sum(day_moods) / len(day_moods)) if day_moods else None,
            }
        )

    all_moods = [m for _, m in rows if m is not None]

    total_entries = (
        db.scalar(
            select(func.count()).select_from(JournalEntry).where(JournalEntry.user_id == user_id)
        )
        or 0
    )

    tag_counter: Counter[str] = Counter()
    for tags in db.scalars(select(JournalEntry.tags).where(JournalEntry.user_id == user_id)):
        tag_counter.update(tags or [])
    tag_counts = sorted(tag_counter.items(), key=lambda item: (-item[1], item[0]))

    return {
        "month": f"{year:04d}-{month_num:02d}",
        "entry_count": len(rows),
        "avg_mood": _round1(sum(all_moods) / len(all_moods)) if all_moods else None,
        "days": days,
        "total_entries": int(total_entries),
        "tags": [{"tag": t, "count": c} for t, c in tag_counts],
    }


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


@dataclass
class JournalExport:
    from_date: date
    to_date: date
    markdown: str
    entry_count: int
    word_count: int
    goal_count: int

    @property
    def filename(self) -> str:
        return f"bihan-journal-{self.from_date.isoformat()}-to-{self.to_date.isoformat()}.md"


def _fmt_md(d: date) -> str:
    return f"{_MONTHS[d.month - 1]} {d.day}"


def _fmt_mdy(d: date) -> str:
    return f"{_fmt_md(d)}, {d.year}"


def _fmt_range(start: date, end: date) -> str:
    if start == end:
        return _fmt_mdy(end)
    if start.year == end.year:
        return f"{_fmt_md(start)} – {_fmt_mdy(end)}"
    return f"{_fmt_mdy(start)} – {_fmt_mdy(end)}"


def _fmt_number(value: Optional[Decimal | float | int]) -> str:
    if value is None:
        value = 0
    d = Decimal(str(value))
    if d == d.to_integral_value():
        return str(int(d))
    return format(d.normalize(), "f")


def _escape_body(body: str) -> list[str]:
    """Keep line breaks; escape lines starting with "#" (optionally after
    indentation) as "\\#" so they can't become Markdown headings.
    """
    text = body.replace("\r\n", "\n").replace("\r", "\n").strip("\n")
    lines = []
    for line in text.split("\n"):
        stripped = line.lstrip(" \t")
        if stripped.startswith("#"):
            indent = line[: len(line) - len(stripped)]
            line = f"{indent}\\{stripped}"
        lines.append(line)
    return lines


def _entry_block(entry: JournalEntry, tz_offset: int, with_year: bool) -> list[str]:
    d = local_date_of(entry.created_at, tz_offset)
    heading = f"{_WEEKDAYS[d.weekday()]}, {_fmt_mdy(d) if with_year else _fmt_md(d)}"
    if entry.title:
        heading += f" · {' '.join(entry.title.split())}"
    lines = [f"### {heading}"]

    meta = []
    if entry.mood is not None:
        meta.append(f"Mood: {entry.mood}/5 ({MOOD_LABELS.get(entry.mood, '')})")
    if entry.tags:
        meta.append("Tags: " + " ".join(f"#{t}" for t in entry.tags))
    if meta:
        lines.append(" · ".join(meta))

    lines.extend(_escape_body(entry.body))
    return lines


def _goal_progress(db: Session, goal: Goal, today: date) -> str:
    if goal.type == GoalType.NUMERIC:
        unit = f" {goal.unit}" if goal.unit else ""
        return f"{_fmt_number(goal.current_value)} / {_fmt_number(goal.target_value)}{unit}"
    if goal.type == GoalType.MILESTONE:
        milestones = load_milestones(db, goal.id)
        done = sum(1 for m in milestones if m.is_done)
        return f"{done} / {len(milestones)} subtasks"
    # Habit: distinct check-in days since Monday of this week (same rule as
    # the frontend's useHabitExtras).
    monday = today - timedelta(days=today.weekday())
    days = {c.logged_for for c in load_check_ins(db, goal.id) if monday <= c.logged_for <= today}
    return f"{len(days)} / {goal.frequency_per_week or 0} this week"


def _goals_section(
    db: Session, user_id: uuid.UUID, from_date: date, to_date: date, today: date, with_year: bool
) -> tuple[list[str], int]:
    goals = db.scalars(
        select(Goal)
        .where(
            Goal.user_id == user_id,
            Goal.status != GoalStatus.ARCHIVED,
            Goal.start_date <= to_date,
        )
        .order_by(Goal.created_at.asc(), Goal.id.asc())
    ).all()

    lines = ["## Goals and scores"]
    if not goals:
        lines.append("- No goals yet.")
    else:
        overall = overall_score_as_of(db, user_id, today)
        if overall is None:
            lines.append("- Overall: Calibrating")
        else:
            g = score_grade(overall)
            line = f"- Overall: {overall} ({g.letter}, {g.label})"
            last_week = overall_score_as_of(db, user_id, today - timedelta(days=7))
            if last_week is not None:
                change = overall - last_week
                if change > 0:
                    line += f", ▲{change} vs last week"
                elif change < 0:
                    line += f", ▼{-change} vs last week"
                else:
                    line += ", no change vs last week"
            lines.append(line)

        for goal in goals:
            result = compute_live_score(db, goal, today)
            title = " ".join(goal.title.split())
            progress = _goal_progress(db, goal, today)
            if result.grade == "Calibrating":
                lines.append(f"- {title}: Calibrating · {progress}")
            else:
                lines.append(
                    f"- {title}: {result.total} ({result.grade}, {result.grade_label}) · {progress}"
                )

    weekly = _weekly_lines(db, user_id, from_date, to_date, today, with_year)
    if weekly:
        lines.append("### Weekly overall scores")
        lines.extend(weekly)
    return lines, len(goals)


def _weekly_lines(
    db: Session, user_id: uuid.UUID, from_date: date, to_date: date, today: date, with_year: bool
) -> list[str]:
    """Weeks (Monday start, same as /reviews/weekly) whose Monday falls inside
    [from, to] and that have at least one score_snapshots row for one of the
    user's goals. Score = overall as of the week's last day (or today if the
    week isn't over), same as the weekly review.
    """
    first_monday = from_date + timedelta(days=(7 - from_date.weekday()) % 7)
    if first_monday > to_date:
        return []

    snapshot_dates = set(
        db.scalars(
            select(ScoreSnapshot.snapshot_date)
            .join(Goal, ScoreSnapshot.goal_id == Goal.id)
            .where(
                Goal.user_id == user_id,
                ScoreSnapshot.snapshot_date >= first_monday,
                ScoreSnapshot.snapshot_date <= to_date + timedelta(days=6),
            )
            .distinct()
        ).all()
    )

    lines = []
    week_start = first_monday
    while week_start <= to_date:
        week_end = week_start + timedelta(days=6)
        if week_start <= today and any(week_start <= d <= week_end for d in snapshot_dates):
            score = overall_score_as_of(db, user_id, min(week_end, today))
            if score is not None:
                label = _fmt_mdy(week_start) if with_year else _fmt_md(week_start)
                lines.append(f"- Week of {label}: {score} ({score_grade(score).letter})")
        week_start += timedelta(days=7)
    return lines


def build_export(
    db: Session,
    user_id: uuid.UUID,
    *,
    from_date: Optional[date],
    to_date: Optional[date],
    include_goals: bool,
    tz_offset: int,
    now: Optional[datetime] = None,
) -> JournalExport:
    today = local_today(tz_offset, now)
    resolved_to = to_date or today

    if from_date is None:
        first_created = db.scalar(
            select(func.min(JournalEntry.created_at)).where(JournalEntry.user_id == user_id)
        )
        if first_created is None:
            resolved_from = resolved_to
        else:
            # Defaulted, so never let it produce a from > to 422.
            resolved_from = min(local_date_of(first_created, tz_offset), resolved_to)
    else:
        resolved_from = from_date

    if resolved_to < resolved_from:
        raise validation_error("to must be on or after from.")

    entries = db.scalars(
        select(JournalEntry)
        .where(
            JournalEntry.user_id == user_id,
            JournalEntry.created_at >= local_day_start(resolved_from, tz_offset),
            JournalEntry.created_at
            < local_day_start(resolved_to + timedelta(days=1), tz_offset),
        )
        .order_by(JournalEntry.created_at.asc(), JournalEntry.id.asc())
    ).all()

    with_year = resolved_from.year != resolved_to.year
    entry_count = len(entries)
    word_count = sum(len(e.body.split()) for e in entries)

    lines = [
        f"# Bihan journal: {_fmt_range(resolved_from, resolved_to)}",
        f"Exported: {_fmt_mdy(today)} · {entry_count} {'entry' if entry_count == 1 else 'entries'}",
        "",
    ]

    goal_count = 0
    if include_goals:
        goal_lines, goal_count = _goals_section(
            db, user_id, resolved_from, resolved_to, today, with_year
        )
        lines.extend(goal_lines)
        lines.append("")

    lines.append("## Entries")
    if not entries:
        lines.append("No entries in this range.")
    else:
        for i, entry in enumerate(entries):
            if i > 0:
                lines.append("")
            lines.extend(_entry_block(entry, tz_offset, with_year))

    return JournalExport(
        from_date=resolved_from,
        to_date=resolved_to,
        markdown="\n".join(lines) + "\n",
        entry_count=entry_count,
        word_count=word_count,
        goal_count=goal_count,
    )


__all__ = [
    "TITLE_MAX_LENGTH",
    "BODY_MAX_LENGTH",
    "TAG_MAX_LENGTH",
    "MAX_TAGS",
    "MOOD_LABELS",
    "normalize_tag",
    "normalize_tag_list",
    "local_today",
    "parse_entry_id",
    "get_owned_entry",
    "list_entries",
    "build_stats",
    "build_export",
    "JournalExport",
]
