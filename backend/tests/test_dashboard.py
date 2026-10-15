"""Tests for GET /dashboard (docs/api-contract.yaml `dashboard` tag,
US-15, EC-09/EC-10)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from app.models import Category, GoalStatus, GoalType


def _aware(d: date):
    return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)


def test_dashboard_requires_auth(client):
    resp = client.get("/api/v1/dashboard")
    assert resp.status_code == 401


def test_dashboard_empty_state_for_zero_goals(client, make_user, auth_headers):
    user = make_user(email="dash1@example.com")
    resp = client.get("/api/v1/dashboard", headers=auth_headers(user.id))

    assert resp.status_code == 200
    body = resp.json()
    assert body["overall_score"] is None
    assert body["current_streak_days"] == 0
    assert body["best_streak_days"] == 0
    assert len(body["category_scores"]) == 4
    assert all(c["score"] is None and c["has_active_goals"] is False for c in body["category_scores"])
    assert body["attention"] == []


def test_dashboard_category_with_no_goals_excluded(client, make_user, make_goal, auth_headers):
    user = make_user(email="dash2@example.com")
    today = date.today()
    make_goal(
        user_id=user.id,
        category=Category.FITNESS,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=10),
        created_at=_aware(today - timedelta(days=10)),
    )

    resp = client.get("/api/v1/dashboard", headers=auth_headers(user.id))
    body = resp.json()
    by_category = {c["category"]: c for c in body["category_scores"]}

    assert by_category["fitness"]["has_active_goals"] is True
    assert by_category["fitness"]["score"] is not None
    assert by_category["career"]["has_active_goals"] is False
    assert by_category["career"]["score"] is None
    assert body["overall_score"] is not None


def test_dashboard_rolls_up_multiple_categories(client, make_user, make_goal, auth_headers):
    user = make_user(email="dash3@example.com")
    today = date.today()
    headers = auth_headers(user.id)

    fitness_goal = make_goal(
        user_id=user.id,
        category=Category.FITNESS,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=10),
        created_at=_aware(today - timedelta(days=10)),
    )
    study_goal = make_goal(
        user_id=user.id,
        category=Category.STUDY,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=10),
        created_at=_aware(today - timedelta(days=10)),
    )

    for d in range(10):
        client.post(
            f"/api/v1/goals/{fitness_goal.id}/check-ins",
            json={"effort_rating": 5, "logged_for": str(today - timedelta(days=d))},
            headers=headers,
        )

    resp = client.get("/api/v1/dashboard", headers=headers)
    body = resp.json()
    by_category = {c["category"]: c for c in body["category_scores"]}

    assert by_category["fitness"]["score"] >= by_category["study"]["score"]
    assert body["overall_score"] is not None
    assert body["current_streak_days"] >= 1


def test_dashboard_trend_days_param(client, make_user, auth_headers):
    user = make_user(email="dash4@example.com")
    headers = auth_headers(user.id)

    resp7 = client.get("/api/v1/dashboard", params={"trend_days": 7}, headers=headers)
    resp30 = client.get("/api/v1/dashboard", params={"trend_days": 30}, headers=headers)

    assert resp7.status_code == 200
    assert len(resp7.json()["trend"]) == 7
    assert resp30.status_code == 200
    assert len(resp30.json()["trend"]) == 30


def test_dashboard_invalid_trend_days_is_validation_error(client, make_user, auth_headers):
    user = make_user(email="dash5@example.com")
    resp = client.get("/api/v1/dashboard", params={"trend_days": 14}, headers=auth_headers(user.id))
    assert resp.status_code == 422


def test_dashboard_attention_list_flags_low_score_goal(client, make_user, make_goal, auth_headers):
    user = make_user(email="dash6@example.com")
    today = date.today()
    headers = auth_headers(user.id)

    # Old active goal with zero check-ins ever -> should score low and show
    # up in the attention list.
    goal = make_goal(
        user_id=user.id,
        category=Category.CAREER,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=30),
        created_at=_aware(today - timedelta(days=30)),
    )

    resp = client.get("/api/v1/dashboard", headers=headers)
    body = resp.json()
    attention_ids = [a["goal_id"] for a in body["attention"]]
    assert str(goal.id) in attention_ids
