from datetime import date

from backend.scoring.formulas import consistency
from backend.scoring.types import GoalType

from .factories import make_check_in, make_goal


def test_consistency_fully_met_habit():
    # Daily habit, checked in every day for the last 14 days -> 1.0.
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        frequency_per_week=7,
    )
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in range(1, 15)]
    assert consistency(goal, check_ins, today) == 1.0


def test_consistency_zero_check_ins():
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        frequency_per_week=7,
    )
    assert consistency(goal, [], today) == 0.0


def test_consistency_half_met():
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        frequency_per_week=7,  # expected 14 check-ins over the 14-day window
    )
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in range(1, 8)]  # 7 check-ins
    assert consistency(goal, check_ins, today) == 0.5


def test_consistency_over_met_caps_at_one():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT, start_date=date(2024, 1, 1), frequency_per_week=1)
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in range(1, 15)]  # 14 check-ins
    assert consistency(goal, check_ins, today) == 1.0


def test_consistency_numeric_goal_defaults_to_one_per_week_expectation():
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.NUMERIC,
        start_date=date(2024, 1, 1),
        frequency_per_week=None,  # no explicit frequency -> default 1/week
        target_value=100,
        current_value=10,
    )
    # expected over 14 days = 1/7 * 14 = 2
    check_ins = [
        make_check_in(logged_for=date(2024, 2, 1)),
        make_check_in(logged_for=date(2024, 2, 10)),
    ]
    assert consistency(goal, check_ins, today) == 1.0


def test_consistency_window_clipped_to_young_goal():
    # Goal started 5 days ago (6 active days in the 14-day window incl today).
    today = date(2024, 2, 14)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 2, 9),
        frequency_per_week=7,  # 1/day
    )
    # Checked in every day it's been alive (6 days).
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in range(9, 15)]
    assert consistency(goal, check_ins, today) == 1.0


def test_consistency_window_clipped_by_passed_deadline_before_window():
    # Deadline passed well before the 14-day window even starts -> nothing
    # was expected during this window.
    today = date(2024, 6, 1)
    goal = make_goal(
        type=GoalType.HABIT,
        start_date=date(2024, 1, 1),
        deadline=date(2024, 1, 31),
        frequency_per_week=7,
    )
    assert consistency(goal, [], today) == 1.0
