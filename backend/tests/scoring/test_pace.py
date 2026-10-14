from datetime import date

from backend.scoring.formulas import consistency, pace
from backend.scoring.types import GoalType

from .factories import make_check_in, make_goal, make_milestone


def test_pace_no_deadline_falls_back_to_consistency():
    today = date(2024, 2, 1)
    goal = make_goal(
        type=GoalType.NUMERIC,
        start_date=date(2024, 1, 1),
        created_at=date(2024, 1, 1),
        target_value=100,
        current_value=50,
        frequency_per_week=3,
        deadline=None,
    )
    check_ins = [
        make_check_in(logged_for=date(2024, 1, 29)),
        make_check_in(logged_for=date(2024, 1, 30)),
    ]
    assert pace(goal, check_ins, [], today) == consistency(goal, check_ins, today)


def test_pace_numeric_midway_on_track():
    # 30-day window, 15 days elapsed -> 50% expected; current is exactly 50%.
    goal = make_goal(
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=50,
    )
    today = date(2024, 1, 16)
    assert pace(goal, [], [], today) == 1.0


def test_pace_numeric_midway_behind():
    goal = make_goal(
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=40,
    )
    today = date(2024, 1, 16)  # elapsed_fraction = 15/30 = 0.5 -> expected 50
    assert pace(goal, [], [], today) == 0.8


def test_pace_over_achievement_caps_at_one():
    goal = make_goal(
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=200,  # way over target
    )
    today = date(2024, 1, 16)
    assert pace(goal, [], [], today) == 1.0


def test_pace_deadline_already_passed_uses_full_target():
    goal = make_goal(
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        target_value=100,
        current_value=60,
    )
    today = date(2024, 6, 1)  # long after deadline
    assert pace(goal, [], [], today) == 0.6


def test_pace_goal_not_started_yet_is_not_penalised():
    goal = make_goal(
        start_date=date(2024, 3, 1),
        deadline=date(2024, 4, 1),
        target_value=100,
        current_value=0,
    )
    today = date(2024, 2, 1)  # before start_date
    assert pace(goal, [], [], today) == 1.0


def test_pace_numeric_missing_target_falls_back_to_consistency():
    today = date(2024, 2, 1)
    goal = make_goal(
        start_date=date(2024, 1, 1),
        deadline=date(2024, 3, 1),
        target_value=None,  # no meaningful target
        current_value=10,
        frequency_per_week=2,
    )
    check_ins: list = []
    assert pace(goal, check_ins, [], today) == consistency(goal, check_ins, today)


def test_pace_habit_with_deadline():
    # frequency 7/week, 2-week deadline -> total expected = 14 check-ins.
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 15),
        frequency_per_week=7,
        target_value=None,
        current_value=None,
    )
    today = date(2024, 1, 8)  # 7 days elapsed of 14 -> elapsed_fraction 0.5 -> expected 7
    check_ins = [make_check_in(logged_for=date(2024, 1, d)) for d in range(1, 8)]  # 7 check-ins
    assert pace(goal, check_ins, [], today) == 1.0


def test_pace_milestone_with_deadline():
    goal = make_goal(
        type=GoalType.MILESTONE,
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 21),  # 20 days
        target_value=None,
        current_value=None,
    )
    today = date(2024, 1, 11)  # 10/20 elapsed -> 0.5
    milestones = [
        make_milestone(is_done=True, done_at=date(2024, 1, 5)),
        make_milestone(is_done=True, done_at=date(2024, 1, 6)),
        make_milestone(is_done=False),
        make_milestone(is_done=False),
    ]
    # actual = 2 done, total = 4 milestones, expected = 4 * 0.5 = 2 -> pace 1.0
    assert pace(goal, [], milestones, today) == 1.0


def test_pace_milestone_no_milestones_yet_falls_back_to_consistency():
    today = date(2024, 1, 10)
    goal = make_goal(
        type=GoalType.MILESTONE,
        start_date=date(2024, 1, 1),
        deadline=date(2024, 2, 1),
        frequency_per_week=1,
    )
    assert pace(goal, [], [], today) == consistency(goal, [], today)
