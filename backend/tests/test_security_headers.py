"""SEC-016: every API response carries Cache-Control: no-store,
X-Content-Type-Options: nosniff and Referrer-Policy, including error
responses, without clobbering headers a route sets itself (journal export)
and without breaking CORS or the cron endpoint."""

from __future__ import annotations

import uuid

import pytest
from fastapi import Response
from fastapi.testclient import TestClient

from app.config import get_settings
from app.main import JOURNAL_EXPORT_HEADERS, create_app

EXPECTED = {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
}


def _assert_security_headers(resp) -> None:
    for name, value in EXPECTED.items():
        assert resp.headers.get(name) == value, (name, dict(resp.headers))


def test_health_has_security_headers(client):
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    _assert_security_headers(resp)


def test_authenticated_json_response_has_security_headers(client, make_user, auth_headers):
    user = make_user(email="hdr-me@example.com")
    resp = client.get("/api/v1/auth/me", headers=auth_headers(user.id))
    assert resp.status_code == 200
    assert "password_hash" not in resp.json()
    _assert_security_headers(resp)


def test_401_has_security_headers(client):
    resp = client.get("/api/v1/goals")
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"
    _assert_security_headers(resp)


def test_404_and_422_have_security_headers(client, make_user, auth_headers):
    h = auth_headers(make_user(email="hdr-err@example.com").id)
    resp = client.get(f"/api/v1/goals/{uuid.uuid4()}", headers=h)
    assert resp.status_code == 404
    _assert_security_headers(resp)
    resp = client.post("/api/v1/goals", json={}, headers=h)
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    _assert_security_headers(resp)


def test_unhandled_500_has_security_headers(db_session):
    app = create_app()

    @app.get("/api/v1/_boom")
    def _boom() -> None:
        raise RuntimeError("boom")

    with TestClient(app, raise_server_exceptions=False) as c:
        resp = c.get("/api/v1/_boom")
    assert resp.status_code == 500
    assert resp.json() == {
        "error": {"code": "INTERNAL_ERROR", "message": "An unexpected error occurred."}
    }
    _assert_security_headers(resp)


def test_export_keeps_its_headers_and_gets_security_headers(client, make_user, auth_headers):
    user = make_user(email="hdr-export@example.com")
    resp = client.get(
        "/api/v1/journal/export",
        params={"from": "2026-10-01", "to": "2026-10-02", "include_goals": "false"},
        headers={**auth_headers(user.id), "Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 200
    _assert_security_headers(resp)
    assert resp.headers["content-type"] == "text/markdown; charset=utf-8"
    assert resp.headers["content-disposition"] == (
        'attachment; filename="bihan-journal-2026-10-01-to-2026-10-02.md"'
    )
    assert resp.headers["x-journal-entry-count"] == "0"
    assert resp.headers["x-journal-word-count"] == "0"
    assert resp.headers["x-journal-goal-count"] == "0"
    exposed = {h.strip().lower() for h in resp.headers["access-control-expose-headers"].split(",")}
    assert {h.lower() for h in JOURNAL_EXPORT_HEADERS} <= exposed


def test_cors_preflight_still_works(client):
    resp = client.options(
        "/api/v1/journal/export",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "authorization",
        },
    )
    assert resp.status_code == 200
    assert resp.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "authorization" in resp.headers["access-control-allow-headers"].lower()


def test_route_set_header_is_not_overwritten(db_session):
    app = create_app()

    @app.get("/api/v1/_cached")
    def _cached(response: Response) -> dict[str, str]:
        response.headers["Cache-Control"] = "private, max-age=60"
        return {"ok": "yes"}

    with TestClient(app) as c:
        resp = c.get("/api/v1/_cached")
    assert resp.status_code == 200, resp.text
    assert resp.headers["cache-control"] == "private, max-age=60"
    assert resp.headers["x-content-type-options"] == "nosniff"


@pytest.fixture()
def _cron_secret(monkeypatch):
    monkeypatch.setenv("CRON_SECRET", "test-cron-secret-hdr")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()


def test_cron_endpoint_still_works_with_headers(client, _cron_secret):
    resp = client.get("/api/v1/internal/daily-snapshot")
    assert resp.status_code == 401
    _assert_security_headers(resp)
    resp = client.get(
        "/api/v1/internal/daily-snapshot",
        headers={"Authorization": "Bearer test-cron-secret-hdr"},
    )
    assert resp.status_code == 200, resp.text
    _assert_security_headers(resp)
