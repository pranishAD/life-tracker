"""Goal customisation: start_value (decrease goals), frequency_type
(daily / per_week / weekdays) and archived-goal exclusion.

Calendar used throughout: 2026-10-05, 10-12 and 10-19 are Mondays; 2026-10-14
is a Wednesday. MWF = Monday/Wednesday/Friday = ISO (1, 3, 5).
"""

from __future__ import annotations

from dataclasses import replace
from datetime import date, timedelta

import pytest

from scoring import (
    CategoryScoreInput,
    CheckIn,
    FrequencyType,
    Goal,
    GoalStatus,
    GoalType,
    WeightedScore,
    best_streak,
    category_score,
    consistency,
    current_streak,
    is_scorable_status,
    overall_score,
    pace,
    scheduled_weekdays,
    score_goal,
)

MWF = (1, 3, 5)


def ci(*days: date, effort: int | None = 3) -> list[CheckIn]:
    return [CheckIn(logged_for=d, effort_rating=effort) for d in days]


def oct(day: int) -> date:
    return date(2026, 10, day)


# ---------------------------------------------------------------- numeric ---


def decrease_goal(current: float | None, **kw) -> Goal:
    """5 km run time: 32 min -> 28 min, Oct 1 -> Oct 21 (20 days)."""
    base = dict(
        type=GoalType.NUMERIC,
        status=GoalStatus.ACTIVE,
        start_date=oct(1),
        created_at=oct(1),
        start_value=32.0,
        target_value=28.0,
        current_value=current,
        deadline=oct(21),
    )
    base.update(kw)
    return Goal(**base)


class TestDecreaseNumeric:
    def test_half_way_down_is_50_percent_progress(self):
        # Deadline reached -> expected = whole distance (4); actual = 2.
        assert pace(decrease_goal(30.0), [], [], oct(21)) == pytest.approx(0.5)

    def test_on_pace(self):
        # Half the time elapsed (Oct 11), half the distance done.
        assert pace(decrease_goal(30.0), [], [], oct(11)) == pytest.approx(1.0)

    def test_behind(self):
        # Half the time elapsed, a quarter of the distance done -> 1/2.
        assert pace(decrease_goal(31.0), [], [], oct(11)) == pytest.approx(0.5)

    def test_over_achieved_caps_at_1(self):
        assert pace(decrease_goal(26.0), [], [], oct(11)) == 1.0

    def test_wrong_direction_clamps_to_0(self):
        assert pace(decrease_goal(33.0), [], [], oct(11)) == 0.0

    def test_no_current_value_means_no_progress_yet(self):
        assert pace(decrease_goal(None), [], [], oct(11)) == 0.0

    def test_start_equals_target_falls_back_to_consistency(self):
        goal = decrease_goal(30.0, start_value=30.0, target_value=30.0, frequency_per_week=7)
        check_ins = ci(*(oct(d) for d in range(5, 12)))
        assert pace(goal, check_ins, [], oct(11)) == consistency(goal, check_ins, oct(11))
        assert pace(goal, [], [], oct(11)) == consistency(goal, [], oct(11)) == 0.0

    def test_increase_with_nonzero_start(self):
        # Bench 60 -> 80 kg: at the half-way date 70 kg is on pace, 65 is half.
        goal = decrease_goal(70.0, start_value=60.0, target_value=80.0)
        assert pace(goal, [], [], oct(11)) == pytest.approx(1.0)
        assert pace(replace(goal, current_value=65.0), [], [], oct(11)) == pytest.approx(0.5)
        assert pace(replace(goal, current_value=55.0), [], [], oct(11)) == 0.0

    def test_start_none_equals_start_zero(self):
        goal = decrease_goal(40.0, start_value=None, target_value=100.0)
        zero = replace(goal, start_value=0.0)
        assert pace(goal, [], [], oct(11)) == pace(zero, [], [], oct(11)) == pytest.approx(0.8)

    def test_negative_target_with_zero_start_keeps_legacy_fallback(self):
        # Legacy rule: target <= 0 -> consistency fallback. Kept for start 0.
        goal = decrease_goal(-2.0, start_value=0.0, target_value=-5.0)
        assert pace(goal, [], [], oct(11)) == consistency(goal, [], oct(11))

    def test_decrease_goal_full_score(self):
        r = score_goal(decrease_goal(30.0, frequency_per_week=7), ci(*(oct(d) for d in range(1, 12)), effort=5), [], oct(11))
        assert r.breakdown.pace == pytest.approx(1.0)
        assert r.breakdown.consistency == 1.0  # 11 of 11 live days in the window
        assert r.breakdown.momentum == pytest.approx(0.875)  # 7 vs 4 check-ins
        assert r.breakdown.effort == 1.0
        assert r.grade == "S"


