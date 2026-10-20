"""Tests for the security-review fixes in docs/security-review.md:

- SEC-006 field length / numeric bounds (422, never 500)
- SEC-012 password policy (8-128 chars, <= 72 UTF-8 bytes; login max 128)
- SEC-008 date bounds 1970-01-01..2100-12-31
- SEC-005 login always runs bcrypt (dummy hash for unknown emails)
- SEC-007 CRON_SECRET constant-time compare
- SEC-010 /docs, /redoc, /openapi.json disabled when VERCEL=1
"""

from __future__ import annotations

import secrets
from datetime import date

import pytest
from fastapi.testclient import TestClient

from app.auth import security
from app.config import get_settings
from app.models import GoalType

TODAY = str(date.today())
ONE_MB = "x" * (1024 * 1024)


def _assert_422(resp) -> None:
    assert resp.status_code == 422, resp.text
    body = resp.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]


def _raw_json(client, method: str, url: str, raw: str, headers: dict | None = None):
    """Send a raw JSON body (httpx's json= refuses NaN/Infinity)."""
    h = {"Content-Type": "application/json", **(headers or {})}
    return client.request(method, url, content=raw.encode("utf-8"), headers=h)


# --------------------------------------------------------------------------
# Auth: name + password (SEC-006 / SEC-012)
# --------------------------------------------------------------------------


def _register(client, *, name="Sita", email="sec@example.com", password="password123"):
    return client.post(
        "/api/v1/auth/register", json={"name": name, "email": email, "password": password}
    )


def test_register_name_boundary_120_ok_121_rejected(client):
    assert _register(client, name="n" * 120, email="n120@example.com").status_code == 201
    _assert_422(_register(client, name="n" * 121, email="n121@example.com"))


def test_register_500_char_name_is_422_not_500(client):
    _assert_422(_register(client, name="n" * 500, email="n500@example.com"))


def test_register_password_length_boundaries(client):
    assert _register(client, email="p8@example.com", password="a" * 8).status_code == 201
    _assert_422(_register(client, email="p7@example.com", password="a" * 7))
    # 72 ASCII chars = 72 bytes: allowed.
    assert _register(client, email="p72@example.com", password="a" * 72).status_code == 201
    # 73 bytes: rejected (bcrypt would silently truncate).
    resp = _register(client, email="p73@example.com", password="a" * 73)
    _assert_422(resp)
    assert "72 bytes" in resp.json()["error"]["message"]
    # Over 128 characters: rejected by the char limit.
    _assert_422(_register(client, email="p129@example.com", password="a" * 129))


def test_register_password_multibyte_over_72_bytes_rejected(client):
    # 20 chars but 80 bytes in UTF-8 (each emoji is 4 bytes).
    pw = "\U0001F600" * 20
    assert len(pw) == 20 and len(pw.encode("utf-8")) == 80
    resp = _register(client, email="emoji@example.com", password=pw)
    _assert_422(resp)
    assert "72 bytes" in resp.json()["error"]["message"]
    # 18 emoji = 72 bytes: allowed.
    assert _register(client, email="emoji18@example.com", password="\U0001F600" * 18).status_code == 201


def test_login_password_max_128(client, make_user):
    make_user(email="loginmax@example.com", password="password123")
    resp = client.post(
        "/api/v1/auth/login", json={"email": "loginmax@example.com", "password": "a" * 128}
    )
    assert resp.status_code == 401
    resp = client.post(
        "/api/v1/auth/login", json={"email": "loginmax@example.com", "password": "a" * 129}
    )
    _assert_422(resp)


