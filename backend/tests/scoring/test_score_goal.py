from datetime import date

from scoring.engine import goal_score, score_goal
from scoring.types import GoalStatus, GoalType

from .factories import make_check_in, make_goal, make_milestone


def test_score_goal_and_goal_score_are_the_same_function():
    assert goal_score is score_goal


def test_score_goal_no_deadline_produces_valid_score():
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        frequency_per_week=5,
        deadline=None,
    )
    check_ins = [make_check_in(logged_for=date(2024, 2, d), effort_rating=4) for d in range(1, 15)]
    result = score_goal(goal, check_ins, [], today)
    assert 0 <= result.total <= 100
    for value in (result.breakdown.pace, result.breakdown.consistency, result.breakdown.momentum, result.breakdown.effort):
        assert 0.0 <= value <= 1.0
    assert result.grade in {"S", "A", "B", "C", "D"}


def test_score_goal_zero_check_ins():
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        frequency_per_week=5,
        deadline=date(2024, 3, 1),
    )
    result = score_goal(goal, [], [], today)
    assert result.breakdown.consistency == 0.0
    assert result.breakdown.effort == 0.0
    assert result.breakdown.momentum == 0.5  # no activity in either window -> neutral
    assert result.current_streak == 0
    assert result.best_streak == 0
    # pace 0, consistency 0, momentum neutral (0.5), effort 0 -> only the 0.2
    # momentum weight contributes: round(100 * 0.2 * 0.5) == 10.
    assert result.total == 10


def test_score_goal_under_three_days_old_is_calibrating():
    today = date(2024, 1, 2)
    goal = make_goal(
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),  # 1 day old
        deadline=date(2024, 2, 1),
        target_value=100,
        current_value=5,
    )
    result = score_goal(goal, [], [], today)
    assert result.grade == "Calibrating"
    assert result.grade_label == "Calibrating"
    # total is still a real, valid number underneath the "Calibrating" label.
    assert 0 <= result.total <= 100


def test_score_goal_exactly_three_days_old_is_no_longer_calibrating():
    created_at = date(2024, 1, 1)
    today = date(2024, 1, 4)  # (today - created_at).days == 3 -> not < 3
    goal = make_goal(start_date=created_at, created_at=created_at, deadline=date(2024, 2, 1))
    result = score_goal(goal, [], [], today)
    assert result.grade != "Calibrating"


def test_score_goal_completed_goal_is_frozen_regardless_of_today():
    goal = make_goal(
        status=GoalStatus.COMPLETED,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=100,
    )
    check_ins = [
        make_check_in(logged_for=date(2024, 1, 5), effort_rating=4),
        make_check_in(logged_for=date(2024, 1, 10), effort_rating=5),
    ]
    soon_after = score_goal(goal, check_ins, [], date(2024, 2, 1))
    a_year_later = score_goal(goal, check_ins, [], date(2025, 2, 1))
    assert soon_after == a_year_later
    assert soon_after.breakdown.pace == 1.0
    assert soon_after.breakdown.consistency == 1.0
    assert soon_after.breakdown.momentum == 1.0
    assert soon_after.breakdown.effort == (4 + 5) / 2 / 5
    assert soon_after.grade != "Calibrating"


def test_score_goal_completed_goal_never_calibrating_even_if_brand_new():
    goal = make_goal(
        status=GoalStatus.COMPLETED,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 1, 2),
        target_value=100,
        current_value=100,
    )
    result = score_goal(goal, [], [], date(2024, 1, 1))
    assert result.grade != "Calibrating"


def test_score_goal_over_achievement_still_caps_total_at_100():
    goal = make_goal(
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=500,  # way over target
    )
    today = date(2024, 1, 16)
    check_ins = [make_check_in(logged_for=date(2024, 1, d), effort_rating=5) for d in range(3, 17)]
    result = score_goal(goal, check_ins, [], today)
    assert result.breakdown.pace == 1.0
    assert result.total <= 100


def test_score_goal_deadline_already_passed():
    goal = make_goal(
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=20,  # well under target by the deadline
    )
    today = date(2024, 6, 1)
    result = score_goal(goal, [], [], today)
    assert result.breakdown.pace == 0.2


def test_score_goal_numeric_type():
    goal = make_goal(
        type=GoalType.NUMERIC,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 2, 1),
        target_value=80,
        current_value=40,
    )
    today = date(2024, 1, 16)
    result = score_goal(goal, [], [], today)
    assert isinstance(result.total, int)


def test_score_goal_habit_type():
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        frequency_per_week=5,
        deadline=date(2024, 2, 1),
    )
    today = date(2024, 1, 16)
    check_ins = [make_check_in(logged_for=date(2024, 1, d), effort_rating=4) for d in (10, 12, 14, 15)]
    result = score_goal(goal, check_ins, [], today)
    assert isinstance(result.total, int)
    assert 0 <= result.total <= 100


def test_score_goal_milestone_type():
    goal = make_goal(
        type=GoalType.MILESTONE,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        deadline=date(2024, 2, 1),
    )
    milestones = [
        make_milestone(is_done=True, done_at=date(2024, 1, 10)),
        make_milestone(is_done=False),
        make_milestone(is_done=False),
    ]
    today = date(2024, 1, 16)
    result = score_goal(goal, [], milestones, today)
    assert isinstance(result.total, int)
    assert 0 <= result.total <= 100
