"""Tests for /goals/{goalId}/check-ins and /check-ins/{checkInId}
(docs/api-contract.yaml `check-ins` tag, US-11/12, EC-02/EC-03)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.models import GoalType


def test_create_check_in_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci1@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 4, "logged_for": str(date.today())},
        headers=auth_headers(user.id),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["effort_rating"] == 4
    assert body["goal_id"] == str(goal.id)
    assert body["value"] is None


def test_create_check_in_updates_numeric_goal_current_value(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci2@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.NUMERIC, target_value=Decimal("100"))

    resp = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"value": 55, "effort_rating": 3, "logged_for": str(date.today())},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 201

    goal_resp = client.get(f"/api/v1/goals/{goal.id}", headers=auth_headers(user.id))
    assert goal_resp.json()["current_value"] == 55


def test_backdated_check_in_does_not_override_newer_current_value(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci3@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.NUMERIC, target_value=Decimal("100"))
    headers = auth_headers(user.id)

    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"value": 60, "effort_rating": 3, "logged_for": str(date.today())},
        headers=headers,
    )
    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"value": 40, "effort_rating": 3, "logged_for": str(date.today() - timedelta(days=5))},
        headers=headers,
    )

    goal_resp = client.get(f"/api/v1/goals/{goal.id}", headers=headers)
    assert goal_resp.json()["current_value"] == 60


def test_create_check_in_validation_error_bad_effort_rating(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci4@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 9, "logged_for": str(date.today())},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_create_check_in_requires_auth(client, make_user, make_goal):
    user = make_user(email="ci5@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    resp = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today())},
    )
    assert resp.status_code == 401


def test_create_check_in_on_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ci6-owner@example.com")
    stranger = make_user(email="ci6-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.HABIT, target_value=None)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today())},
        headers=auth_headers(stranger.id),
    )
    assert resp.status_code == 404


def test_two_check_ins_same_day_both_saved(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci7@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    headers = auth_headers(user.id)
    today = str(date.today())

    client.post(f"/api/v1/goals/{goal.id}/check-ins", json={"effort_rating": 3, "logged_for": today}, headers=headers)
    client.post(f"/api/v1/goals/{goal.id}/check-ins", json={"effort_rating": 5, "logged_for": today}, headers=headers)

    resp = client.get(f"/api/v1/goals/{goal.id}/check-ins", headers=headers)
    assert resp.status_code == 200
    assert len(resp.json()) == 2


def test_list_check_ins_newest_first(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci8@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    headers = auth_headers(user.id)

    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today() - timedelta(days=2))},
        headers=headers,
    )
    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today())},
        headers=headers,
    )

    resp = client.get(f"/api/v1/goals/{goal.id}/check-ins", headers=headers)
    dates = [c["logged_for"] for c in resp.json()]
    assert dates == sorted(dates, reverse=True)


def test_list_check_ins_requires_auth(client, make_user, make_goal):
    user = make_user(email="ci9@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    resp = client.get(f"/api/v1/goals/{goal.id}/check-ins")
    assert resp.status_code == 401


def test_list_check_ins_on_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ci10-owner@example.com")
    stranger = make_user(email="ci10-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.HABIT, target_value=None)

    resp = client.get(f"/api/v1/goals/{goal.id}/check-ins", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def test_delete_check_in_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci11@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    headers = auth_headers(user.id)

    created = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today())},
        headers=headers,
    ).json()

    resp = client.delete(f"/api/v1/check-ins/{created['id']}", headers=headers)
    assert resp.status_code == 204

    list_resp = client.get(f"/api/v1/goals/{goal.id}/check-ins", headers=headers)
    assert list_resp.json() == []


def test_delete_check_in_resets_numeric_current_value(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci12@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.NUMERIC, target_value=Decimal("100"))
    headers = auth_headers(user.id)

    created = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"value": 42, "effort_rating": 3, "logged_for": str(date.today())},
        headers=headers,
    ).json()

    client.delete(f"/api/v1/check-ins/{created['id']}", headers=headers)

    goal_resp = client.get(f"/api/v1/goals/{goal.id}", headers=headers)
    assert goal_resp.json()["current_value"] == 0


def test_delete_check_in_requires_auth(client, make_user, make_goal):
    user = make_user(email="ci13@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    resp = client.delete(f"/api/v1/check-ins/{uuid.uuid4()}")
    assert resp.status_code == 401


def test_delete_other_users_check_in_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ci14-owner@example.com")
    stranger = make_user(email="ci14-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.HABIT, target_value=None)

    created = client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 3, "logged_for": str(date.today())},
        headers=auth_headers(owner.id),
    ).json()

    resp = client.delete(f"/api/v1/check-ins/{created['id']}", headers=auth_headers(stranger.id))
    assert resp.status_code == 404