# ----------------------------------------------------------------- habits ---


def habit(**kw) -> Goal:
    base = dict(
        type=GoalType.HABIT,
        status=GoalStatus.ACTIVE,
        start_date=date(2026, 9, 1),
        created_at=date(2026, 9, 1),
    )
    base.update(kw)
    return Goal(**base)


def _tuple(r):
    b = r.breakdown
    return (b.pace, b.consistency, b.momentum, b.effort, r.total, r.grade, r.current_streak, r.best_streak)


class TestDailyEqualsPerWeek7:
    @pytest.mark.parametrize("deadline", [None, date(2026, 12, 1), oct(10)])
    @pytest.mark.parametrize(
        "check_ins",
        [
            [],
            ci(oct(14), oct(13), oct(12), oct(9), oct(3)),
            ci(*(oct(1) + timedelta(days=i) for i in range(14))),
        ],
    )
    def test_same_result(self, deadline, check_ins):
        per_week_7 = habit(frequency_per_week=7, deadline=deadline)
        legacy_7 = replace(per_week_7, frequency_type=FrequencyType.PER_WEEK)
        # daily ignores frequency_per_week (even a stale/mismatched one).
        for fpw in (None, 3, 7):
            daily = habit(frequency_type=FrequencyType.DAILY, frequency_per_week=fpw, deadline=deadline)
            assert _tuple(score_goal(daily, check_ins, [], oct(14))) == _tuple(
                score_goal(per_week_7, check_ins, [], oct(14))
            ) == _tuple(score_goal(legacy_7, check_ins, [], oct(14)))

    def test_plain_string_frequency_type_is_accepted(self):
        daily = habit(frequency_type="daily", frequency_per_week=1)  # type: ignore[arg-type]
        assert consistency(daily, ci(oct(14)), oct(14)) == pytest.approx(1 / 14)


class TestWeekdaysConsistency:
    # Window Oct 1 (Thu) .. Oct 14 (Wed). MWF days in it:
    # Oct 2, 5, 7, 9, 12, 14 = 6 expected check-ins.

    def test_only_scheduled_days_expected(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF, frequency_per_week=3)
        assert consistency(goal, ci(oct(5), oct(7), oct(9)), oct(14)) == pytest.approx(3 / 6)

    def test_all_scheduled_days_hit_is_full(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF)
        assert consistency(goal, ci(oct(2), oct(5), oct(7), oct(9), oct(12), oct(14)), oct(14)) == 1.0

    def test_check_in_on_unscheduled_day_still_counts(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF)
        # Oct 10 is a Saturday.
        assert consistency(goal, ci(oct(5), oct(7), oct(9), oct(10)), oct(14)) == pytest.approx(4 / 6)

    def test_extra_check_ins_cap_at_1(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF)
        assert consistency(goal, ci(*(oct(d) for d in range(1, 15))), oct(14)) == 1.0

    def test_weekdays_wins_over_mismatched_frequency_per_week(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF, frequency_per_week=7)
        assert consistency(goal, ci(oct(5), oct(7), oct(9)), oct(14)) == pytest.approx(3 / 6)

    def test_window_with_zero_scheduled_days_expects_nothing(self):
        # Saturday-only habit started Monday Oct 12; today Wed Oct 14:
        # the live part of the window (Oct 12-14) has no Saturday.
        goal = habit(
            frequency_type=FrequencyType.WEEKDAYS,
            weekdays=(6,),
            start_date=oct(12),
            created_at=oct(12),
        )
        assert consistency(goal, [], oct(14)) == 1.0

    def test_window_clipped_by_start_date(self):
        # Started Mon Oct 12 -> only Oct 12 and Oct 14 are expected.
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF, start_date=oct(12), created_at=oct(12))
        assert consistency(goal, ci(oct(12)), oct(14)) == pytest.approx(1 / 2)

    def test_empty_weekdays_falls_back_to_frequency_per_week(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=(), frequency_per_week=3)
        legacy = habit(frequency_per_week=3)
        check_ins = ci(oct(5), oct(7), oct(9))
        assert consistency(goal, check_ins, oct(14)) == consistency(legacy, check_ins, oct(14))
        assert scheduled_weekdays(goal) is None

    def test_weekdays_ignored_unless_frequency_type_is_weekdays(self):
        goal = habit(frequency_type=FrequencyType.PER_WEEK, weekdays=MWF, frequency_per_week=7)
        assert scheduled_weekdays(goal) is None
        assert consistency(goal, ci(oct(14)), oct(14)) == pytest.approx(1 / 14)


