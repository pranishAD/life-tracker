"""Entry points that combine the individual factors into goal/category/overall
scores. Pure functions only -- see backend/scoring/README.md.
"""

from __future__ import annotations

from datetime import date
from typing import Optional, Sequence

from .formulas import (
    consistency,
    current_streak,
    best_streak,
    effort,
    grade,
    is_calibrating,
    momentum,
    pace,
)
from .types import (
    CategoryScoreInput,
    CheckIn,
    Goal,
    GoalScore,
    GoalStatus,
    Milestone,
    ScoreBreakdown,
    WeightedScore,
)

# Weights from docs/master-plan.md section 4.
PACE_WEIGHT = 0.4
CONSISTENCY_WEIGHT = 0.3
MOMENTUM_WEIGHT = 0.2
EFFORT_WEIGHT = 0.1


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _frozen_breakdown(check_ins: Sequence[CheckIn]) -> ScoreBreakdown:
    """A completed goal's breakdown, independent of `today`.

    pace/consistency/momentum are all 1.0 (the goal was achieved); effort is
    the average effort rating across ALL of the goal's check-ins (not just a
    rolling 14-day window, which would eventually empty out and make the
    "frozen" score silently decay the further in the future it's recomputed).
    See README "Interpretations".
    """
    ratings = [c.effort_rating for c in check_ins if c.effort_rating is not None]
    avg = sum(ratings) / len(ratings) if ratings else 0.0
    return ScoreBreakdown(pace=1.0, consistency=1.0, momentum=1.0, effort=_clamp01(avg / 5.0))


def _total_from_breakdown(breakdown: ScoreBreakdown) -> int:
    raw = (
        PACE_WEIGHT * breakdown.pace
        + CONSISTENCY_WEIGHT * breakdown.consistency
        + MOMENTUM_WEIGHT * breakdown.momentum
        + EFFORT_WEIGHT * breakdown.effort
    )
    return max(0, min(100, round(100 * raw)))


def score_goal(
    goal: Goal,
    check_ins: Sequence[CheckIn],
    milestones: Sequence[Milestone],
    today: date,
) -> GoalScore:
    """The public entry point: score a single goal as of `today`.

    goal_score = round(100 * (0.4*pace + 0.3*consistency + 0.2*momentum + 0.1*effort))

    Completed goals get a frozen breakdown (see `_frozen_breakdown`). Goals
    under 3 days old (and not completed) report grade "Calibrating" instead
    of a letter grade, per docs/master-plan.md section 4.
    """
    if goal.status == GoalStatus.COMPLETED:
        breakdown = _frozen_breakdown(check_ins)
    else:
        breakdown = ScoreBreakdown(
            pace=pace(goal, check_ins, milestones, today),
            consistency=consistency(goal, check_ins, today),
            momentum=momentum(goal, check_ins, milestones, today),
            effort=effort(check_ins, today),
        )

    total = _total_from_breakdown(breakdown)

    if goal.status != GoalStatus.COMPLETED and is_calibrating(goal.created_at, today):
        grade_letter, grade_label = "Calibrating", "Calibrating"
    else:
        g = grade(total)
        grade_letter, grade_label = g.letter, g.label

    return GoalScore(
        breakdown=breakdown,
        total=total,
        grade=grade_letter,
        grade_label=grade_label,
        current_streak=current_streak(check_ins, today),
        best_streak=best_streak(check_ins),
    )


# `goal_score` is the same function under the name used in the agent brief;
# `score_goal` is the canonical public entry point. Kept as a plain alias so
# there is exactly one implementation to maintain.
goal_score = score_goal


def category_score(scores: Sequence[WeightedScore]) -> Optional[int]:
    """Weighted average of goal scores in a category (goal.weight, default 1).

    `scores` should already be filtered by the caller to the goals that count
    towards scoring (see `formulas.is_scorable_status`). Returns None when
    there's nothing to average (e.g. the category has no eligible goals) --
    callers must exclude such categories from `overall_score` rather than
    treating the None as a 0.
    """
    if not scores:
        return None
    total_weight = sum(s.weight for s in scores)
    if total_weight <= 0:
        return None
    weighted_sum = sum(s.score * s.weight for s in scores)
    return round(weighted_sum / total_weight)


def overall_score(categories: Sequence[CategoryScoreInput]) -> Optional[int]:
    """Weighted average of category scores (user category_weights, default
    equal). Categories with no active goals (score is None) are excluded
    entirely, not treated as a 0.
    """
    eligible = [c for c in categories if c.score is not None]
    if not eligible:
        return None
    total_weight = sum(c.weight for c in eligible)
    if total_weight <= 0:
        return None
    weighted_sum = sum(c.score * c.weight for c in eligible)  # type: ignore[operator]
    return round(weighted_sum / total_weight)


__all__ = ["score_goal", "goal_score", "category_score", "overall_score"]
