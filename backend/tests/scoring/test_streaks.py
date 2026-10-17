from datetime import date

from scoring.formulas import best_streak, current_streak

from .factories import make_check_in


def test_current_streak_zero_check_ins():
    assert current_streak([], date(2024, 2, 14)) == 0


def test_current_streak_checked_in_today_only():
    check_ins = [make_check_in(logged_for=date(2024, 2, 14))]
    assert current_streak(check_ins, date(2024, 2, 14)) == 1


def test_current_streak_consecutive_days_ending_today():
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in (10, 11, 12, 13, 14)]
    assert current_streak(check_ins, date(2024, 2, 14)) == 5


def test_current_streak_broken_by_a_gap():
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in (10, 11, 13, 14)]  # missing 12
    assert current_streak(check_ins, date(2024, 2, 14)) == 2


def test_current_streak_not_checked_in_today_but_yesterday_still_alive():
    check_ins = [make_check_in(logged_for=date(2024, 2, d)) for d in (12, 13)]
    assert current_streak(check_ins, date(2024, 2, 14)) == 2


def test_current_streak_missed_yesterday_and_today_is_zero():
    check_ins = [make_check_in(logged_for=date(2024, 2, 10))]
    assert current_streak(check_ins, date(2024, 2, 14)) == 0


def test_current_streak_dedupes_multiple_check_ins_same_day():
    check_ins = [
        make_check_in(logged_for=date(2024, 2, 14)),
        make_check_in(logged_for=date(2024, 2, 14)),
        make_check_in(logged_for=date(2024, 2, 13)),
    ]
    assert current_streak(check_ins, date(2024, 2, 14)) == 2


def test_best_streak_zero_check_ins():
    assert best_streak([]) == 0


def test_best_streak_finds_longest_run_in_the_past():
    check_ins = [
        make_check_in(logged_for=date(2024, 1, d)) for d in (1, 2, 3, 4, 5)
    ] + [
        make_check_in(logged_for=date(2024, 1, 20)),  # isolated day
    ]
    assert best_streak(check_ins) == 5


def test_best_streak_single_check_in_is_one():
    assert best_streak([make_check_in(logged_for=date(2024, 2, 14))]) == 1
