from datetime import date

from backend.scoring.formulas import momentum
from backend.scoring.types import GoalType

from .factories import make_check_in, make_goal, make_milestone


def test_momentum_same_activity_is_neutral():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    # last 7 days: Feb 8-14 ; previous 7 days: Feb 1-7
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in [2, 4, 9, 11]]
    # 2 check-ins in each window -> ratio 1 -> 0.5
    assert momentum(goal, check_ins, [], today) == 0.5


def test_momentum_both_windows_empty_is_neutral():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    assert momentum(goal, [], [], today) == 0.5


def test_momentum_stopped_is_zero():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in [1, 2, 3]]  # only previous window
    assert momentum(goal, check_ins, [], today) == 0.0


def test_momentum_from_nothing_to_something_is_one():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in [9, 10]]  # only last window
    assert momentum(goal, check_ins, [], today) == 1.0


def test_momentum_double_activity_caps_at_one():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    prev = [make_check_in(logged_for=date(2024, 2, 1))]  # 1 in previous window
    last = [make_check_in(logged_for=date(2024, 2, d)) for d in [9, 10]]  # 2 in last window
    assert momentum(goal, prev + last, [], today) == 1.0


def test_momentum_more_than_double_still_caps_at_one():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    prev = [make_check_in(logged_for=date(2024, 2, 1))]  # 1
    last = [make_check_in(logged_for=date(2024, 2, d)) for d in [9, 10, 11]]  # 3 -> ratio 3
    assert momentum(goal, prev + last, [], today) == 1.0


def test_momentum_half_activity():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.HABIT)
    prev = [make_check_in(logged_for=date(2024, 2, d)) for d in [1, 2]]  # 2
    last = [make_check_in(logged_for=date(2024, 2, 9))]  # 1 -> ratio 0.5
    assert momentum(goal, prev + last, [], today) == 0.25


def test_momentum_milestone_uses_done_at_not_check_ins():
    today = date(2024, 2, 14)
    goal = make_goal(type=GoalType.MILESTONE)
    milestones = [
        make_milestone(is_done=True, done_at=date(2024, 2, 10)),
        make_milestone(is_done=True, done_at=date(2024, 2, 11)),
    ]
    # Check-ins present but irrelevant for a milestone goal's momentum.
    check_ins = [make_check_in(logged_for=date(2024, 2, 1)) for _ in range(5)]
    assert momentum(goal, check_ins, milestones, today) == 1.0
