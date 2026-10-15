"""Tests for GET /reviews/weekly (docs/api-contract.yaml `reviews` tag,
US-17)."""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from app.models import Category, GoalType


def _aware(d: date):
    return datetime.combine(d, datetime.min.time(), tzinfo=timezone.utc)


def _monday_on_or_before(d: date) -> date:
    return d - timedelta(days=d.weekday())


def test_weekly_review_requires_auth(client):
    resp = client.get("/api/v1/reviews/weekly", params={"week_start": str(date.today())})
    assert resp.status_code == 401


def test_weekly_review_requires_week_start(client, make_user, auth_headers):
    user = make_user(email="wr1@example.com")
    resp = client.get("/api/v1/reviews/weekly", headers=auth_headers(user.id))
    assert resp.status_code == 422


def test_weekly_review_not_enough_history_for_new_account(client, make_user, auth_headers):
    user = make_user(email="wr2@example.com")
    week_start = _monday_on_or_before(date.today())

    resp = client.get(
        "/api/v1/reviews/weekly", params={"week_start": str(week_start)}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_enough_history"] is False
    assert body["previous_week_score"] is None
    assert body["score_change"] is None
    assert body["best_goal"] is None
    assert body["slipping_goal"] is None


def test_weekly_review_with_enough_history(client, make_user, make_goal, auth_headers):
    user = make_user(email="wr3@example.com")
    headers = auth_headers(user.id)
    today = date.today()
    week_start = _monday_on_or_before(today)

    goal = make_goal(
        user_id=user.id,
        category=Category.FITNESS,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=30),
        created_at=_aware(today - timedelta(days=30)),
    )

    for d in range(10):
        client.post(
            f"/api/v1/goals/{goal.id}/check-ins",
            json={"effort_rating": 5, "logged_for": str(today - timedelta(days=d))},
            headers=headers,
        )

    resp = client.get("/api/v1/reviews/weekly", params={"week_start": str(week_start)}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["has_enough_history"] is True
    assert body["overall_score"] is not None
    assert body["previous_week_score"] is not None
    assert body["score_change"] is not None
    assert body["best_goal"]["goal_id"] == str(goal.id)


def test_weekly_review_other_users_data_not_leaked(client, make_user, make_goal, auth_headers):
    user_a = make_user(email="wr4a@example.com")
    user_b = make_user(email="wr4b@example.com")
    today = date.today()
    week_start = _monday_on_or_before(today)

    make_goal(
        user_id=user_a.id,
        category=Category.FITNESS,
        type=GoalType.HABIT,
        target_value=None,
        frequency_per_week=7,
        start_date=today - timedelta(days=30),
        created_at=_aware(today - timedelta(days=30)),
    )

    resp = client.get(
        "/api/v1/reviews/weekly", params={"week_start": str(week_start)}, headers=auth_headers(user_b.id)
    )
    assert resp.status_code == 200
    assert resp.json()["has_enough_history"] is False