def test_patch_me_name_boundaries(client, make_user, auth_headers):
    user = make_user(email="patchme@example.com")
    h = auth_headers(user.id)
    resp = client.patch("/api/v1/auth/me", json={"name": "m" * 120}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["name"] == "m" * 120
    _assert_422(client.patch("/api/v1/auth/me", json={"name": "m" * 121}, headers=h))
    _assert_422(client.patch("/api/v1/auth/me", json={"name": "m" * 500}, headers=h))


# --------------------------------------------------------------------------
# SEC-005: login always runs bcrypt once
# --------------------------------------------------------------------------


def test_login_unknown_email_verifies_against_dummy_hash(client, monkeypatch):
    calls: list[tuple[str, str]] = []
    real_verify = security.verify_password

    def spy(raw, hashed):
        calls.append((raw, hashed))
        return real_verify(raw, hashed)

    monkeypatch.setattr(security, "verify_password", spy)

    resp = client.post(
        "/api/v1/auth/login", json={"email": "nobody-here@example.com", "password": "whatever123"}
    )
    assert resp.status_code == 401
    assert resp.json() == {
        "error": {"code": "UNAUTHORIZED", "message": "Incorrect email or password."}
    }
    assert calls == [("whatever123", security.get_dummy_password_hash())]


def test_login_wrong_password_known_email_same_message_and_one_bcrypt(client, make_user, monkeypatch):
    user = make_user(email="known@example.com", password="password123")
    calls: list[tuple[str, str]] = []
    real_verify = security.verify_password

    def spy(raw, hashed):
        calls.append((raw, hashed))
        return real_verify(raw, hashed)

    monkeypatch.setattr(security, "verify_password", spy)

    resp = client.post(
        "/api/v1/auth/login", json={"email": "known@example.com", "password": "wrongpass1"}
    )
    assert resp.status_code == 401
    assert resp.json() == {
        "error": {"code": "UNAUTHORIZED", "message": "Incorrect email or password."}
    }
    assert calls == [("wrongpass1", user.password_hash)]


def test_dummy_hash_never_verifies_as_success():
    assert security.verify_password_or_dummy("anything", None) is False


# --------------------------------------------------------------------------
# Goals (SEC-006 / SEC-008)
# --------------------------------------------------------------------------


def _goal_body(**overrides):
    body = {
        "title": "Run",
        "category": "fitness",
        "type": "numeric",
        "target_value": 100,
        "unit": "km",
        "start_date": TODAY,
    }
    body.update(overrides)
    return body


def _create_goal(client, headers, **overrides):
    return client.post("/api/v1/goals", json=_goal_body(**overrides), headers=headers)


def test_goal_create_text_boundaries(client, make_user, auth_headers):
    h = auth_headers(make_user(email="gtext@example.com").id)
    assert _create_goal(client, h, title="t" * 200).status_code == 201
    _assert_422(_create_goal(client, h, title="t" * 201))
    _assert_422(_create_goal(client, h, title="t" * 300))  # used to be a 500
    assert _create_goal(client, h, description="d" * 2000).status_code == 201
    _assert_422(_create_goal(client, h, description="d" * 2001))
    _assert_422(_create_goal(client, h, description=ONE_MB))  # used to be stored
    assert _create_goal(client, h, unit="u" * 32).status_code == 201
    _assert_422(_create_goal(client, h, unit="u" * 33))


def test_goal_create_target_value_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="gtarget@example.com").id)
    resp = _create_goal(client, h, target_value=9999999999.99)
    assert resp.status_code == 201, resp.text
    assert resp.json()["target_value"] == 9999999999.99
    assert _create_goal(client, h, target_value=0.01).status_code == 201
    _assert_422(_create_goal(client, h, target_value=1e10))
    _assert_422(_create_goal(client, h, target_value=1e20))  # used to be a 500
    _assert_422(_create_goal(client, h, target_value=0))
    _assert_422(_create_goal(client, h, target_value=-5))
    # Would round to 1e10 / 0.00 in Numeric(12,2): rejected, not a 500.
    _assert_422(_create_goal(client, h, target_value=9999999999.999))
    _assert_422(_create_goal(client, h, target_value=0.001))


