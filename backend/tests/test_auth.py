"""Tests for POST /auth/register, POST /auth/login, GET /auth/me against a
real Postgres test database (see tests/conftest.py).
"""

from __future__ import annotations

import time

import jwt
import pytest

from app.auth.security import ALGORITHM
from app.config import get_settings


def test_register_success(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Aayush", "email": "aayush@example.com", "password": "secret123"},
    )

    assert resp.status_code == 201
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert isinstance(body["access_token"], str) and body["access_token"]
    assert body["user"]["name"] == "Aayush"
    assert body["user"]["email"] == "aayush@example.com"
    assert "id" in body["user"]
    assert "created_at" in body["user"]
    # Never return the password hash.
    assert "password" not in body["user"]
    assert "password_hash" not in body["user"]


def test_register_duplicate_email_rejected(client):
    client.post(
        "/api/v1/auth/register",
        json={"name": "First", "email": "dupe@example.com", "password": "secret123"},
    )

    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Second", "email": "dupe@example.com", "password": "secret123"},
    )

    assert resp.status_code == 409
    body = resp.json()
    assert body["error"]["code"]
    assert body["error"]["message"]


def test_register_duplicate_email_case_insensitive_rejected(client):
    client.post(
        "/api/v1/auth/register",
        json={"name": "First", "email": "demo@lifetracker.dev", "password": "secret123"},
    )

    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "Second", "email": "Demo@Lifetracker.dev", "password": "secret123"},
    )

    assert resp.status_code == 409
    assert "error" in resp.json()


@pytest.mark.parametrize(
    "payload",
    [
        {"name": "", "email": "a@example.com", "password": "secret123"},  # empty name
        {"name": "A", "email": "not-an-email", "password": "secret123"},  # bad email
        {"name": "A", "email": "a@example.com", "password": "short"},  # too-short password
        {"name": "A", "email": "a@example.com"},  # missing password
    ],
)
def test_register_validation_error(client, payload):
    resp = client.post("/api/v1/auth/register", json=payload)

    assert resp.status_code == 422
    body = resp.json()
    assert body["error"]["code"] == "VALIDATION_ERROR"
    assert body["error"]["message"]


def test_login_success(client, make_user):
    make_user(email="login@example.com", password="correct-password")

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "login@example.com", "password": "correct-password"},
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["token_type"] == "bearer"
    assert body["access_token"]
    assert body["user"]["email"] == "login@example.com"


def test_login_success_email_case_insensitive(client, make_user):
    make_user(email="login2@example.com", password="correct-password")

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "Login2@Example.com", "password": "correct-password"},
    )

    assert resp.status_code == 200


def test_login_wrong_password(client, make_user):
    make_user(email="wrongpw@example.com", password="correct-password")

    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "wrongpw@example.com", "password": "incorrect-password"},
    )

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"]
    assert body["error"]["message"]


def test_login_nonexistent_user(client):
    resp = client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "whatever123"},
    )

    assert resp.status_code == 401
    assert "error" in resp.json()


def test_me_with_valid_token(client, make_user, auth_headers):
    user = make_user(email="me@example.com", password="correct-password")

    resp = client.get("/api/v1/auth/me", headers=auth_headers(user.id))

    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(user.id)
    assert body["email"] == "me@example.com"
    assert body["name"] == user.name
    assert "password_hash" not in body


def test_me_without_token(client):
    resp = client.get("/api/v1/auth/me")

    assert resp.status_code == 401
    body = resp.json()
    assert body["error"]["code"]
    assert body["error"]["message"]


def test_me_with_invalid_token(client):
    resp = client.get("/api/v1/auth/me", headers={"Authorization": "Bearer not-a-real-token"})

    assert resp.status_code == 401
    assert "error" in resp.json()


def test_me_with_expired_token(client, make_user):
    user = make_user(email="expired@example.com", password="correct-password")

    settings = get_settings()
    expired_payload = {"sub": str(user.id), "iat": int(time.time()) - 7200, "exp": int(time.time()) - 3600}
    expired_token = jwt.encode(expired_payload, settings.jwt_secret, algorithm=ALGORITHM)

    resp = client.get("/api/v1/auth/me", headers={"Authorization": f"Bearer {expired_token}"})

    assert resp.status_code == 401
    assert "error" in resp.json()


def test_me_for_deleted_user_token(client, make_user, auth_headers, db_session):
    user = make_user(email="deleteme@example.com", password="correct-password")
    headers = auth_headers(user.id)

    db_session.delete(user)
    db_session.commit()

    resp = client.get("/api/v1/auth/me", headers=headers)

    assert resp.status_code == 401
    assert "error" in resp.json()


def test_update_me_success(client, make_user, auth_headers):
    user = make_user(email="rename@example.com", password="correct-password")

    resp = client.patch("/api/v1/auth/me", json={"name": "New Name"}, headers=auth_headers(user.id))

    assert resp.status_code == 200
    body = resp.json()
    assert body["name"] == "New Name"

    follow_up = client.get("/api/v1/auth/me", headers=auth_headers(user.id))
    assert follow_up.json()["name"] == "New Name"


def test_update_me_requires_auth(client):
    resp = client.patch("/api/v1/auth/me", json={"name": "New Name"})

    assert resp.status_code == 401
