"""Tests for /categories (docs/api-contract.yaml 1.1.0 `categories` tag)."""

from __future__ import annotations

import uuid

from sqlalchemy import select

from app.models import CategoryWeight, GoalStatus

URL = "/api/v1/categories"


def _new(client, h, name="Music", emoji="🎸", color="pink"):
    return client.post(URL, json={"name": name, "emoji": emoji, "color": color}, headers=h)


def _list(client, h):
    resp = client.get(URL, headers=h)
    assert resp.status_code == 200, resp.text
    return resp.json()


# --------------------------------------------------------------------------
# Register seeds defaults / GET
# --------------------------------------------------------------------------


def test_register_seeds_four_default_categories(client):
    resp = client.post(
        "/api/v1/auth/register",
        json={"name": "New", "email": "cat-reg@example.com", "password": "password123"},
    )
    assert resp.status_code == 201
    h = {"Authorization": f"Bearer {resp.json()['access_token']}"}

    cats = _list(client, h)
    assert [(c["name"], c["emoji"], c["color"], c["sort_order"]) for c in cats] == [
        ("Fitness", "🏃", "teal", 0),
        ("Study", "📚", "violet", 1),
        ("Career", "💼", "indigo", 2),
        ("Custom", "✨", "slate", 3),
    ]
    assert all(c["is_default"] is True and c["goal_count"] == 0 for c in cats)
    assert set(cats[0]) == {
        "id", "name", "emoji", "color", "sort_order", "is_default", "goal_count", "created_at"
    }


def test_list_categories_requires_auth(client):
    assert client.get(URL).status_code == 401


def test_list_categories_goal_count_includes_every_status(client, make_user, make_goal, auth_headers):
    user = make_user(email="cat-count@example.com")
    make_goal(user_id=user.id, category="study")
    make_goal(user_id=user.id, category="study", status=GoalStatus.ARCHIVED)
    make_goal(user_id=user.id, category="study", status=GoalStatus.COMPLETED)
    make_goal(user_id=user.id, category="career")

    counts = {c["name"]: c["goal_count"] for c in _list(client, auth_headers(user.id))}
    assert counts == {"Fitness": 0, "Study": 3, "Career": 1, "Custom": 0}


def test_list_categories_scoped_to_user(client, make_user, auth_headers):
    a = make_user(email="cat-list-a@example.com")
    b = make_user(email="cat-list-b@example.com")
    assert _new(client, auth_headers(a.id), name="Only A").status_code == 201

    names_b = [c["name"] for c in _list(client, auth_headers(b.id))]
    assert names_b == ["Fitness", "Study", "Career", "Custom"]
    a_ids = {c["id"] for c in _list(client, auth_headers(a.id))}
    b_ids = {c["id"] for c in _list(client, auth_headers(b.id))}
    assert not a_ids & b_ids


# --------------------------------------------------------------------------
# POST
# --------------------------------------------------------------------------


def test_create_category_success_appended_and_trimmed(client, make_user, auth_headers):
    user = make_user(email="cat-new@example.com")
    h = auth_headers(user.id)

    resp = _new(client, h, name="  Music  ", emoji="👨‍👩‍👧", color="rose")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["name"] == "Music"
    assert body["emoji"] == "👨‍👩‍👧"  # ZWJ sequence: several code points, allowed
    assert body["color"] == "rose"
    assert body["sort_order"] == 4
    assert body["is_default"] is False
    assert body["goal_count"] == 0

    second = _new(client, h, name="Money").json()
    assert second["sort_order"] == 5
    assert [c["name"] for c in _list(client, h)][-2:] == ["Music", "Money"]


def test_create_category_requires_auth(client):
    assert client.post(URL, json={"name": "X", "emoji": "🎸", "color": "pink"}).status_code == 401


