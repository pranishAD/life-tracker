"""Tests for GET /internal/daily-snapshot (docs/api-contract.yaml `internal`
tag). Protected by CRON_SECRET, not a user JWT.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

import pytest

from app.config import get_settings
from app.models import GoalStatus, GoalType


@pytest.fixture(autouse=True)
def _cron_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-cron-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_daily_snapshot_rejects_missing_auth(client):
    resp = client.get("/api/v1/internal/daily-snapshot")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"]


def test_daily_snapshot_rejects_wrong_secret(client):
    resp = client.get(
        "/api/v1/internal/daily-snapshot", headers={"Authorization": "Bearer wrong-secret"}
    )
    assert resp.status_code == 401


def test_daily_snapshot_rejects_user_jwt(client, make_user, auth_headers):
    user = make_user(email="cron1@example.com")
    resp = client.get("/api/v1/internal/daily-snapshot", headers=auth_headers(user.id))
    assert resp.status_code == 401


def test_daily_snapshot_writes_snapshots_for_active_goals_only(client, make_user, make_goal):
    user = make_user(email="cron2@example.com")
    make_goal(user_id=user.id, category="fitness", type=GoalType.NUMERIC, target_value=Decimal("10"), status=GoalStatus.ACTIVE)
    make_goal(user_id=user.id, category="study", type=GoalType.NUMERIC, target_value=Decimal("10"), status=GoalStatus.ARCHIVED)
    make_goal(user_id=user.id, category="career", type=GoalType.NUMERIC, target_value=Decimal("10"), status=GoalStatus.COMPLETED)

    resp = client.get(
        "/api/v1/internal/daily-snapshot", headers={"Authorization": "Bearer test-cron-secret"}
    )
    assert resp.status_code == 200
    assert resp.json() == {"snapshots_written": 1}


def test_daily_snapshot_without_secret_configured_always_rejects(client, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "")
    get_settings.cache_clear()

    resp = client.get(
        "/api/v1/internal/daily-snapshot", headers={"Authorization": "Bearer "}
    )
    assert resp.status_code == 401
    get_settings.cache_clear()
