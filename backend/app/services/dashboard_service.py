"""Rollup logic for GET /dashboard and GET /reviews/weekly: folding per-goal
scores up into category scores and an overall score (US-14/US-15/US-17),
built on top of app/services/scoring_service.py's ORM<->scoring-engine
bridge. Only `category_score`/`overall_score` from backend/scoring do the
actual math here -- this module's job is building the right inputs for them
from the DB (which goals count, which weights apply, which day).

Interpretations (ambiguous in docs/api-contract.yaml / user-stories.md,
picked the simplest sensible rule, flagged in the handoff note):

1. `CategoryScore.has_active_goals` is read literally off `GoalStatus.ACTIVE`
   -- a category whose only goals are "completed" reports
   `has_active_goals=False` even though its `score` may still be non-null
   (completed goals count towards the score per scoring engine rule #6, but
   aren't "active").
2. Dashboard overall_grade is required (non-nullable) even though
   overall_score can be null (EC-09, zero goals). We report "Calibrating"
   for overall_grade whenever overall_score is null -- the enum's "no real
   grade yet" value, not a dedicated new one.
3. current_streak_days/best_streak_days are *account-level*: the union of
   check-in days across every active+completed goal (checked in on anything
   counts), not per-goal.
4. "Needs attention" (US-15): a currently-active, non-Calibrating goal
   qualifies if its score dropped >=10 points over the last 7 days, or its
   current score is below 50. Sorted worst-first.
5. Weekly review "not enough history": true only if at least one
   active/completed goal existed for the full previous week too (so a
   week-over-week comparison is meaningful for at least one goal). When
   false, only `overall_score` for the requested week is reported;
   `previous_week_score`/`score_change`/`best_goal`/`slipping_goal` stay
   null.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Optional

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Category, CategoryWeight, Goal, GoalStatus, User
from app.services.scoring_service import load_check_ins, load_milestones, score_goal_as_of
from scoring import (
    CategoryScoreInput,
    GoalStatus as SGoalStatus,
    WeightedScore,
    best_streak,
    category_score,
    current_streak,
    grade,
    is_scorable_status,
    overall_score,
)
from scoring import CheckIn as SCheckIn

ATTENTION_LOW_SCORE_THRESHOLD = 50
ATTENTION_DROP_THRESHOLD = 10


def get_category_weights_map(db: Session, user_id: uuid.UUID) -> dict[Category, float]:
    """Equal (1.0) weight per category by default; overridden per-row by
    anything the user has saved in category_weights (US-18).
    """
    weights: dict[Category, float] = {c: 1.0 for c in Category}
    rows = db.scalars(select(CategoryWeight).where(CategoryWeight.user_id == user_id)).all()
    for row in rows:
        weights[row.category] = float(row.weight)
    return weights


def load_scorable_goals(db: Session, user_id: uuid.UUID, as_of: date) -> list[Goal]:
    """Goals that count towards category/overall scoring (active + completed,
    per scoring/formulas.is_scorable_status) and that already existed as of
    the given day.
    """
    goals = db.scalars(select(Goal).where(Goal.user_id == user_id)).all()
    return [
        g
        for g in goals
        if is_scorable_status(SGoalStatus(g.status.value)) and g.created_at.date() <= as_of
    ]


def goal_total_as_of(db: Session, goal: Goal, as_of: date) -> int:
    check_ins = load_check_ins(db, goal.id)
    milestones = load_milestones(db, goal.id)
    return score_goal_as_of(goal, check_ins, milestones, as_of).total


def overall_score_as_of(db: Session, user_id: uuid.UUID, as_of: date) -> Optional[int]:
    goals = load_scorable_goals(db, user_id, as_of)
    weights_map = get_category_weights_map(db, user_id)

    by_category: dict[Category, list[WeightedScore]] = {c: [] for c in Category}
    for g in goals:
        total = goal_total_as_of(db, g, as_of)
        by_category[g.category].append(WeightedScore(score=total, weight=float(g.weight)))

    category_inputs = [
        CategoryScoreInput(
            category=c.value, score=category_score(by_category[c]), weight=weights_map[c]
        )
        for c in Category
    ]
    return overall_score(category_inputs)


@dataclass
class DashboardData:
    overall_score: Optional[int]
    overall_grade: str
    category_scores: list[dict]
    current_streak_days: int
    best_streak_days: int
    trend: list[dict]
    attention: list[dict]


def build_dashboard(db: Session, user: User, trend_days: int, today: date) -> DashboardData:
    goals = load_scorable_goals(db, user.id, today)
    weights_map = get_category_weights_map(db, user.id)

    by_category: dict[Category, list[WeightedScore]] = {c: [] for c in Category}
    has_active_by_category: dict[Category, bool] = {c: False for c in Category}
    goal_totals: dict[uuid.UUID, int] = {}
    goal_grades: dict[uuid.UUID, str] = {}
    all_check_in_days: set[date] = set()

    for g in goals:
        check_ins = load_check_ins(db, g.id)
        milestones = load_milestones(db, g.id)
        result = score_goal_as_of(g, check_ins, milestones, today)
        goal_totals[g.id] = result.total
        goal_grades[g.id] = result.grade
        by_category[g.category].append(WeightedScore(score=result.total, weight=float(g.weight)))
        if g.status == GoalStatus.ACTIVE:
            has_active_by_category[g.category] = True
        all_check_in_days.update(c.logged_for for c in check_ins)

    category_scores = []
    category_inputs = []
    for c in Category:
        scores = by_category[c]
        cat_score = category_score(scores)
        category_scores.append(
            {"category": c, "score": cat_score, "has_active_goals": has_active_by_category[c]}
        )
        category_inputs.append(CategoryScoreInput(category=c.value, score=cat_score, weight=weights_map[c]))

    overall = overall_score(category_inputs)
    overall_grade_letter = "Calibrating" if overall is None else grade(overall).letter

    streak_check_ins = [SCheckIn(logged_for=d) for d in all_check_in_days]
    streak_today = current_streak(streak_check_ins, today)
    streak_best = best_streak(streak_check_ins)

    trend = []
    for offset in range(trend_days - 1, -1, -1):
        d = today - timedelta(days=offset)
        trend.append({"date": d, "score": overall_score_as_of(db, user.id, d)})

    attention = _build_attention_list(db, goals, goal_totals, goal_grades, today)

    return DashboardData(
        overall_score=overall,
        overall_grade=overall_grade_letter,
        category_scores=category_scores,
        current_streak_days=streak_today,
        best_streak_days=streak_best,
        trend=trend,
        attention=attention,
    )


def _build_attention_list(
    db: Session,
    goals: list[Goal],
    goal_totals: dict[uuid.UUID, int],
    goal_grades: dict[uuid.UUID, str],
    today: date,
) -> list[dict]:
    attention: list[dict] = []
    week_ago = today - timedelta(days=7)

    for g in goals:
        if g.status != GoalStatus.ACTIVE:
            continue
        if goal_grades[g.id] == "Calibrating":
            continue

        total = goal_totals[g.id]
        reason: Optional[str] = None

        if g.created_at.date() <= week_ago:
            past_total = goal_total_as_of(db, g, week_ago)
            drop = past_total - total
            if drop >= ATTENTION_DROP_THRESHOLD:
                reason = f"Score dropped {drop} points this week"

        if reason is None and total < ATTENTION_LOW_SCORE_THRESHOLD:
            reason = f"Score is {total} — needs attention"

        if reason is not None:
            attention.append({"goal_id": g.id, "title": g.title, "score": total, "reason": reason})

    attention.sort(key=lambda item: item["score"])
    return attention


@dataclass
class WeeklyReviewData:
    week_start: date
    has_enough_history: bool
    overall_score: Optional[int]
    previous_week_score: Optional[int]
    score_change: Optional[int]
    best_goal: Optional[dict]
    slipping_goal: Optional[dict]


def build_weekly_review(db: Session, user: User, week_start: date, today: date) -> WeeklyReviewData:
    week_end = week_start + timedelta(days=6)
    prev_start = week_start - timedelta(days=7)
    prev_end = week_start - timedelta(days=1)

    this_week_as_of = min(week_end, today)
    this_week_score = overall_score_as_of(db, user.id, this_week_as_of)

    eligible_goals = [
        g for g in load_scorable_goals(db, user.id, today) if g.created_at.date() <= prev_start
    ]

    if not eligible_goals:
        return WeeklyReviewData(
            week_start=week_start,
            has_enough_history=False,
            overall_score=this_week_score,
            previous_week_score=None,
            score_change=None,
            best_goal=None,
            slipping_goal=None,
        )

    previous_week_score = overall_score_as_of(db, user.id, prev_end)
    score_change = (
        this_week_score - previous_week_score
        if this_week_score is not None and previous_week_score is not None
        else None
    )

    best_goal = None
    slipping_goal = None
    best_total = None
    worst_change = None

    for g in eligible_goals:
        this_total = goal_total_as_of(db, g, this_week_as_of)
        prev_total = goal_total_as_of(db, g, prev_end)
        change = this_total - prev_total

        if best_total is None or this_total > best_total:
            best_total = this_total
            best_goal = {"goal_id": g.id, "title": g.title, "score": this_total}

        if worst_change is None or change < worst_change:
            worst_change = change
            slipping_goal = {"goal_id": g.id, "title": g.title, "score": this_total}

    return WeeklyReviewData(
        week_start=week_start,
        has_enough_history=True,
        overall_score=this_week_score,
        previous_week_score=previous_week_score,
        score_change=score_change,
        best_goal=best_goal,
        slipping_goal=slipping_goal,
    )


__all__ = [
    "get_category_weights_map",
    "load_scorable_goals",
    "goal_total_as_of",
    "overall_score_as_of",
    "build_dashboard",
    "build_weekly_review",
    "DashboardData",
    "WeeklyReviewData",
]