def test_create_category_validation_errors(client, make_user, auth_headers):
    h = auth_headers(make_user(email="cat-422@example.com").id)
    for body in (
        {"name": "   ", "emoji": "🎸", "color": "pink"},  # empty after trim
        {"name": "", "emoji": "🎸", "color": "pink"},
        {"name": "n" * 25, "emoji": "🎸", "color": "pink"},
        {"name": "Ok", "emoji": "", "color": "pink"},
        {"name": "Ok", "emoji": "a" * 17, "color": "pink"},
        {"name": "Ok", "emoji": "🎸 ", "color": "pink"},  # whitespace
        {"name": "Ok", "emoji": "🎸", "color": "gold"},  # not an IdentityColor
        {"name": "Ok", "emoji": "🎸"},
        {"emoji": "🎸", "color": "pink"},
    ):
        resp = client.post(URL, json=body, headers=h)
        assert resp.status_code == 422, (body, resp.text)
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    # Boundaries that are fine.
    assert _new(client, h, name="n" * 24, emoji="a" * 16).status_code == 201


def test_create_category_name_taken_case_insensitive(client, make_user, auth_headers):
    user = make_user(email="cat-dupe@example.com")
    h = auth_headers(user.id)
    for name in ("fitness", "  FITNESS ", "Fitness"):
        resp = _new(client, h, name=name)
        assert resp.status_code == 409, name
        assert resp.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"

    assert _new(client, h, name="Music").status_code == 201
    resp = _new(client, h, name="MUSIC")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"

    # Another user's names never conflict.
    other = make_user(email="cat-dupe-other@example.com")
    assert _new(client, auth_headers(other.id), name="Music").status_code == 201


def test_create_category_name_race_maps_unique_index_to_409(
    client, make_user, auth_headers, monkeypatch
):
    """Two concurrent creates can both pass the name check; the second insert
    then hits ix_categories_user_id_name_lower, which must be a 409, not 500."""
    import app.routers.categories as categories_router

    h = auth_headers(make_user(email="cat-race@example.com").id)
    monkeypatch.setattr(categories_router, "is_name_taken", lambda *a, **k: False)

    resp = _new(client, h, name="fitness")
    assert resp.status_code == 409, resp.text
    assert resp.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"
    # The session is still usable afterwards.
    assert len(_list(client, h)) == 4


def test_create_category_limit_12(client, make_user, auth_headers):
    h = auth_headers(make_user(email="cat-limit@example.com").id)
    for i in range(8):
        assert _new(client, h, name=f"Cat {i}").status_code == 201
    cats = _list(client, h)
    assert len(cats) == 12
    assert [c["sort_order"] for c in cats] == list(range(12))

    resp = _new(client, h, name="One too many")
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CATEGORY_LIMIT_REACHED"


# --------------------------------------------------------------------------
# PATCH /categories/{id}
# --------------------------------------------------------------------------