class TestWeekdaysPace:
    # Mon Oct 5 -> Mon Nov 2 = 4 whole weeks -> 12 MWF days in total.
    # By Wed Oct 14 (today not counted yet): Oct 5, 7, 9, 12 = 4 expected.

    def goal(self, **kw) -> Goal:
        return habit(
            frequency_type=FrequencyType.WEEKDAYS,
            weekdays=MWF,
            start_date=oct(5),
            created_at=oct(5),
            deadline=date(2026, 11, 2),
            **kw,
        )

    def test_behind(self):
        assert pace(self.goal(), ci(oct(5), oct(7), oct(12)), [], oct(14)) == pytest.approx(3 / 4)

    def test_on_pace(self):
        assert pace(self.goal(), ci(oct(5), oct(7), oct(9), oct(12)), [], oct(14)) == 1.0

    def test_unscheduled_check_in_counts_towards_progress(self):
        # Sat Oct 10 instead of Fri Oct 9.
        assert pace(self.goal(), ci(oct(5), oct(7), oct(10), oct(12)), [], oct(14)) == 1.0

    def test_after_deadline_expects_whole_schedule(self):
        check_ins = ci(*(oct(5) + timedelta(days=i) for i in range(0, 28, 7)))  # 4 Mondays
        assert pace(self.goal(), check_ins, [], date(2026, 11, 20)) == pytest.approx(4 / 12)

    def test_no_scheduled_day_passed_yet_expects_nothing(self):
        # Started Tue Oct 13; today Wed Oct 14 (not over) -> nothing expected yet.
        goal = replace(self.goal(), start_date=oct(13), created_at=oct(13))
        assert pace(goal, [], [], oct(14)) == 1.0

    def test_no_scheduled_day_in_whole_life_falls_back_to_consistency(self):
        # Saturday-only, Mon Oct 12 -> Fri Oct 16: no Saturday ever scheduled.
        goal = replace(self.goal(), weekdays=(6,), start_date=oct(12), created_at=oct(12), deadline=oct(16))
        assert pace(goal, [], [], oct(14)) == consistency(goal, [], oct(14)) == 1.0

    def test_all_seven_weekdays_matches_daily(self):
        every_day = replace(self.goal(), weekdays=(1, 2, 3, 4, 5, 6, 7))
        daily = replace(self.goal(), frequency_type=FrequencyType.DAILY, weekdays=None)
        check_ins = ci(oct(5), oct(6), oct(8), oct(9), oct(12), oct(13))
        for today in (oct(9), oct(14), date(2026, 11, 5)):
            assert pace(every_day, check_ins, [], today) == pytest.approx(pace(daily, check_ins, [], today))
            assert consistency(every_day, check_ins, today) == pytest.approx(consistency(daily, check_ins, today))

    def test_no_deadline_uses_consistency(self):
        goal = replace(self.goal(), deadline=None)
        check_ins = ci(oct(5), oct(7), oct(12))
        assert pace(goal, check_ins, [], oct(14)) == consistency(goal, check_ins, oct(14))


