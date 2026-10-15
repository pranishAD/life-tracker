from datetime import date

from backend.scoring.formulas import effort

from .factories import make_check_in


def test_effort_zero_check_ins():
    today = date(2024, 2, 14)
    assert effort([], today) == 0.0


def test_effort_average_within_window():
    today = date(2024, 2, 14)
    # The 14-day window is Feb 1 (today-13) .. Feb 14 inclusive, so all 3 fall inside it.
    check_ins = [
        make_check_in(logged_for=date(2024, 2, 1), effort_rating=5),
        make_check_in(logged_for=date(2024, 2, 10), effort_rating=4),
        make_check_in(logged_for=date(2024, 2, 12), effort_rating=2),
    ]
    assert effort(check_ins, today) == (5 + 4 + 2) / 3 / 5


def test_effort_excludes_check_ins_outside_the_14_day_window():
    today = date(2024, 2, 14)
    check_ins = [
        make_check_in(logged_for=date(2024, 1, 20), effort_rating=1),  # outside (too old)
        make_check_in(logged_for=date(2024, 2, 12), effort_rating=5),
    ]
    assert effort(check_ins, today) == 1.0


def test_effort_ignores_check_ins_without_a_rating():
    today = date(2024, 2, 14)
    check_ins = [
        make_check_in(logged_for=date(2024, 2, 12), effort_rating=None),
        make_check_in(logged_for=date(2024, 2, 13), effort_rating=5),
    ]
    assert effort(check_ins, today) == 1.0


def test_effort_max_rating_is_one():
    today = date(2024, 2, 14)
    check_ins = [make_check_in(logged_for=date(2024, 2, 14), effort_rating=5)]
    assert effort(check_ins, today) == 1.0
