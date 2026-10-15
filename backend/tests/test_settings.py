"""Tests for /settings/category-weights (docs/api-contract.yaml `settings`
tag, US-18)."""

from __future__ import annotations


def test_get_category_weights_requires_auth(client):
    resp = client.get("/api/v1/settings/category-weights")
    assert resp.status_code == 401


def test_get_category_weights_defaults_equal_when_unset(client, make_user, auth_headers):
    user = make_user(email="cw1@example.com")
    resp = client.get("/api/v1/settings/category-weights", headers=auth_headers(user.id))

    assert resp.status_code == 200
    body = resp.json()
    weights = {w["category"]: w["weight"] for w in body["weights"]}
    assert set(weights) == {"fitness", "study", "career", "custom"}
    assert len(set(weights.values())) == 1  # all equal


def test_put_category_weights_success(client, make_user, auth_headers):
    user = make_user(email="cw2@example.com")
    headers = auth_headers(user.id)

    resp = client.put(
        "/api/v1/settings/category-weights",
        json={"weights": [{"category": "fitness", "weight": 2.5}, {"category": "study", "weight": 0.5}]},
        headers=headers,
    )
    assert resp.status_code == 200
    weights = {w["category"]: w["weight"] for w in resp.json()["weights"]}
    assert weights["fitness"] == 2.5
    assert weights["study"] == 0.5
    # Untouched categories keep the default-equal weight (1.0).
    assert weights["career"] == 1.0
    assert weights["custom"] == 1.0

    follow_up = client.get("/api/v1/settings/category-weights", headers=headers)
    follow_up_weights = {w["category"]: w["weight"] for w in follow_up.json()["weights"]}
    assert follow_up_weights["fitness"] == 2.5


def test_put_category_weights_validation_error_zero_weight(client, make_user, auth_headers):
    user = make_user(email="cw3@example.com")
    resp = client.put(
        "/api/v1/settings/category-weights",
        json={"weights": [{"category": "fitness", "weight": 0}]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_put_category_weights_validation_error_bad_category(client, make_user, auth_headers):
    user = make_user(email="cw4@example.com")
    resp = client.put(
        "/api/v1/settings/category-weights",
        json={"weights": [{"category": "not-a-category", "weight": 1}]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_put_category_weights_requires_auth(client):
    resp = client.put(
        "/api/v1/settings/category-weights", json={"weights": [{"category": "fitness", "weight": 1}]}
    )
    assert resp.status_code == 401


def test_category_weights_isolated_per_user(client, make_user, auth_headers):
    user_a = make_user(email="cw5a@example.com")
    user_b = make_user(email="cw5b@example.com")

    client.put(
        "/api/v1/settings/category-weights",
        json={"weights": [{"category": "fitness", "weight": 3}]},
        headers=auth_headers(user_a.id),
    )

    resp_b = client.get("/api/v1/settings/category-weights", headers=auth_headers(user_b.id))
    weights_b = {w["category"]: w["weight"] for w in resp_b.json()["weights"]}
    assert weights_b["fitness"] == 1.0
