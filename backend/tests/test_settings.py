"""Tests for /settings/category-weights (docs/api-contract.yaml 1.1.0
`settings` tag, US-18). Keyed by the user's category_id."""

from __future__ import annotations

import uuid

URL = "/api/v1/settings/category-weights"


def _weights(resp) -> dict[str, float]:
    return {w["category_id"]: w["weight"] for w in resp.json()["weights"]}


def test_get_category_weights_requires_auth(client):
    resp = client.get(URL)
    assert resp.status_code == 401


def test_get_category_weights_defaults_equal_when_unset(client, make_user, auth_headers, category_id):
    user = make_user(email="cw1@example.com")
    resp = client.get(URL, headers=auth_headers(user.id))

    assert resp.status_code == 200
    body = resp.json()
    # Every category, in sort_order (Fitness, Study, Career, Custom), weight 1.
    assert [w["category_id"] for w in body["weights"]] == [
        str(category_id(user.id, k)) for k in ("fitness", "study", "career", "custom")
    ]
    assert {w["weight"] for w in body["weights"]} == {1.0}


def test_get_category_weights_lists_custom_categories_in_sort_order(client, make_user, auth_headers):
    user = make_user(email="cw1b@example.com")
    h = auth_headers(user.id)
    new = client.post(
        "/api/v1/categories", json={"name": "Music", "emoji": "🎸", "color": "pink"}, headers=h
    ).json()
    ids = [c["id"] for c in client.get("/api/v1/categories", headers=h).json()]
    reordered = [new["id"]] + [i for i in ids if i != new["id"]]
    client.patch("/api/v1/categories/order", json={"category_ids": reordered}, headers=h)

    resp = client.get(URL, headers=h)
    assert [w["category_id"] for w in resp.json()["weights"]] == reordered


def test_put_category_weights_success(client, make_user, auth_headers, category_id):
    user = make_user(email="cw2@example.com")
    headers = auth_headers(user.id)
    fitness, study = str(category_id(user.id, "fitness")), str(category_id(user.id, "study"))

    resp = client.put(
        URL,
        json={"weights": [{"category_id": fitness, "weight": 2.5}, {"category_id": study, "weight": 0.5}]},
        headers=headers,
    )
    assert resp.status_code == 200
    weights = _weights(resp)
    assert weights[fitness] == 2.5
    assert weights[study] == 0.5
    # Untouched categories keep the default-equal weight (1.0).
    assert weights[str(category_id(user.id, "career"))] == 1.0
    assert weights[str(category_id(user.id, "custom"))] == 1.0

    follow_up = client.get(URL, headers=headers)
    assert _weights(follow_up)[fitness] == 2.5


def test_put_category_weights_validation_error_zero_weight(client, make_user, auth_headers, category_id):
    user = make_user(email="cw3@example.com")
    resp = client.put(
        URL,
        json={"weights": [{"category_id": str(category_id(user.id)), "weight": 0}]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422


def test_put_category_weights_validation_error_bad_category_id(client, make_user, auth_headers):
    user = make_user(email="cw4@example.com")
    resp = client.put(
        URL,
        json={"weights": [{"category_id": "not-a-uuid", "weight": 1}]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_put_category_weights_unknown_category_is_invalid_category(client, make_user, auth_headers):
    user = make_user(email="cw4b@example.com")
    resp = client.put(
        URL,
        json={"weights": [{"category_id": str(uuid.uuid4()), "weight": 1}]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_CATEGORY"


def test_put_category_weights_other_users_category_is_invalid_category(
    client, make_user, auth_headers, category_id
):
    user_a = make_user(email="cw6a@example.com")
    user_b = make_user(email="cw6b@example.com")
    own = str(category_id(user_a.id, "study"))
    resp = client.put(
        URL,
        json={
            "weights": [
                {"category_id": own, "weight": 2},
                {"category_id": str(category_id(user_b.id, "fitness")), "weight": 5},
            ]
        },
        headers=auth_headers(user_a.id),
    )
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "INVALID_CATEGORY"
    # Nothing was written, not even the valid row.
    assert _weights(client.get(URL, headers=auth_headers(user_a.id)))[own] == 1.0
    # And B's weight is untouched.
    b_weights = _weights(client.get(URL, headers=auth_headers(user_b.id)))
    assert b_weights[str(category_id(user_b.id, "fitness"))] == 1.0


def test_put_category_weights_requires_auth(client):
    resp = client.put(URL, json={"weights": [{"category_id": str(uuid.uuid4()), "weight": 1}]})
    assert resp.status_code == 401


def test_category_weights_isolated_per_user(client, make_user, auth_headers, category_id):
    user_a = make_user(email="cw5a@example.com")
    user_b = make_user(email="cw5b@example.com")

    client.put(
        URL,
        json={"weights": [{"category_id": str(category_id(user_a.id)), "weight": 3}]},
        headers=auth_headers(user_a.id),
    )

    weights_b = _weights(client.get(URL, headers=auth_headers(user_b.id)))
    assert set(weights_b.values()) == {1.0}
    assert str(category_id(user_a.id)) not in weights_b
