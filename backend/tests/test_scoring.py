"""Tests for /goals/{goalId}/score and /goals/{goalId}/score-history
(docs/api-contract.yaml `scoring` tag, US-13, EC-07/EC-08)."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from app.models import GoalStatus, GoalType


def test_score_endpoint_calibrating_for_new_goal(client, make_user, make_goal, auth_headers):
    user = make_user(email="score1@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.NUMERIC, target_value=Decimal("100"))

    resp = client.get(f"/api/v1/goals/{goal.id}/score", headers=auth_headers(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["grade"] == "Calibrating"
    assert body["total"] is None
    assert body["goal_id"] == str(goal.id)
    assert body["is_frozen"] is False


def test_score_endpoint_end_to_end_with_check_ins(client, make_user, make_goal, auth_headers):
    """Create a goal old enough to not be Calibrating, log a run of
    check-ins, and assert the score breakdown is sensible (exercises the
    real scoring engine through the API, not just a mock).
    """
    user = make_user(email="score2@example.com")
    today = date.today()
    goal = make_goal(
        user_id=user.id,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=20),
        deadline=today + timedelta(days=10),
        created_at=_aware(today - timedelta(days=20)),
    )
    headers = auth_headers(user.id)

    for days_ago in range(14):
        client.post(
            f"/api/v1/goals/{goal.id}/check-ins",
            json={"effort_rating": 5, "logged_for": str(today - timedelta(days=days_ago))},
            headers=headers,
        )

    resp = client.get(f"/api/v1/goals/{goal.id}/score", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["grade"] != "Calibrating"
    assert body["total"] is not None
    # Checked in every day for the last 14 days with max effort -> consistency
    # and effort should both be at (or very near) their ceiling.
    assert body["consistency"] >= 0.9
    assert body["effort"] >= 0.9
    assert body["total"] >= 70


def test_score_endpoint_is_frozen_for_completed_goal(client, make_user, make_goal, auth_headers):
    user = make_user(email="score3@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.NUMERIC, target_value=Decimal("100"), status=GoalStatus.COMPLETED)

    resp = client.get(f"/api/v1/goals/{goal.id}/score", headers=auth_headers(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["is_frozen"] is True
    assert body["pace"] == 1.0
    assert body["consistency"] == 1.0
    assert body["momentum"] == 1.0


def test_score_endpoint_requires_auth(client, make_user, make_goal):
    user = make_user(email="score4@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.get(f"/api/v1/goals/{goal.id}/score")
    assert resp.status_code == 401


def test_score_endpoint_not_found(client, make_user, auth_headers):
    user = make_user(email="score5@example.com")
    resp = client.get(f"/api/v1/goals/{uuid.uuid4()}/score", headers=auth_headers(user.id))
    assert resp.status_code == 404


def test_score_endpoint_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="score6-owner@example.com")
    stranger = make_user(email="score6-stranger@example.com")
    goal = make_goal(user_id=owner.id)

    resp = client.get(f"/api/v1/goals/{goal.id}/score", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def test_score_history_populated_after_check_in(client, make_user, make_goal, auth_headers):
    user = make_user(email="score7@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    headers = auth_headers(user.id)

    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 4, "logged_for": str(date.today())},
        headers=headers,
    )

    resp = client.get(f"/api/v1/goals/{goal.id}/score-history", headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["snapshot_date"] == str(date.today())


def test_score_history_days_param(client, make_user, make_goal, auth_headers):
    user = make_user(email="score8@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT, target_value=None)
    headers = auth_headers(user.id)

    client.post(
        f"/api/v1/goals/{goal.id}/check-ins",
        json={"effort_rating": 4, "logged_for": str(date.today())},
        headers=headers,
    )

    resp7 = client.get(f"/api/v1/goals/{goal.id}/score-history", params={"days": 7}, headers=headers)
    resp30 = client.get(f"/api/v1/goals/{goal.id}/score-history", params={"days": 30}, headers=headers)
    assert resp7.status_code == 200
    assert resp30.status_code == 200


def test_score_history_invalid_days_is_validation_error(client, make_user, make_goal, auth_headers):
    user = make_user(email="score9@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.get(
        f"/api/v1/goals/{goal.id}/score-history", params={"days": 14}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 422


def test_score_history_requires_auth(client, make_user, make_goal):
    user = make_user(email="score10@example.com")
    goal = make_goal(user_id=user.id)
    resp = client.get(f"/api/v1/goals/{goal.id}/score-history")
    assert resp.status_code == 401


def test_score_history_other_users_goal_is_404(client, make_user, make_goal, auth_headers):
    owner = make_user(email="score11-owner@example.com")
    stranger = make_user(email="score11-stranger@example.com")
    goal = make_goal(user_id=owner.id)

    resp = client.get(f"/api/v1/goals/{goal.id}/score-history", headers=auth_headers(stranger.id))
    assert resp.status_code == 404


def _aware(d: date):
    from datetime import datetime, timezone

    return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)