def test_goal_create_weight_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="gweight@example.com").id)
    assert _create_goal(client, h, weight=999.99).status_code == 201
    assert _create_goal(client, h, weight=0.01).status_code == 201
    _assert_422(_create_goal(client, h, weight=1000))
    _assert_422(_create_goal(client, h, weight=0))
    _assert_422(_create_goal(client, h, weight=0.001))


def test_goal_create_frequency_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="gfreq@example.com").id)
    habit = {"type": "habit", "target_value": None, "unit": None}
    assert _create_goal(client, h, frequency_per_week=1, **habit).status_code == 201
    assert _create_goal(client, h, frequency_per_week=100, **habit).status_code == 201
    _assert_422(_create_goal(client, h, frequency_per_week=0, **habit))
    _assert_422(_create_goal(client, h, frequency_per_week=101, **habit))


@pytest.mark.parametrize("bad", ["NaN", "Infinity", "-Infinity"])
def test_goal_create_rejects_nan_and_infinity(client, make_user, auth_headers, bad):
    h = auth_headers(make_user(email=f"gnan{bad.lower()}@example.com").id)
    raw = (
        '{"title":"x","category":"fitness","type":"numeric","target_value":%s,'
        '"start_date":"%s"}' % (bad, TODAY)
    )
    _assert_422(_raw_json(client, "POST", "/api/v1/goals", raw, h))
    raw = (
        '{"title":"x","category":"fitness","type":"numeric","target_value":5,'
        '"weight":%s,"start_date":"%s"}' % (bad, TODAY)
    )
    _assert_422(_raw_json(client, "POST", "/api/v1/goals", raw, h))


def test_goal_create_date_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="gdate@example.com").id)
    assert _create_goal(client, h, start_date="1970-01-01").status_code == 201
    assert _create_goal(client, h, start_date="2020-01-01", deadline="2100-12-31").status_code == 201
    _assert_422(_create_goal(client, h, start_date="1969-12-31"))
    _assert_422(_create_goal(client, h, deadline="2101-01-01"))
    _assert_422(_create_goal(client, h, deadline="9999-12-31"))


def test_goal_update_bounds(client, make_user, make_goal, auth_headers):
    user = make_user(email="gupd@example.com")
    goal = make_goal(user_id=user.id)
    h = auth_headers(user.id)
    url = f"/api/v1/goals/{goal.id}"

    ok = {
        "title": "t" * 200,
        "description": "d" * 2000,
        "unit": "u" * 32,
        "target_value": 9999999999.99,
        "weight": 999.99,
        "deadline": "2100-12-31",
    }
    resp = client.patch(url, json=ok, headers=h)
    assert resp.status_code == 200, resp.text

    for bad in (
        {"title": "t" * 201},
        {"title": "t" * 300},
        {"description": "d" * 2001},
        {"description": ONE_MB},
        {"unit": "u" * 33},
        {"target_value": 1e10},
        {"target_value": 1e20},
        {"weight": 1000},
        {"weight": 0},
        {"frequency_per_week": 101},
        {"frequency_per_week": 0},
        {"deadline": "2101-01-01"},
        {"deadline": "1969-12-31"},
    ):
        _assert_422(client.patch(url, json=bad, headers=h))

    _assert_422(_raw_json(client, "PATCH", url, '{"weight": NaN}', h))
    _assert_422(_raw_json(client, "PATCH", url, '{"target_value": Infinity}', h))


def test_goal_update_frequency_upper_boundary(client, make_user, make_goal, auth_headers):
    user = make_user(email="gupdfreq@example.com")
    goal = make_goal(user_id=user.id, type=GoalType.HABIT)
    resp = client.patch(
        f"/api/v1/goals/{goal.id}", json={"frequency_per_week": 100}, headers=auth_headers(user.id)
    )
    assert resp.status_code == 200, resp.text


# --------------------------------------------------------------------------
# Milestones (SEC-006)
# --------------------------------------------------------------------------