def test_update_default_category_rename_and_recolour(client, make_user, auth_headers, category_id):
    user = make_user(email="cat-upd@example.com")
    h = auth_headers(user.id)
    cid = category_id(user.id, "fitness")

    resp = client.patch(f"{URL}/{cid}", json={"name": " Gym ", "color": "lime", "emoji": "🏋️"}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert (body["name"], body["color"], body["emoji"]) == ("Gym", "lime", "🏋️")
    assert body["is_default"] is True  # still a default after a rename
    assert body["sort_order"] == 0

    # Renaming to its own name in another case is not a conflict.
    resp = client.patch(f"{URL}/{cid}", json={"name": "GYM"}, headers=h)
    assert resp.status_code == 200
    assert resp.json()["name"] == "GYM"


def test_update_category_goal_count(client, make_user, make_goal, auth_headers, category_id):
    user = make_user(email="cat-upd-count@example.com")
    make_goal(user_id=user.id, category="career")
    resp = client.patch(
        f"{URL}/{category_id(user.id, 'career')}", json={"color": "sand"}, headers=auth_headers(user.id)
    )
    assert resp.json()["goal_count"] == 1


def test_update_category_name_taken(client, make_user, auth_headers, category_id):
    user = make_user(email="cat-upd-dupe@example.com")
    h = auth_headers(user.id)
    resp = client.patch(f"{URL}/{category_id(user.id, 'study')}", json={"name": "fItNeSs"}, headers=h)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CATEGORY_NAME_TAKEN"


def test_update_category_validation_errors(client, make_user, auth_headers, category_id):
    user = make_user(email="cat-upd-422@example.com")
    h = auth_headers(user.id)
    url = f"{URL}/{category_id(user.id, 'study')}"
    for body in ({}, {"name": None}, {"color": None}, {"emoji": None}, {"name": "  "},
                 {"name": "x" * 25}, {"emoji": "a b"}, {"color": "gold"}):
        resp = client.patch(url, json=body, headers=h)
        assert resp.status_code == 422, (body, resp.text)


def test_update_category_not_found_and_other_user(client, make_user, auth_headers, category_id):
    a = make_user(email="cat-upd-a@example.com")
    b = make_user(email="cat-upd-b@example.com")
    resp = client.patch(
        f"{URL}/{category_id(b.id, 'study')}", json={"name": "Hacked"}, headers=auth_headers(a.id)
    )
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"
    assert client.patch(f"{URL}/{uuid.uuid4()}", json={"name": "X"}, headers=auth_headers(a.id)).status_code == 404
    assert _list(client, auth_headers(b.id))[1]["name"] == "Study"


def test_update_category_requires_auth(client):
    assert client.patch(f"{URL}/{uuid.uuid4()}", json={"name": "X"}).status_code == 401


# --------------------------------------------------------------------------
# DELETE
# --------------------------------------------------------------------------


def test_delete_default_category_is_409(client, make_user, auth_headers, category_id):
    user = make_user(email="cat-del-def@example.com")
    resp = client.delete(f"{URL}/{category_id(user.id, 'custom')}", headers=auth_headers(user.id))
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CATEGORY_IS_DEFAULT"


def test_delete_empty_category_ignores_move_to_and_renumbers(client, make_user, auth_headers):
    h = auth_headers(make_user(email="cat-del-empty@example.com").id)
    first = _new(client, h, name="First").json()
    second = _new(client, h, name="Second").json()
    assert (first["sort_order"], second["sort_order"]) == (4, 5)

    resp = client.delete(f"{URL}/{first['id']}", params={"move_to": "garbage"}, headers=h)
    assert resp.status_code == 204

    cats = _list(client, h)
    assert [c["name"] for c in cats] == ["Fitness", "Study", "Career", "Custom", "Second"]
    assert [c["sort_order"] for c in cats] == [0, 1, 2, 3, 4]


def test_delete_category_with_goals_requires_move_to(client, make_user, make_goal, auth_headers):
    user = make_user(email="cat-del-goals@example.com")
    h = auth_headers(user.id)
    cat = _new(client, h).json()
    make_goal(user_id=user.id, category=uuid.UUID(cat["id"]), status=GoalStatus.ARCHIVED)

    resp = client.delete(f"{URL}/{cat['id']}", headers=h)
    assert resp.status_code == 409
    assert resp.json()["error"]["code"] == "CATEGORY_HAS_GOALS"
    assert len(_list(client, h)) == 5


def test_delete_category_invalid_move_target(client, make_user, make_goal, auth_headers, category_id):
    user = make_user(email="cat-del-bad@example.com")
    other = make_user(email="cat-del-bad-other@example.com")
    h = auth_headers(user.id)
    cat = _new(client, h).json()
    make_goal(user_id=user.id, category=uuid.UUID(cat["id"]))

    for target in (cat["id"], str(uuid.uuid4()), str(category_id(other.id, "fitness")), "not-a-uuid"):
        resp = client.delete(f"{URL}/{cat['id']}", params={"move_to": target}, headers=h)
        assert resp.status_code == 422, target
        assert resp.json()["error"]["code"] == "INVALID_MOVE_TARGET"
    assert len(_list(client, h)) == 5


def test_delete_category_moves_goals_and_drops_weight(
    client, db_session, make_user, make_goal, auth_headers, category_id
):
    user = make_user(email="cat-del-move@example.com")
    h = auth_headers(user.id)
    cat = _new(client, h).json()
    cat_id = uuid.UUID(cat["id"])
    later = _new(client, h, name="Later").json()
    active = make_goal(user_id=user.id, category=cat_id, title="Active")
    archived = make_goal(user_id=user.id, category=cat_id, title="Archived", status=GoalStatus.ARCHIVED)
    untouched = make_goal(user_id=user.id, category="fitness", title="Untouched")
    put = client.put(
        "/api/v1/settings/category-weights",
        json={"weights": [{"category_id": cat["id"], "weight": 3}]},
        headers=h,
    )
    assert put.status_code == 200

    study = category_id(user.id, "study")
    resp = client.delete(f"{URL}/{cat['id']}", params={"move_to": str(study)}, headers=h)
    assert resp.status_code == 204

    for goal in (active, archived):
        body = client.get(f"/api/v1/goals/{goal.id}", headers=h).json()
        assert body["category_id"] == str(study)
        assert body["category"]["name"] == "Study"
    assert client.get(f"/api/v1/goals/{archived.id}", headers=h).json()["status"] == "archived"
    assert client.get(f"/api/v1/goals/{untouched.id}", headers=h).json()["category"]["name"] == "Fitness"

    cats = _list(client, h)
    assert cat["id"] not in {c["id"] for c in cats}
    assert {c["name"]: c["goal_count"] for c in cats}["Study"] == 2
    assert [c["sort_order"] for c in cats] == [0, 1, 2, 3, 4]
    assert cats[-1]["id"] == later["id"]

    assert (
        db_session.scalar(select(CategoryWeight).where(CategoryWeight.category_id == cat_id)) is None
    )
    weights = client.get("/api/v1/settings/category-weights", headers=h).json()["weights"]
    assert cat["id"] not in {w["category_id"] for w in weights}


def test_delete_category_not_found_and_other_user(client, make_user, auth_headers):
    a = make_user(email="cat-del-a@example.com")
    b = make_user(email="cat-del-b@example.com")
    b_cat = _new(client, auth_headers(b.id)).json()

    resp = client.delete(f"{URL}/{b_cat['id']}", headers=auth_headers(a.id))
    assert resp.status_code == 404
    assert client.delete(f"{URL}/{uuid.uuid4()}", headers=auth_headers(a.id)).status_code == 404
    assert len(_list(client, auth_headers(b.id))) == 5


def test_delete_category_requires_auth(client):
    assert client.delete(f"{URL}/{uuid.uuid4()}").status_code == 401


# --------------------------------------------------------------------------
# PATCH /categories/order
# --------------------------------------------------------------------------


def test_reorder_categories(client, make_user, auth_headers):
    h = auth_headers(make_user(email="cat-order@example.com").id)
    _new(client, h)
    ids = [c["id"] for c in _list(client, h)]
    new_order = [ids[4], ids[2], ids[0], ids[3], ids[1]]

    resp = client.patch(f"{URL}/order", json={"category_ids": new_order}, headers=h)
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert [c["id"] for c in body] == new_order
    assert [c["sort_order"] for c in body] == [0, 1, 2, 3, 4]
    assert [c["id"] for c in _list(client, h)] == new_order


def test_reorder_categories_must_be_exact_set(client, make_user, auth_headers, category_id):
    user = make_user(email="cat-order-bad@example.com")
    other = make_user(email="cat-order-other@example.com")
    h = auth_headers(user.id)
    ids = [c["id"] for c in _list(client, h)]

    for bad in (
        ids[:3],  # missing
        ids + [ids[0]],  # duplicate (and too long for the set)
        ids[:3] + [ids[0]],  # duplicate, right length
        ids[:3] + [str(category_id(other.id, "fitness"))],  # foreign
        ids + [str(uuid.uuid4())],  # extra unknown
        [],
    ):
        resp = client.patch(f"{URL}/order", json={"category_ids": bad}, headers=h)
        assert resp.status_code == 422, bad
        assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
    assert [c["id"] for c in _list(client, h)] == ids
    # The other user's order is untouched.
    assert [c["sort_order"] for c in _list(client, auth_headers(other.id))] == [0, 1, 2, 3]


def test_reorder_categories_requires_auth(client):
    assert client.patch(f"{URL}/order", json={"category_ids": [str(uuid.uuid4())]}).status_code == 401
