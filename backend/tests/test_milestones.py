"""Tests for /goals/{goalId}/milestones and /milestones/{milestoneId}
(docs/api-contract.yaml `milestones` tag, US-10)."""

from __future__ import annotations

import uuid
from datetime import date

from app.models import GoalType


def test_create_milestone_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms1@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/milestones",
        json={"title": "Design wireframes", "due_date": str(date.today())},
        headers=auth_headers(user.id),
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] == "Design wireframes"
    assert body["is_done"] is False
    assert body["goal_id"] == str(goal.id)


def test_create_milestone_validation_error(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms2@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": ""}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 422


def test_create_milestone_requires_auth(client, make_user, make_goal):
    user = make_user(email="ms3@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    resp = client.post(f"/api/v1/goals/{goal.id}/milestones", json={"title": "X"})
    assert resp.status_code == 401


def test_create_milestone_on_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ms4-owner@example.com")
    stranger = make_user(email="ms4-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.MILESTONE)

    resp = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "X"}, headers=auth_headers(stranger.id)
    )
    assert resp.status_code == 404


def test_create_milestone_on_nonexistent_goal_is_404(client, make_user, auth_headers):
    user = make_user(email="ms5@example.com")
    resp = client.post(
        f"/api/v1/goals/{uuid.uuid4()}/milestones", json={"title": "X"}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 404


def test_update_milestone_marks_done_and_sets_done_at(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms6@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    created = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "Task"}, headers=auth_headers(user.id)
    ).json()

    resp = client.patch(
        f"/api/v1/milestones/{created['id']}", json={"is_done": True}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_done"] is True
    assert body["done_at"] is not None


def test_update_milestone_validation_error_empty_body(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms7@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    created = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "Task"}, headers=auth_headers(user.id)
    ).json()

    resp = client.patch(f"/api/v1/milestones/{created['id']}", json={}, headers=auth_headers(user.id))
    assert resp.status_code == 422


def test_update_milestone_requires_auth(client, make_user, make_goal):
    user = make_user(email="ms8@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    resp = client.patch(f"/api/v1/milestones/{uuid.uuid4()}", json={"is_done": True})
    assert resp.status_code == 401


def test_update_other_users_milestone_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ms9-owner@example.com")
    stranger = make_user(email="ms9-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.MILESTONE)
    created = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "Task"}, headers=auth_headers(owner.id)
    ).json()

    resp = client.patch(
        f"/api/v1/milestones/{created['id']}", json={"is_done": True}, headers=auth_headers(stranger.id)
    )
    assert resp.status_code == 404


def test_delete_milestone_success(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms10@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    created = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "Task"}, headers=auth_headers(user.id)
    ).json()

    resp = client.delete(f"/api/v1/milestones/{created['id']}", headers=auth_headers(user.id))
    assert resp.status_code == 204

    follow_up = client.patch(
        f"/api/v1/milestones/{created['id']}", json={"is_done": True}, headers=auth_headers(user.id)
    )
    assert follow_up.status_code == 404


def test_delete_other_users_milestone_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="ms11-owner@example.com")
    stranger = make_user(email="ms11-stranger@example.com")
    goal = make_goal(user_id=owner.id, type=GoalType.MILESTONE)
    created = client.post(
        f"/api/v1/goals/{goal.id}/milestones", json={"title": "Task"}, headers=auth_headers(owner.id)
    ).json()

    resp = client.delete(f"/api/v1/milestones/{created['id']}", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def test_delete_milestone_requires_auth(client, make_user, make_goal):
    user = make_user(email="ms12@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.MILESTONE)
    resp = client.delete(f"/api/v1/milestones/{uuid.uuid4()}")
    assert resp.status_code == 401