def test_milestone_title_bounds(client, make_user, make_goal, auth_headers):
    user = make_user(email="ms@example.com")
    goal = make_goal(user_id=user.id)
    h = auth_headers(user.id)
    url = f"/api/v1/goals/{goal.id}/milestones"

    resp = client.post(url, json={"title": "m" * 200}, headers=h)
    assert resp.status_code == 201, resp.text
    ms_id = resp.json()["id"]
    _assert_422(client.post(url, json={"title": "m" * 201}, headers=h))
    _assert_422(client.post(url, json={"title": "m" * 300}, headers=h))

    murl = f"/api/v1/milestones/{ms_id}"
    assert client.patch(murl, json={"title": "z" * 200}, headers=h).status_code == 200
    _assert_422(client.patch(murl, json={"title": "z" * 201}, headers=h))


def test_milestone_due_date_bounds(client, make_user, make_goal, auth_headers):
    user = make_user(email="msdate@example.com")
    goal = make_goal(user_id=user.id)
    h = auth_headers(user.id)
    url = f"/api/v1/goals/{goal.id}/milestones"

    assert client.post(url, json={"title": "a", "due_date": "1970-01-01"}, headers=h).status_code == 201
    resp = client.post(url, json={"title": "b", "due_date": "2100-12-31"}, headers=h)
    assert resp.status_code == 201, resp.text
    assert client.post(url, json={"title": "c", "due_date": None}, headers=h).status_code == 201
    _assert_422(client.post(url, json={"title": "d", "due_date": "1969-12-31"}, headers=h))
    _assert_422(client.post(url, json={"title": "e", "due_date": "2101-01-01"}, headers=h))
    _assert_422(client.post(url, json={"title": "f", "due_date": "9999-12-31"}, headers=h))

    murl = f"/api/v1/milestones/{resp.json()['id']}"
    assert client.patch(murl, json={"due_date": "2000-06-15"}, headers=h).status_code == 200
    _assert_422(client.patch(murl, json={"due_date": "1969-12-31"}, headers=h))
    _assert_422(client.patch(murl, json={"due_date": "2101-01-01"}, headers=h))
    _assert_422(client.patch(murl, json={"due_date": "0001-01-01"}, headers=h))


# --------------------------------------------------------------------------
# Check-ins (SEC-006 / SEC-008)
# --------------------------------------------------------------------------


def test_check_in_bounds(client, make_user, make_goal, auth_headers):
    user = make_user(email="ci@example.com")
    goal = make_goal(user_id=user.id)
    h = auth_headers(user.id)
    url = f"/api/v1/goals/{goal.id}/check-ins"

    def post(**kw):
        body = {"effort_rating": 3, "logged_for": TODAY}
        body.update(kw)
        return client.post(url, json=body, headers=h)

    assert post(value=9999999999.99).status_code == 201
    assert post(value=-9999999999.99).status_code == 201
    assert post(note="n" * 2000).status_code == 201
    assert post(logged_for="1970-01-01").status_code == 201
    assert post(logged_for="2100-12-31").status_code == 201

    _assert_422(post(value=1e10))
    _assert_422(post(value=-1e10))
    _assert_422(post(value=1e20))
    _assert_422(post(note="n" * 2001))
    _assert_422(post(note=ONE_MB))  # used to be stored
    _assert_422(post(logged_for="1969-12-31"))
    _assert_422(post(logged_for="2101-01-01"))

    for bad in ("NaN", "Infinity", "-Infinity"):
        raw = '{"value": %s, "effort_rating": 3, "logged_for": "%s"}' % (bad, TODAY)
        _assert_422(_raw_json(client, "POST", url, raw, h))


# --------------------------------------------------------------------------
# Category weights (SEC-006)
# --------------------------------------------------------------------------