class TestWeekdaysStreaks:
    MWF_RUN = (oct(5), oct(7), oct(9), oct(12))  # Mon, Wed, Fri, Mon

    def test_mon_wed_fri_mon_is_4(self):
        check_ins = ci(*self.MWF_RUN)
        assert current_streak(check_ins, oct(12), weekdays=MWF) == 4
        assert best_streak(check_ins, weekdays=MWF) == 4
        # Plain calendar-day streak for comparison: only 1.
        assert current_streak(check_ins, oct(12)) == 1

    def test_unscheduled_today_keeps_streak(self):
        # Tue Oct 13 is not scheduled -> the last scheduled day (Mon 12) counts.
        assert current_streak(ci(*self.MWF_RUN), oct(13), weekdays=MWF) == 4

    def test_scheduled_today_not_logged_yet_keeps_streak(self):
        # Wed Oct 14 is scheduled but isn't over -> streak runs through Mon 12.
        assert current_streak(ci(*self.MWF_RUN), oct(14), weekdays=MWF) == 4

    def test_missed_scheduled_day_breaks_current_streak(self):
        # Thu Oct 15: Wed Oct 14 was scheduled, is over, and was missed.
        check_ins = ci(*self.MWF_RUN)
        assert current_streak(check_ins, oct(15), weekdays=MWF) == 0
        assert best_streak(check_ins, weekdays=MWF) == 4

    def test_scheduled_today_logged_extends(self):
        assert current_streak(ci(*self.MWF_RUN, oct(14)), oct(14), weekdays=MWF) == 5

    def test_unscheduled_check_ins_neither_break_nor_extend(self):
        # Adding Sat Oct 10 and Sun Oct 11 changes nothing.
        check_ins = ci(*self.MWF_RUN, oct(10), oct(11))
        assert current_streak(check_ins, oct(12), weekdays=MWF) == 4
        assert best_streak(check_ins, weekdays=MWF) == 4

    def test_missed_scheduled_day_breaks_best_streak(self):
        check_ins = ci(oct(5), oct(7), oct(12))  # Fri Oct 9 missed
        assert best_streak(check_ins, weekdays=MWF) == 2
        assert current_streak(check_ins, oct(12), weekdays=MWF) == 1

    def test_only_unscheduled_check_ins(self):
        check_ins = ci(oct(10), oct(11))
        assert current_streak(check_ins, oct(12), weekdays=MWF) == 0
        assert best_streak(check_ins, weekdays=MWF) == 0

    def test_no_check_ins(self):
        assert current_streak([], oct(12), weekdays=MWF) == 0
        assert best_streak([], weekdays=MWF) == 0

    def test_empty_weekdays_is_calendar_day_rule(self):
        check_ins = ci(oct(12), oct(13))
        assert current_streak(check_ins, oct(13), weekdays=()) == current_streak(check_ins, oct(13)) == 2
        assert best_streak(check_ins, weekdays=()) == best_streak(check_ins) == 2

    def test_score_goal_uses_scheduled_streaks_for_weekdays_habits(self):
        goal = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF)
        r = score_goal(goal, ci(*self.MWF_RUN), [], oct(13))
        assert (r.current_streak, r.best_streak) == (4, 4)

    def test_daily_and_per_week_streaks_unchanged(self):
        check_ins = ci(*self.MWF_RUN)
        for goal in (habit(frequency_type=FrequencyType.DAILY), habit(frequency_per_week=3)):
            r = score_goal(goal, check_ins, [], oct(13))
            # Calendar-day rule: yesterday (Mon 12) logged, Sun 11 not -> 1.
            assert (r.current_streak, r.best_streak) == (1, 1)


# --------------------------------------------------------------- archived ---


def _category(goals: list[Goal], name: str, today: date) -> CategoryScoreInput:
    """What the backend does: filter with is_scorable_status, then aggregate."""
    scores = [
        WeightedScore(score=score_goal(g, [], [], today).total, weight=g.weight)
        for g in goals
        if is_scorable_status(g.status)
    ]
    return CategoryScoreInput(category=name, score=category_score(scores))


class TestArchivedExclusion:
    def test_archived_is_not_scorable(self):
        assert is_scorable_status(GoalStatus.ARCHIVED) is False
        assert is_scorable_status(GoalStatus.ACTIVE) is True
        assert is_scorable_status(GoalStatus.COMPLETED) is True

    def test_category_with_only_archived_goals_is_none_and_skipped(self):
        today = oct(14)
        archived = [
            habit(status=GoalStatus.ARCHIVED, frequency_type=FrequencyType.DAILY),
            Goal(GoalType.NUMERIC, GoalStatus.ARCHIVED, date(2026, 9, 1), date(2026, 9, 1), 100.0, 90.0),
        ]
        completed = Goal(GoalType.NUMERIC, GoalStatus.COMPLETED, date(2026, 9, 1), date(2026, 9, 1), 10.0, 10.0)

        only_archived = _category(archived, "Body", today)
        live = _category([completed], "Career", today)

        assert only_archived.score is None
        assert live.score == 90  # frozen completed score, no ratings -> effort 0
        assert overall_score([only_archived, live]) == 90
        assert overall_score([only_archived]) is None

    def test_archived_goal_does_not_drag_down_mixed_category(self):
        today = oct(14)
        good = Goal(GoalType.NUMERIC, GoalStatus.COMPLETED, date(2026, 9, 1), date(2026, 9, 1), 10.0, 10.0)
        archived_bad = Goal(GoalType.NUMERIC, GoalStatus.ARCHIVED, date(2026, 9, 1), date(2026, 9, 1), 100.0, 0.0)
        assert _category([good, archived_bad], "Mind", today).score == 90

    def test_score_goal_on_archived_scores_like_active(self):
        # Documented behaviour: score_goal doesn't filter by status.
        active = habit(frequency_type=FrequencyType.WEEKDAYS, weekdays=MWF, deadline=date(2026, 12, 1))
        archived = replace(active, status=GoalStatus.ARCHIVED)
        check_ins = ci(oct(5), oct(7), oct(12))
        assert score_goal(archived, check_ins, [], oct(14)) == score_goal(active, check_ins, [], oct(14))
