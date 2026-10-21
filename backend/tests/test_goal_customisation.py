"""Goal customisation (docs/api-contract.yaml 1.1.0): the new Goal fields on
POST/PATCH /goals, type rules, type lock, archive, starter milestones,
category ownership, decrease-goal scoring and the score regression pin for
pre-customisation-shaped goals.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal

import pytest

from app.models import FrequencyType, GoalStatus, GoalType
from scoring import CategoryScoreInput, overall_score

TODAY = date.today()
GOALS = "/api/v1/goals"


def _d(days: int) -> str:
    return str(TODAY + timedelta(days=days))


@pytest.fixture()
def user_ctx(make_user, auth_headers, category_id):
    """(user, headers, fitness category id as str)."""
    counter = {"n": 0}

    def _ctx(email: str | None = None):
        counter["n"] += 1
        user = make_user(email=email or f"gc{counter['n']}-{uuid.uuid4().hex[:8]}@example.com")
        return user, auth_headers(user.id), str(category_id(user.id, "fitness"))

    return _ctx


def _create(client, h, cid, **fields):
    body = {"title": "Goal", "category_id": cid, "start_date": str(TODAY), **fields}
    return client.post(GOALS, json=body, headers=h)


def _assert_422(resp, code: str = "VALIDATION_ERROR") -> None:
    assert resp.status_code == 422, resp.text
    assert resp.json()["error"]["code"] == code


def _backdated(days: int) -> datetime:
    return datetime.combine(TODAY - timedelta(days=days), time(12), tzinfo=timezone.utc)


# --------------------------------------------------------------------------
# Create: numeric
# --------------------------------------------------------------------------


def test_create_numeric_increase_with_start(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="numeric", start_value=60, target_value=80, unit="kg")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["start_value"] == 60
    assert body["current_value"] == 60  # starts at start_value
    assert body["direction"] == "increase"
    assert body["frequency_type"] is None and body["weekdays"] is None
    assert body["category"] == {"id": cid, "name": "Fitness", "emoji": "🏃", "color": "teal"}
    assert body["emoji"] is None and body["color"] is None and body["why"] is None


def test_create_numeric_decrease_auto_derived(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="numeric", start_value=32, target_value=28, unit="min")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["direction"] == "decrease"
    assert body["current_value"] == 32

    # Sent and agreeing is fine; target 0 is fine on a decrease goal.
    resp = _create(client, h, cid, type="numeric", start_value=5000, target_value=0, direction="decrease")
    assert resp.status_code == 201, resp.text
    assert resp.json()["target_value"] == 0


def test_create_numeric_rule_violations(client, user_ctx):
    _, h, cid = user_ctx()
    for fields in (
        {"start_value": 32, "target_value": 28, "direction": "increase"},  # mismatch
        {"start_value": 10, "target_value": 20, "direction": "decrease"},  # mismatch
        {"target_value": 50, "direction": "decrease"},  # default start 0 -> increase
        {"start_value": 10, "target_value": 10},  # start == target
        {"start_value": 10.001, "target_value": 10.004},  # equal after 2-dp rounding
        {"start_value": 10},  # no target
        {"start_value": -1, "target_value": 10},
        {"target_value": 10, "frequency_type": "daily"},  # habit-only field
        {"target_value": 10, "weekdays": [1]},
        {"target_value": 10, "milestones": [{"title": "x"}]},
    ):
        _assert_422(_create(client, h, cid, type="numeric", **fields))


# --------------------------------------------------------------------------
# Create: habit
# --------------------------------------------------------------------------


def test_create_habit_daily_sets_frequency_7(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="habit", frequency_type="daily", frequency_per_week=3)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["frequency_type"] == "daily"
    assert body["frequency_per_week"] == 7  # server-set, sent value ignored
    assert body["weekdays"] is None
    assert body["start_value"] is None and body["direction"] is None


def test_create_habit_per_week(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="habit", frequency_type="per_week", frequency_per_week=4)
    assert resp.status_code == 201, resp.text
    assert (resp.json()["frequency_type"], resp.json()["frequency_per_week"]) == ("per_week", 4)


def test_create_habit_weekdays_sorted(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="habit", frequency_type="weekdays", weekdays=[5, 1, 3])
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["weekdays"] == [1, 3, 5]
    assert body["frequency_per_week"] == 3


def test_create_habit_rule_violations(client, user_ctx):
    _, h, cid = user_ctx()
    for fields in (
        {},  # no frequency_type
        {"frequency_per_week": 3},  # no frequency_type
        {"frequency_type": "per_week"},  # needs frequency_per_week
        {"frequency_type": "weekdays"},  # needs weekdays
        {"frequency_type": "weekdays", "weekdays": []},
        {"frequency_type": "weekdays", "weekdays": [1, 1, 3]},  # duplicates
        {"frequency_type": "weekdays", "weekdays": [0]},
        {"frequency_type": "weekdays", "weekdays": [8]},
        {"frequency_type": "weekdays", "weekdays": [1, 2, 3, 4, 5, 6, 7, 1]},
        {"frequency_type": "per_week", "frequency_per_week": 3, "weekdays": [1]},
        {"frequency_type": "daily", "weekdays": [1, 2]},
        {"frequency_type": "daily", "start_value": 0},  # numeric-only field
        {"frequency_type": "daily", "direction": "increase"},
        {"frequency_type": "sometimes"},
    ):
        _assert_422(_create(client, h, cid, type="habit", **fields))


# --------------------------------------------------------------------------
# Create: milestone
# --------------------------------------------------------------------------


def test_create_milestone_requires_deadline(client, user_ctx):
    _, h, cid = user_ctx()
    _assert_422(_create(client, h, cid, type="milestone"))
    assert _create(client, h, cid, type="milestone", deadline=_d(30)).status_code == 201


def test_create_milestone_starter_subtasks_keep_order(client, user_ctx):
    _, h, cid = user_ctx()
    titles = ["Zeta outline", "Alpha research", "Middle draft", "Beta review", "Ship"]
    resp = _create(
        client, h, cid, type="milestone", deadline=_d(30),
        milestones=[{"title": t} for t in titles],
    )
    assert resp.status_code == 201, resp.text
    goal = resp.json()
    assert [m["title"] for m in goal["milestones"]] == titles
    assert all(m["is_done"] is False and m["goal_id"] == goal["id"] for m in goal["milestones"])

    again = client.get(f"{GOALS}/{goal['id']}", headers=h).json()
    assert [m["title"] for m in again["milestones"]] == titles


def test_create_milestone_starter_subtask_validation(client, user_ctx):
    _, h, cid = user_ctx()
    _assert_422(_create(client, h, cid, type="milestone", deadline=_d(30), milestones=[{"title": ""}]))
    _assert_422(
        _create(client, h, cid, type="milestone", deadline=_d(30), milestones=[{"title": "x"}] * 51)
    )
    _assert_422(
        _create(
            client, h, cid, type="milestone", deadline=_d(30),
            milestones=[{"title": "x", "due_date": "2101-01-01"}],
        )
    )


# --------------------------------------------------------------------------
# Create: identity / why / dates / category
# --------------------------------------------------------------------------


def test_create_goal_emoji_and_colour(client, user_ctx):
    _, h, cid = user_ctx()
    resp = _create(client, h, cid, type="habit", frequency_type="daily", emoji="🏋️‍♂️", color="cyan")
    assert resp.status_code == 201, resp.text
    assert (resp.json()["emoji"], resp.json()["color"]) == ("🏋️‍♂️", "cyan")

    for fields in ({"emoji": ""}, {"emoji": "🏋 "}, {"emoji": "\t"}, {"emoji": "x" * 17}, {"color": "gold"}):
        _assert_422(_create(client, h, cid, type="habit", frequency_type="daily", **fields))


def test_create_goal_why_trimmed_and_limited(client, user_ctx):
    _, h, cid = user_ctx()
    base = {"type": "habit", "frequency_type": "daily"}
    resp = _create(client, h, cid, why="  Play futsal again  ", **base)
    assert resp.json()["why"] == "Play futsal again"
    assert _create(client, h, cid, why="   ", **base).json()["why"] is None
    assert _create(client, h, cid, why="w" * 140, **base).status_code == 201
    _assert_422(_create(client, h, cid, why="w" * 141, **base))


def test_create_goal_start_date_after_deadline(client, user_ctx):
    _, h, cid = user_ctx()
    _assert_422(
        _create(client, h, cid, type="habit", frequency_type="daily", start_date=_d(5), deadline=_d(1))
    )
    assert (
        _create(client, h, cid, type="habit", frequency_type="daily", start_date=_d(1), deadline=_d(1)).status_code
        == 201
    )


def test_create_goal_category_must_be_own(client, user_ctx, category_id):
    _, h, _ = user_ctx()
    other, _, other_cid = user_ctx()
    for cid in (other_cid, str(uuid.uuid4())):
        _assert_422(_create(client, h, cid, type="habit", frequency_type="daily"), "INVALID_CATEGORY")
    _assert_422(_create(client, h, "nope", type="habit", frequency_type="daily"))


def test_create_goal_in_custom_category(client, user_ctx):
    _, h, _ = user_ctx()
    cat = client.post(
        "/api/v1/categories", json={"name": "Music", "emoji": "🎸", "color": "pink"}, headers=h
    ).json()
    resp = _create(client, h, cat["id"], type="habit", frequency_type="daily")
    assert resp.status_code == 201
    assert resp.json()["category"]["name"] == "Music"


# --------------------------------------------------------------------------
# GET /goals?category_id
# --------------------------------------------------------------------------


def test_list_goals_category_filter_foreign_or_unknown_is_empty(client, make_goal, user_ctx, category_id):
    user, h, cid = user_ctx()
    other, _, other_cid = user_ctx()
    make_goal(user_id=user.id, title="Mine")
    make_goal(user_id=other.id, title="Theirs")

    assert [g["title"] for g in client.get(GOALS, params={"category_id": cid}, headers=h).json()] == ["Mine"]
    assert client.get(GOALS, params={"category_id": other_cid}, headers=h).json() == []
    assert client.get(GOALS, params={"category_id": str(uuid.uuid4())}, headers=h).json() == []
    assert client.get(GOALS, params={"category_id": "x"}, headers=h).status_code == 422


def test_check_in_count(client, make_goal, user_ctx):
    user, h, _ = user_ctx()
    goal = make_goal(user_id=user.id, type=GoalType.HABIT)
    for k in (1, 2):
        client.post(
            f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 3, "logged_for": _d(-k)}, headers=h
        )
    assert client.get(f"{GOALS}/{goal.id}", headers=h).json()["check_in_count"] == 2
    listed = client.get(GOALS, headers=h).json()
    assert listed[0]["check_in_count"] == 2


# --------------------------------------------------------------------------
# PATCH
# --------------------------------------------------------------------------


def test_patch_target_below_start_rederives_direction(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="numeric", start_value=30, target_value=40).json()
    assert goal["direction"] == "increase"

    resp = client.patch(f"{GOALS}/{goal['id']}", json={"target_value": 25}, headers=h)
    assert resp.status_code == 200, resp.text
    assert resp.json()["direction"] == "decrease"

    _assert_422(client.patch(f"{GOALS}/{goal['id']}", json={"direction": "increase"}, headers=h))
    _assert_422(client.patch(f"{GOALS}/{goal['id']}", json={"target_value": 30}, headers=h))
    resp = client.patch(f"{GOALS}/{goal['id']}", json={"target_value": 35, "direction": "increase"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["direction"] == "increase"


def test_patch_start_value_moves_current_value_until_first_check_in(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="numeric", start_value=30, target_value=40).json()
    resp = client.patch(f"{GOALS}/{goal['id']}", json={"start_value": 20}, headers=h)
    assert resp.json()["current_value"] == 20

    ci = client.post(
        f"{GOALS}/{goal['id']}/check-ins", json={"effort_rating": 3, "logged_for": str(TODAY), "value": 33}, headers=h
    ).json()
    assert client.get(f"{GOALS}/{goal['id']}", headers=h).json()["current_value"] == 33
    # Deleting the only valued check-in goes back to start_value, not 0.
    client.delete(f"/api/v1/check-ins/{ci['id']}", headers=h)
    assert client.get(f"{GOALS}/{goal['id']}", headers=h).json()["current_value"] == 20


def test_patch_cross_type_fields_rejected(client, user_ctx):
    _, h, cid = user_ctx()
    numeric = _create(client, h, cid, type="numeric", target_value=10).json()
    habit = _create(client, h, cid, type="habit", frequency_type="daily").json()
    _assert_422(client.patch(f"{GOALS}/{numeric['id']}", json={"frequency_type": "daily"}, headers=h))
    _assert_422(client.patch(f"{GOALS}/{numeric['id']}", json={"weekdays": [1]}, headers=h))
    _assert_422(client.patch(f"{GOALS}/{habit['id']}", json={"start_value": 1}, headers=h))
    _assert_422(client.patch(f"{GOALS}/{habit['id']}", json={"direction": "increase"}, headers=h))
    # frequency_per_week stays allowed on a non-habit (consistency expectation).
    resp = client.patch(f"{GOALS}/{numeric['id']}", json={"frequency_per_week": 2}, headers=h)
    assert resp.status_code == 200 and resp.json()["frequency_per_week"] == 2


def test_patch_habit_schedule_changes(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="habit", frequency_type="weekdays", weekdays=[1, 3]).json()
    url = f"{GOALS}/{goal['id']}"

    resp = client.patch(url, json={"weekdays": [7, 2, 4]}, headers=h)
    assert (resp.json()["weekdays"], resp.json()["frequency_per_week"]) == ([2, 4, 7], 3)

    resp = client.patch(url, json={"frequency_type": "per_week", "frequency_per_week": 5}, headers=h)
    body = resp.json()
    assert (body["frequency_type"], body["frequency_per_week"], body["weekdays"]) == ("per_week", 5, None)

    resp = client.patch(url, json={"frequency_type": "daily"}, headers=h)
    assert (resp.json()["frequency_type"], resp.json()["frequency_per_week"]) == ("daily", 7)

    _assert_422(client.patch(url, json={"frequency_type": "weekdays"}, headers=h))  # no days
    _assert_422(client.patch(url, json={"frequency_type": None}, headers=h))
    _assert_422(client.patch(url, json={"weekdays": [1, 1]}, headers=h))


def test_patch_type_change_clears_old_fields(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="numeric", start_value=5, target_value=10, unit="km").json()
    url = f"{GOALS}/{goal['id']}"

    _assert_422(client.patch(url, json={"type": "habit"}, headers=h))  # needs frequency_type
    resp = client.patch(url, json={"type": "habit", "frequency_type": "weekdays", "weekdays": [1, 5]}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    for name in ("start_value", "target_value", "current_value", "unit", "direction"):
        assert body[name] is None, name
    assert (body["frequency_type"], body["weekdays"], body["frequency_per_week"]) == ("weekdays", [1, 5], 2)

    resp = client.patch(url, json={"type": "numeric", "target_value": 12}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["frequency_type"], body["weekdays"], body["frequency_per_week"]) == (None, None, None)
    assert (body["start_value"], body["current_value"], body["direction"]) == (0, 0, "increase")

    # Back to habit, then to milestone keeping a sent frequency_per_week.
    client.patch(url, json={"type": "habit", "frequency_type": "daily"}, headers=h)
    resp = client.patch(url, json={"type": "milestone", "frequency_per_week": 2}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["type"], body["frequency_type"], body["frequency_per_week"]) == ("milestone", None, 2)


def test_patch_type_locked_after_check_in(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="habit", frequency_type="daily").json()
    url = f"{GOALS}/{goal['id']}"
    client.post(f"{url}/check-ins", json={"effort_rating": 4, "logged_for": str(TODAY)}, headers=h)

    resp = client.patch(url, json={"type": "numeric", "target_value": 10}, headers=h)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "TYPE_LOCKED"
    # Sending the same type is not a change.
    assert client.patch(url, json={"type": "habit", "title": "Same"}, headers=h).status_code == 200


def test_patch_archive_sets_and_clears_archived_at(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="habit", frequency_type="daily").json()
    url = f"{GOALS}/{goal['id']}"

    archived = client.patch(url, json={"status": "archived"}, headers=h).json()
    assert archived["status"] == "archived"
    assert archived["archived_at"] is not None
    # Re-archiving keeps the original timestamp.
    again = client.patch(url, json={"status": "archived", "title": "Still"}, headers=h).json()
    assert again["archived_at"] == archived["archived_at"]

    restored = client.patch(url, json={"status": "active"}, headers=h).json()
    assert restored["archived_at"] is None
    completed = client.patch(url, json={"status": "completed"}, headers=h).json()
    assert completed["archived_at"] is None


def test_patch_identity_why_dates(client, user_ctx):
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="habit", frequency_type="daily", deadline=_d(10)).json()
    url = f"{GOALS}/{goal['id']}"

    resp = client.patch(url, json={"emoji": "🔥", "color": "rose", "why": " because "}, headers=h)
    assert (resp.json()["emoji"], resp.json()["color"], resp.json()["why"]) == ("🔥", "rose", "because")
    resp = client.patch(url, json={"emoji": None, "color": None, "why": None}, headers=h)
    assert (resp.json()["emoji"], resp.json()["color"], resp.json()["why"]) == (None, None, None)

    assert client.patch(url, json={"start_date": _d(-3)}, headers=h).json()["start_date"] == _d(-3)
    _assert_422(client.patch(url, json={"start_date": _d(11)}, headers=h))
    _assert_422(client.patch(url, json={"deadline": _d(-4)}, headers=h))
    _assert_422(client.patch(url, json={"why": "w" * 141}, headers=h))
    _assert_422(client.patch(url, json={"emoji": "a b"}, headers=h))
    for name in ("title", "category_id", "type", "start_date", "weight", "status"):
        _assert_422(client.patch(url, json={name: None}, headers=h))


def test_patch_category_must_be_own(client, user_ctx, category_id):
    user, h, cid = user_ctx()
    other, _, other_cid = user_ctx()
    goal = _create(client, h, cid, type="habit", frequency_type="daily").json()
    url = f"{GOALS}/{goal['id']}"

    _assert_422(client.patch(url, json={"category_id": other_cid}, headers=h), "INVALID_CATEGORY")
    _assert_422(client.patch(url, json={"category_id": str(uuid.uuid4())}, headers=h), "INVALID_CATEGORY")

    study = str(category_id(user.id, "study"))
    resp = client.patch(url, json={"category_id": study}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["category_id"] == study
    assert resp.json()["category"]["name"] == "Study"


# --------------------------------------------------------------------------
# Scoring through the API
# --------------------------------------------------------------------------


def test_decrease_goal_scoring(client, make_goal, user_ctx):
    """start 32 -> target 28 min, halfway through its timeline: 31 is 1 of 4
    minutes = 25% done vs 50% expected -> pace 0.5. With no check-in the goal
    is at its start (pace 0), never "over-achieved" by a current_value of 0."""
    user, h, _ = user_ctx()
    goal = make_goal(
        user_id=user.id, type=GoalType.NUMERIC, start_value=Decimal("32"), target_value=Decimal("28"),
        current_value=Decimal("32"), unit="min", start_date=TODAY - timedelta(days=10),
        deadline=TODAY + timedelta(days=10), created_at=_backdated(10),
    )
    assert client.get(f"{GOALS}/{goal.id}", headers=h).json()["direction"] == "decrease"
    score_url = f"{GOALS}/{goal.id}/score"
    assert client.get(score_url, headers=h).json()["pace"] == 0

    ci = client.post(
        f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 3, "logged_for": _d(-2), "value": 31}, headers=h
    ).json()
    assert client.get(score_url, headers=h).json()["pace"] == pytest.approx(0.5)

    client.post(f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 3, "logged_for": _d(-1), "value": 34}, headers=h)
    assert client.get(score_url, headers=h).json()["pace"] == 0  # wrong way

    client.post(f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 3, "logged_for": str(TODAY), "value": 27}, headers=h)
    assert client.get(score_url, headers=h).json()["pace"] == 1.0  # past target, capped

    client.delete(f"/api/v1/check-ins/{ci['id']}", headers=h)
    assert client.get(f"{GOALS}/{goal.id}", headers=h).json()["current_value"] == 27


def test_weekdays_habit_scores_through_api(client, make_goal, user_ctx):
    user, h, _ = user_ctx()
    goal = make_goal(
        user_id=user.id, type=GoalType.HABIT, frequency_type=FrequencyType.WEEKDAYS,
        weekdays=[1, 2, 3, 4, 5, 6, 7], start_date=TODAY - timedelta(days=14), created_at=_backdated(14),
    )
    for k in range(0, 14):
        client.post(f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 5, "logged_for": _d(-k)}, headers=h)
    body = client.get(f"{GOALS}/{goal.id}/score", headers=h).json()
    assert body["consistency"] == 1.0
    assert body["grade"] != "Calibrating"


# Expected values computed with the PRE-customisation scoring engine
# (git HEAD 9c7a8a6 backend/scoring, progress = current / target, habits by
# frequency_per_week) for exactly these inputs, all relative to today:
#   numeric: start 0 (legacy), target 100, start_date -20, deadline +40,
#            check-ins (day, value, effort) (-18,10,3) (-10,15,4) (-3,20,2) (-1,22,4)
#   habit:   per_week 4, start_date -20, deadline +40,
#            check-ins (day, effort) (-19,3) (-15,2) (-12,5) (-8,4) (-6,4) (-2,4)
LEGACY_NUMERIC = {"pace": 0.66, "consistency": 1.0, "momentum": 1.0, "effort": 0.6666666666666667, "total": 83, "grade": "A"}
LEGACY_HABIT = {"pace": 0.525, "consistency": 0.5, "momentum": 0.5, "effort": 0.85, "total": 54, "grade": "C"}


def test_legacy_shaped_goals_score_exactly_as_before(client, make_goal, user_ctx):
    user, h, _ = user_ctx()
    common = dict(user_id=user.id, start_date=TODAY - timedelta(days=20),
                  deadline=TODAY + timedelta(days=40), created_at=_backdated(20))
    numeric = make_goal(type=GoalType.NUMERIC, target_value=Decimal("100"), current_value=Decimal("0"), **common)
    habit = make_goal(type=GoalType.HABIT, frequency_per_week=4, **common)
    # The shape migration 0003 backfills for old goals.
    n = client.get(f"{GOALS}/{numeric.id}", headers=h).json()
    assert (n["start_value"], n["direction"]) == (0, "increase")
    assert client.get(f"{GOALS}/{habit.id}", headers=h).json()["frequency_type"] == "per_week"

    for day, value, effort in [(-18, 10, 3), (-10, 15, 4), (-3, 20, 2), (-1, 22, 4)]:
        client.post(f"{GOALS}/{numeric.id}/check-ins",
                    json={"effort_rating": effort, "logged_for": _d(day), "value": value}, headers=h)
    for day, effort in [(-19, 3), (-15, 2), (-12, 5), (-8, 4), (-6, 4), (-2, 4)]:
        client.post(f"{GOALS}/{habit.id}/check-ins",
                    json={"effort_rating": effort, "logged_for": _d(day)}, headers=h)

    for goal, expected in ((numeric, LEGACY_NUMERIC), (habit, LEGACY_HABIT)):
        body = client.get(f"{GOALS}/{goal.id}/score", headers=h).json()
        for key in ("pace", "consistency", "momentum", "effort"):
            assert body[key] == pytest.approx(expected[key], abs=1e-12), (goal.type, key)
        assert (body["total"], body["grade"]) == (expected["total"], expected["grade"])


# --------------------------------------------------------------------------
# Dashboard with categories
# --------------------------------------------------------------------------


def test_dashboard_lists_every_category_in_sort_order(client, user_ctx):
    _, h, _ = user_ctx()
    music = client.post(
        "/api/v1/categories", json={"name": "Music", "emoji": "🎸", "color": "pink"}, headers=h
    ).json()
    ids = [c["id"] for c in client.get("/api/v1/categories", headers=h).json()]
    order = [music["id"]] + [i for i in ids if i != music["id"]]
    client.patch("/api/v1/categories/order", json={"category_ids": order}, headers=h)

    body = client.get("/api/v1/dashboard", headers=h).json()
    assert [c["category"]["id"] for c in body["category_scores"]] == order
    assert body["category_scores"][0]["category"] == {
        "id": music["id"], "name": "Music", "emoji": "🎸", "color": "pink"
    }
    assert all(c["score"] is None and c["has_active_goals"] is False for c in body["category_scores"])


def test_dashboard_overall_uses_category_weights_by_id(client, make_goal, user_ctx, category_id):
    user, h, _ = user_ctx()
    common = dict(user_id=user.id, start_date=TODAY - timedelta(days=20), created_at=_backdated(20),
                  type=GoalType.HABIT, frequency_per_week=7)
    good = make_goal(category="fitness", **common)
    bad = make_goal(category="study", **common)
    for k in range(1, 15):
        client.post(f"{GOALS}/{good.id}/check-ins", json={"effort_rating": 5, "logged_for": _d(-k)}, headers=h)
    client.post(f"{GOALS}/{bad.id}/check-ins", json={"effort_rating": 1, "logged_for": _d(-1)}, headers=h)

    fitness, study = str(category_id(user.id, "fitness")), str(category_id(user.id, "study"))
    client.put("/api/v1/settings/category-weights",
               json={"weights": [{"category_id": fitness, "weight": 3}]}, headers=h)

    body = client.get("/api/v1/dashboard", headers=h).json()
    scores = {c["category"]["id"]: c["score"] for c in body["category_scores"]}
    assert scores[fitness] != scores[study]
    expected = overall_score([
        CategoryScoreInput(category="f", score=scores[fitness], weight=3.0),
        CategoryScoreInput(category="s", score=scores[study], weight=1.0),
    ])
    assert body["overall_score"] == expected


def test_archived_goal_excluded_from_dashboard(client, make_goal, user_ctx, category_id):
    user, h, _ = user_ctx()
    goal = make_goal(
        user_id=user.id, type=GoalType.HABIT, frequency_per_week=7, category="career",
        start_date=TODAY - timedelta(days=20), created_at=_backdated(20),
    )
    client.post(f"{GOALS}/{goal.id}/check-ins", json={"effort_rating": 1, "logged_for": _d(-1)}, headers=h)

    before = client.get("/api/v1/dashboard", headers=h).json()
    career = str(category_id(user.id, "career"))
    assert {c["category"]["id"]: c["score"] for c in before["category_scores"]}[career] is not None
    assert [a["goal_id"] for a in before["attention"]] == [str(goal.id)]

    client.patch(f"{GOALS}/{goal.id}", json={"status": "archived"}, headers=h)
    after = client.get("/api/v1/dashboard", headers=h).json()
    by_id = {c["category"]["id"]: c for c in after["category_scores"]}
    assert by_id[career]["score"] is None
    assert by_id[career]["has_active_goals"] is False
    assert after["overall_score"] is None
    assert after["attention"] == []
    assert all(p["score"] is None for p in after["trend"])


def test_goal_status_enum_unchanged(client, make_goal, user_ctx):
    user, h, _ = user_ctx()
    make_goal(user_id=user.id, status=GoalStatus.ARCHIVED)
    body = client.get(GOALS, params={"status": "archived"}, headers=h).json()
    assert len(body) == 1 and body[0]["archived_at"] is not None


def test_patch_type_change_accepts_explicit_nulls_for_old_fields(client, user_ctx):
    """Contract PATCH note: on a type change the frontend sends explicit null
    for the old type's fields; null = clear, never a 422. Null on a field
    the resulting type requires is a 422."""
    _, h, cid = user_ctx()
    goal = _create(client, h, cid, type="numeric", start_value=5, target_value=10, unit="km").json()
    url = f"{GOALS}/{goal['id']}"

    resp = client.patch(
        url,
        json={"type": "habit", "frequency_type": "weekdays", "weekdays": [2, 4],
              "start_value": None, "target_value": None, "unit": None, "direction": None},
        headers=h,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["start_value"], body["target_value"], body["unit"], body["direction"]) == (None,) * 4
    assert (body["weekdays"], body["frequency_per_week"]) == ([2, 4], 2)

    # Habit leaving "Pick days": weekdays null is accepted and cleared.
    resp = client.patch(
        url, json={"frequency_type": "per_week", "frequency_per_week": 3, "weekdays": None}, headers=h
    )
    assert resp.status_code == 200, resp.text
    assert (resp.json()["frequency_type"], resp.json()["weekdays"]) == ("per_week", None)

    # Required by the resulting type -> 422.
    _assert_422(client.patch(url, json={"frequency_type": None}, headers=h))
    _assert_422(client.patch(url, json={"frequency_per_week": None}, headers=h))
    _assert_422(client.patch(url, json={"type": "numeric", "target_value": None}, headers=h))

    # Back to numeric with explicit nulls for the habit fields.
    resp = client.patch(
        url,
        json={"type": "numeric", "target_value": 8, "start_value": 12,
              "frequency_type": None, "weekdays": None, "frequency_per_week": None},
        headers=h,
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["frequency_type"], body["weekdays"], body["frequency_per_week"]) == (None, None, None)
    assert (body["direction"], body["current_value"]) == ("decrease", 12)

    # And to milestone with numeric nulls (milestone needs no deadline on PATCH).
    resp = client.patch(
        url,
        json={"type": "milestone", "start_value": None, "target_value": None, "unit": None, "direction": None},
        headers=h,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["type"] == "milestone"


def test_list_goals_check_in_count_and_category_goal_count_include_archived(
    client, make_goal, user_ctx
):
    user, h, _ = user_ctx()
    archived = make_goal(user_id=user.id, type=GoalType.HABIT, category="custom")
    client.post(f"{GOALS}/{archived.id}/check-ins", json={"effort_rating": 3, "logged_for": _d(-1)}, headers=h)
    client.patch(f"{GOALS}/{archived.id}", json={"status": "archived"}, headers=h)
    make_goal(user_id=user.id, category="custom")

    listed = {g["id"]: g for g in client.get(GOALS, headers=h).json()}
    assert listed[str(archived.id)]["check_in_count"] == 1
    assert all("check_in_count" in g for g in listed.values())
    counts = {c["name"]: c["goal_count"] for c in client.get("/api/v1/categories", headers=h).json()}
    assert counts["Custom"] == 2
