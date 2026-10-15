"""Tests for /goals endpoints (docs/api-contract.yaml `goals` tag)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta

from app.models import Category, GoalStatus, GoalType


def test_create_goal_success(client, make_user, auth_headers):
    user = make_user(email="goals1@example.com")

    resp = client.post(
        "/api/v1/goals",
        json={
            "title": "Bench press 80kg",
            "category": "fitness",
            "type": "numeric",
            "target_value": 80,
            "unit": "kg",
            "start_date": str(date.today()),
        },
        headers=auth_headers(user.id),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Bench press 80kg"
    assert body["category"] == "fitness"
    assert body["type"] == "numeric"
    assert body["status"] == "active"
    assert body["current_value"] == 0
    assert body["weight"] == 1
    assert body["milestones"] == []
    assert body["user_id"] == str(user.id)


def test_create_goal_requires_auth(client):
    resp = client.post(
        "/api/v1/goals",
        json={"title": "X", "category": "fitness", "type": "habit", "frequency_per_week": 3, "start_date": str(date.today())},
    )
    assert resp.status_code == 401


def test_create_goal_validation_error_missing_title(client, make_user, auth_headers):
    user = make_user(email="goals2@example.com")
    resp = client.post(
        "/api/v1/goals",
        json={"title": "", "category": "fitness", "type": "habit", "frequency_per_week": 3, "start_date": str(date.today())},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_numeric_goal_without_target_value_is_rejected(client, make_user, auth_headers):
    user = make_user(email="goals3@example.com")
    resp = client.post(
        "/api/v1/goals",
        json={"title": "No target", "category": "fitness", "type": "numeric", "start_date": str(date.today())},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_create_habit_goal_without_frequency_is_rejected(client, make_user, auth_headers):
    user = make_user(email="goals4@example.com")
    resp = client.post(
        "/api/v1/goals",
        json={"title": "No freq", "category": "study", "type": "habit", "start_date": str(date.today())},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_list_goals_scoped_to_user(client, make_user, make_goal, auth_headers):
    user_a = make_user(email="goalsA@example.com")
    user_b = make_user(email="goalsB@example.com")
    make_goal(user_id=user_a.id, title="A1", category=Category.FITNESS)
    make_goal(user_id=user_b.id, title="B1", category=Category.STUDY)

    resp = client.get("/api/v1/goals", headers=auth_headers(user_a.id))
    assert resp.status_code == 200
    titles = [g["title"] for g in resp.json()]
    assert titles == ["A1"]


def test_list_goals_filter_by_category_and_status(client, make_user, make_goal, auth_headers):
    user = make_user(email="goalsC@example.com")
    make_goal(user_id=user.id, title="Fit", category=Category.FITNESS)
    make_goal(user_id=user.id, title="Study", category=Category.STUDY, type=GoalType.HABIT)
    make_goal(
        user_id=user.id,
        title="Archived fit",
        category=Category.FITNESS,
        status=GoalStatus.ARCHIVED,
    )

    resp = client.get("/api/v1/goals", params={"category": "fitness"}, headers=auth_headers(user.id))
    assert resp.status_code == 200
    titles = {g["title"] for g in resp.json()}
    assert titles == {"Fit", "Archived fit"}

    resp2 = client.get(
        "/api/v1/goals", params={"category": "fitness", "status": "active"}, headers=auth_headers(user.id)
    )
    assert [g["title"] for g in resp2.json()] == ["Fit"]


def test_list_goals_requires_auth(client):
    resp = client.get("/api/v1/goals")
    assert resp.status_code == 401


def test_get_goal_detail_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="goalsD@example.com")
    goal = make_goal(user_id=user.id, title="Detail goal")

    resp = client.get(f"/api/v1/goals/{goal.id}", headers=auth_headers(user.id))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(goal.id)


def test_get_goal_not_found(client, make_user, auth_headers):
    user = make_user(email="goalsE@example.com")
    resp = client.get(f"/api/v1/goals/{uuid.uuid4()}", headers=auth_headers(user.id))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"]


def test_get_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="goalsF-owner@example.com")
    stranger = make_user(email="goalsF-stranger@example.com")
    goal = make_goal(user_id=owner.id, title="Owner goal")

    resp = client.get(f"/api/v1/goals/{goal.id}", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def test_get_goal_requires_auth(client, make_user, make_goal):
    user = make_user(email="goalsG@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.get(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 401


def test_update_goal_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="goalsH@example.com")
    goal = make_goal(user_id=user.id, title="Old title")

    resp = client.patch(
        f"/api/v1/goals/{goal.id}",
        json={"title": "New title", "weight": 2},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["title"] == "New title"
    assert body["weight"] == 2


def test_update_goal_empty_body_is_validation_error(client, make_user, make_goal, auth_headers):
    user = make_user(email="goalsI@example.com")
    goal = make_goal(user_id=user.id)

    resp = client.patch(f"/api/v1/goals/{goal.id}", json={}, headers=auth_headers(user.id))
    assert resp.status_code == 422


def test_update_goal_not_found(client, make_user, auth_headers):
    user = make_user(email="goalsJ@example.com")
    resp = client.patch(
        f"/api/v1/goals/{uuid.uuid4()}", json={"title": "X"}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 404


def test_update_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="goalsK-owner@example.com")
    stranger = make_user(email="goalsK-stranger@example.com")
    goal = make_goal(user_id=owner.id)

    resp = client.patch(
        f"/api/v1/goals/{goal.id}", json={"title": "Hacked"}, headers=auth_headers(stranger.id)
    )
    assert resp.status_code == 404


def test_update_goal_requires_auth(client, make_user, make_goal):
    user = make_user(email="goalsL@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.patch(f"/api/v1/goals/{goal.id}", json={"title": "X"})
    assert resp.status_code == 401


def test_delete_goal_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="goalsM@example.com")
    goal = make_goal(user_id=user.id)

    resp = client.delete(f"/api/v1/goals/{goal.id}", headers=auth_headers(user.id))
    assert resp.status_code == 204

    follow_up = client.get(f"/api/v1/goals/{goal.id}", headers=auth_headers(user.id))
    assert follow_up.status_code == 404


def test_delete_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="goalsN-owner@example.com")
    stranger = make_user(email="goalsN-stranger@example.com")
    goal = make_goal(user_id=owner.id)

    resp = client.delete(f"/api/v1/goals/{goal.id}", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def test_delete_goal_requires_auth(client, make_user, make_goal):
    user = make_user(email="goalsO@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.delete(f"/api/v1/goals/{goal.id}")
    assert resp.status_code == 401