def test_category_weight_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="cw@example.com").id)
    url = "/api/v1/settings/category-weights"

    def put(weight):
        return client.put(url, json={"weights": [{"category": "fitness", "weight": weight}]}, headers=h)

    assert put(999.99).status_code == 200
    assert put(0.01).status_code == 200
    _assert_422(put(1000))
    _assert_422(put(0))
    _assert_422(put(1e20))
    raw = '{"weights": [{"category": "fitness", "weight": NaN}]}'
    _assert_422(_raw_json(client, "PUT", url, raw, h))


# --------------------------------------------------------------------------
# Query-param date bounds (SEC-008)
# --------------------------------------------------------------------------


def test_weekly_review_week_start_bounds(client, make_user, auth_headers):
    h = auth_headers(make_user(email="wr@example.com").id)
    url = "/api/v1/reviews/weekly"
    assert client.get(url, params={"week_start": "1970-01-05"}, headers=h).status_code == 200
    assert client.get(url, params={"week_start": "2100-12-27"}, headers=h).status_code == 200
    _assert_422(client.get(url, params={"week_start": "1969-12-29"}, headers=h))
    _assert_422(client.get(url, params={"week_start": "2101-01-03"}, headers=h))
    _assert_422(client.get(url, params={"week_start": "9999-12-27"}, headers=h))


@pytest.mark.parametrize("path", ["/api/v1/journal", "/api/v1/journal/export"])
def test_journal_from_to_bounds(client, make_user, auth_headers, path):
    h = auth_headers(make_user(email=f"j{len(path)}@example.com").id)
    ok = client.get(path, params={"from": "1970-01-01", "to": "2100-12-31"}, headers=h)
    assert ok.status_code == 200, ok.text
    _assert_422(client.get(path, params={"to": "9999-12-31"}, headers=h))  # used to be a 500
    _assert_422(client.get(path, params={"from": "0001-01-01", "to": "9999-12-30"}, headers=h))
    _assert_422(client.get(path, params={"from": "1969-12-31"}, headers=h))
    _assert_422(client.get(path, params={"to": "2101-01-01"}, headers=h))


# --------------------------------------------------------------------------
# SEC-007: CRON_SECRET constant-time compare
# --------------------------------------------------------------------------


@pytest.fixture()
def _cron(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "sec-cron-secret")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_cron_secret_uses_compare_digest(client, monkeypatch, _cron):
    calls = []
    real = secrets.compare_digest

    def spy(a, b):
        calls.append((a, b))
        return real(a, b)

    monkeypatch.setattr(secrets, "compare_digest", spy)
    url = "/api/v1/internal/daily-snapshot"

    assert client.get(url, headers={"Authorization": "Bearer wrong"}).status_code == 401
    assert client.get(url).status_code == 401
    assert client.get(url, headers={"Authorization": "Bearer sec-cron-secret"}).status_code == 200
    assert len(calls) == 3
    assert all(b == b"Bearer sec-cron-secret" for _, b in calls)


def test_cron_secret_empty_still_fails_closed(client, monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "")
    get_settings.cache_clear()
    try:
        url = "/api/v1/internal/daily-snapshot"
        assert client.get(url, headers={"Authorization": "Bearer "}).status_code == 401
        assert client.get(url).status_code == 401
    finally:
        get_settings.cache_clear()


# --------------------------------------------------------------------------
# SEC-010: docs disabled on Vercel
# --------------------------------------------------------------------------


def test_docs_disabled_when_vercel(monkeypatch):
    from app.main import create_app

    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("JWT_SECRET", secrets.token_urlsafe(48))
    get_settings.cache_clear()
    try:
        tc = TestClient(create_app())
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert tc.get(path).status_code == 404, path
        assert tc.get("/api/v1/health").status_code == 200
    finally:
        get_settings.cache_clear()


def test_docs_enabled_locally(monkeypatch):
    from app.main import create_app

    monkeypatch.delenv("VERCEL", raising=False)
    get_settings.cache_clear()
    try:
        tc = TestClient(create_app())
        for path in ("/docs", "/redoc", "/openapi.json"):
            assert tc.get(path).status_code == 200, path
    finally:
        get_settings.cache_clear()
