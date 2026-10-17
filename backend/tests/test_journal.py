"""Tests for /journal (docs/api-contract.yaml `journal` tag): list (search,
tag, date filter, pagination, tz_offset), stats, get, create, update, delete,
and the Markdown export. Every route: auth required (401), cross-user
isolation (404, never leak), validation (422).
"""

from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy import func, select

from app.main import JOURNAL_EXPORT_HEADERS
from app.models import GoalStatus, JournalEntry, ScoreSnapshot
from app.services.journal_service import normalize_tag

BASE = "/api/v1/journal"


@pytest.fixture()
def make_entry(db_session):
    """Insert an entry directly, optionally with a fixed created_at (inside
    one test transaction `now()` is constant, so ordering tests need this).
    """

    def _make_entry(
        *,
        user_id: uuid.UUID,
        body: str = "Some text",
        title: str | None = None,
        mood: int | None = None,
        tags: list[str] | None = None,
        created_at: datetime | None = None,
    ) -> JournalEntry:
        entry = JournalEntry(user_id=user_id, body=body, title=title, mood=mood, tags=tags or [])
        db_session.add(entry)
        db_session.commit()
        if created_at is not None:
            entry.created_at = created_at
            db_session.commit()
        db_session.refresh(entry)
        return entry

    return _make_entry


def utc(y, m, d, h=12, mi=0) -> datetime:
    return datetime(y, m, d, h, mi, tzinfo=timezone.utc)


# ---------------------------------------------------------------------------
# Auth required on every route
# ---------------------------------------------------------------------------


@pytest.mark.parametrize(
    "method,path",
    [
        ("get", BASE),
        ("post", BASE),
        ("get", f"{BASE}/stats"),
        ("get", f"{BASE}/export"),
        ("get", f"{BASE}/{uuid.uuid4()}"),
        ("patch", f"{BASE}/{uuid.uuid4()}"),
        ("delete", f"{BASE}/{uuid.uuid4()}"),
    ],
)
def test_journal_routes_require_auth(client, method, path):
    kwargs = {"json": {"body": "x"}} if method in ("post", "patch") else {}
    resp = getattr(client, method)(path, **kwargs)
    assert resp.status_code == 401
    assert resp.json()["error"]["code"] == "UNAUTHORIZED"


# ---------------------------------------------------------------------------
# Create
# ---------------------------------------------------------------------------


def test_create_entry_happy_path(client, make_user, auth_headers):
    user = make_user(email="j-create@example.com")
    resp = client.post(
        BASE,
        json={"title": "  Leg day  ", "body": "Squats\n\nfelt heavy ", "mood": 4, "tags": ["Gym", "#legs"]},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 201
    body = resp.json()
    assert set(body) == {"id", "title", "body", "mood", "tags", "created_at", "updated_at"}
    assert body["title"] == "Leg day"
    assert body["body"] == "Squats\n\nfelt heavy "  # stored as sent
    assert body["mood"] == 4
    assert body["tags"] == ["gym", "legs"]
    uuid.UUID(body["id"])


def test_create_entry_minimal_defaults(client, make_user, auth_headers):
    user = make_user(email="j-create-min@example.com")
    resp = client.post(BASE, json={"body": "just text", "title": "   "}, headers=auth_headers(user.id))
    assert resp.status_code == 201
    body = resp.json()
    assert body["title"] is None  # whitespace-only title -> null
    assert body["mood"] is None
    assert body["tags"] == []


def test_create_entry_tag_normalisation_and_dedupe(client, make_user, auth_headers):
    user = make_user(email="j-tags@example.com")
    resp = client.post(
        BASE,
        json={
            "body": "x",
            "tags": ["  #Side   Project ", "side-project", "GYM", "gym", "नेपाल", "under_score", "Ünïcode", "42"],
        },
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 201
    assert resp.json()["tags"] == ["side-project", "gym", "नेपाल", "under_score", "ünïcode", "42"]


def test_normalize_tag_unit():
    assert normalize_tag("नेपाल") == "नेपाल"
    assert normalize_tag("#नेपाल यात्रा") == "नेपाल-यात्रा"
    assert normalize_tag("##Gym") == "gym"
    assert normalize_tag("a" * 32) == "a" * 32
    assert normalize_tag("a" * 33) is None
    assert normalize_tag("#") is None
    assert normalize_tag("   ") is None
    assert normalize_tag("c++") is None
    assert normalize_tag("hello!") is None
    assert normalize_tag("emoji🔥") is None


@pytest.mark.parametrize(
    "payload",
    [
        {},  # body required
        {"body": ""},
        {"body": "   \n\t "},  # whitespace only
        {"body": "x" * 50001},
        {"body": "x", "title": "t" * 121},
        {"body": "x", "mood": 0},
        {"body": "x", "mood": 6},
        {"body": "x", "tags": ["ok", "bad tag!"]},
        {"body": "x", "tags": ["#"]},
        {"body": "x", "tags": ["a" * 33]},
        {"body": "x", "tags": [f"t{i}" for i in range(11)]},
        {"body": "x", "tags": None},
    ],
)
def test_create_entry_validation_errors(client, make_user, auth_headers, payload):
    user = make_user(email="j-create-422@example.com")
    resp = client.post(BASE, json=payload, headers=auth_headers(user.id))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_create_entry_does_not_touch_scoring(client, make_user, make_goal, auth_headers, db_session):
    user = make_user(email="j-noscore@example.com")
    make_goal(user_id=user.id)
    before = db_session.scalar(select(func.count()).select_from(ScoreSnapshot))
    resp = client.post(BASE, json={"body": "x", "mood": 1}, headers=auth_headers(user.id))
    assert resp.status_code == 201
    after = db_session.scalar(select(func.count()).select_from(ScoreSnapshot))
    assert after == before


# ---------------------------------------------------------------------------
# Get
# ---------------------------------------------------------------------------


def test_get_entry_happy_path(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-get@example.com")
    entry = make_entry(user_id=user.id, body="hello", tags=["a"])
    resp = client.get(f"{BASE}/{entry.id}", headers=auth_headers(user.id))
    assert resp.status_code == 200
    assert resp.json()["id"] == str(entry.id)
    assert resp.json()["tags"] == ["a"]


def test_get_entry_other_user_404(client, make_user, make_entry, auth_headers):
    owner = make_user(email="j-owner@example.com")
    other = make_user(email="j-other@example.com")
    entry = make_entry(user_id=owner.id, body="secret")
    resp = client.get(f"{BASE}/{entry.id}", headers=auth_headers(other.id))
    assert resp.status_code == 404
    assert resp.json()["error"]["code"] == "NOT_FOUND"
    assert "secret" not in resp.text


def test_get_entry_missing_and_malformed_id_404(client, make_user, auth_headers):
    user = make_user(email="j-missing@example.com")
    headers = auth_headers(user.id)
    assert client.get(f"{BASE}/{uuid.uuid4()}", headers=headers).status_code == 404
    assert client.get(f"{BASE}/not-a-uuid", headers=headers).status_code == 404


# ---------------------------------------------------------------------------
# Update
# ---------------------------------------------------------------------------


def test_update_entry_partial(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-patch@example.com")
    entry = make_entry(user_id=user.id, body="orig", title="T", mood=3, tags=["a", "b"])
    headers = auth_headers(user.id)

    resp = client.patch(f"{BASE}/{entry.id}", json={"mood": 5}, headers=headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["mood"] == 5
    assert body["title"] == "T"
    assert body["body"] == "orig"
    assert body["tags"] == ["a", "b"]

    resp = client.patch(
        f"{BASE}/{entry.id}", json={"tags": ["#C", "c", "d"], "title": None, "mood": None}, headers=headers
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["tags"] == ["c", "d"]  # replaces the whole list
    assert body["title"] is None
    assert body["mood"] is None

    resp = client.patch(f"{BASE}/{entry.id}", json={"tags": []}, headers=headers)
    assert resp.json()["tags"] == []

    resp = client.patch(f"{BASE}/{entry.id}", json={"body": "new body", "title": "  "}, headers=headers)
    assert resp.json()["body"] == "new body"
    assert resp.json()["title"] is None


def test_update_entry_created_at_not_editable(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-patch-ca@example.com")
    entry = make_entry(user_id=user.id, created_at=utc(2026, 1, 1))
    resp = client.patch(
        f"{BASE}/{entry.id}",
        json={"body": "x", "created_at": "2020-01-01T00:00:00Z"},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    assert resp.json()["created_at"].startswith("2026-01-01")


@pytest.mark.parametrize(
    "payload",
    [
        {},
        {"body": None},
        {"body": ""},
        {"body": "   "},
        {"tags": None},
        {"tags": ["bad tag!"]},
        {"tags": [f"t{i}" for i in range(11)]},
        {"mood": 9},
        {"title": "t" * 121},
    ],
)
def test_update_entry_validation_errors(client, make_user, make_entry, auth_headers, payload):
    user = make_user(email="j-patch-422@example.com")
    entry = make_entry(user_id=user.id)
    resp = client.patch(f"{BASE}/{entry.id}", json=payload, headers=auth_headers(user.id))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


def test_update_entry_other_user_404_and_unchanged(client, make_user, make_entry, auth_headers, db_session):
    owner = make_user(email="j-patch-owner@example.com")
    other = make_user(email="j-patch-other@example.com")
    entry = make_entry(user_id=owner.id, body="mine")
    resp = client.patch(f"{BASE}/{entry.id}", json={"body": "hacked"}, headers=auth_headers(other.id))
    assert resp.status_code == 404
    db_session.refresh(entry)
    assert entry.body == "mine"


# ---------------------------------------------------------------------------
# Delete
# ---------------------------------------------------------------------------


def test_delete_entry_hard_deletes(client, make_user, make_entry, auth_headers, db_session):
    user = make_user(email="j-del@example.com")
    entry = make_entry(user_id=user.id)
    entry_id = entry.id
    headers = auth_headers(user.id)

    resp = client.delete(f"{BASE}/{entry_id}", headers=headers)
    assert resp.status_code == 204
    assert resp.content == b""
    db_session.expire_all()
    assert db_session.get(JournalEntry, entry_id) is None
    assert client.get(f"{BASE}/{entry_id}", headers=headers).status_code == 404
    assert client.delete(f"{BASE}/{entry_id}", headers=headers).status_code == 404


def test_delete_entry_other_user_404(client, make_user, make_entry, auth_headers, db_session):
    owner = make_user(email="j-del-owner@example.com")
    other = make_user(email="j-del-other@example.com")
    entry = make_entry(user_id=owner.id)
    assert client.delete(f"{BASE}/{entry.id}", headers=auth_headers(other.id)).status_code == 404
    assert client.delete(f"{BASE}/not-a-uuid", headers=auth_headers(other.id)).status_code == 404
    db_session.expire_all()
    assert db_session.get(JournalEntry, entry.id) is not None


# ---------------------------------------------------------------------------
# List
# ---------------------------------------------------------------------------


def test_list_newest_first_and_only_mine(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-list@example.com")
    other = make_user(email="j-list-other@example.com")
    e1 = make_entry(user_id=user.id, body="one", created_at=utc(2026, 10, 1))
    e3 = make_entry(user_id=user.id, body="three", created_at=utc(2026, 10, 3))
    e2 = make_entry(user_id=user.id, body="two", created_at=utc(2026, 10, 2))
    make_entry(user_id=other.id, body="not yours", created_at=utc(2026, 10, 4))

    resp = client.get(BASE, headers=auth_headers(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert set(body) == {"items", "total", "limit", "offset"}
    assert [i["id"] for i in body["items"]] == [str(e3.id), str(e2.id), str(e1.id)]
    assert body["total"] == 3
    assert body["limit"] == 20
    assert body["offset"] == 0


def test_list_empty(client, make_user, auth_headers):
    user = make_user(email="j-list-empty@example.com")
    resp = client.get(BASE, headers=auth_headers(user.id))
    assert resp.json() == {"items": [], "total": 0, "limit": 20, "offset": 0}


def test_list_pagination(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-page@example.com")
    for i in range(5):
        make_entry(user_id=user.id, body=f"entry {i}", created_at=utc(2026, 10, 1 + i))
    headers = auth_headers(user.id)

    page1 = client.get(BASE, params={"limit": 2, "offset": 0}, headers=headers).json()
    page2 = client.get(BASE, params={"limit": 2, "offset": 2}, headers=headers).json()
    page3 = client.get(BASE, params={"limit": 2, "offset": 4}, headers=headers).json()
    beyond = client.get(BASE, params={"limit": 2, "offset": 10}, headers=headers).json()

    assert [i["body"] for i in page1["items"]] == ["entry 4", "entry 3"]
    assert [i["body"] for i in page2["items"]] == ["entry 2", "entry 1"]
    assert [i["body"] for i in page3["items"]] == ["entry 0"]
    assert beyond["items"] == []
    assert page1["total"] == page3["total"] == beyond["total"] == 5
    assert page2["limit"] == 2 and page2["offset"] == 2


def test_list_search_title_body_tags_case_insensitive(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-search@example.com")
    other = make_user(email="j-search-other@example.com")
    make_entry(user_id=user.id, title="Leg DAY", body="a", created_at=utc(2026, 10, 1))
    make_entry(user_id=user.id, body="felt like a leg day today", created_at=utc(2026, 10, 2))
    make_entry(user_id=user.id, body="b", tags=["legday"], created_at=utc(2026, 10, 3))
    make_entry(user_id=user.id, body="nothing here", created_at=utc(2026, 10, 4))
    make_entry(user_id=other.id, body="leg day for someone else")
    headers = auth_headers(user.id)

    body = client.get(BASE, params={"q": "  LEG  "}, headers=headers).json()
    assert body["total"] == 3
    assert {i["body"] for i in body["items"]} == {"a", "felt like a leg day today", "b"}

    # Empty/whitespace q = no search.
    assert client.get(BASE, params={"q": "   "}, headers=headers).json()["total"] == 4


def test_list_search_escapes_like_wildcards(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-like@example.com")
    make_entry(user_id=user.id, body="100% done")
    make_entry(user_id=user.id, body="100 done")
    make_entry(user_id=user.id, body="snake_case")
    make_entry(user_id=user.id, body="snakeXcase")
    headers = auth_headers(user.id)
    assert client.get(BASE, params={"q": "100%"}, headers=headers).json()["total"] == 1
    assert client.get(BASE, params={"q": "e_c"}, headers=headers).json()["total"] == 1


def test_list_tag_filter_normalised(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-tagf@example.com")
    make_entry(user_id=user.id, body="1", tags=["gym", "legs"])
    make_entry(user_id=user.id, body="2", tags=["gymnastics"])
    make_entry(user_id=user.id, body="3", tags=["नेपाल"])
    headers = auth_headers(user.id)

    body = client.get(BASE, params={"tag": "#Gym"}, headers=headers).json()
    assert [i["body"] for i in body["items"]] == ["1"]
    assert body["total"] == 1
    assert client.get(BASE, params={"tag": "नेपाल"}, headers=headers).json()["total"] == 1


def test_list_date_filter_with_tz_offset(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-dates@example.com")
    # 2026-10-01 20:00 UTC is 2026-10-02 01:45 in Nepal (+345).
    make_entry(user_id=user.id, body="late", created_at=utc(2026, 10, 1, 20, 0))
    make_entry(user_id=user.id, body="mid", created_at=utc(2026, 10, 1, 10, 0))
    make_entry(user_id=user.id, body="next", created_at=utc(2026, 10, 3, 10, 0))
    headers = auth_headers(user.id)

    utc_day = client.get(BASE, params={"from": "2026-10-01", "to": "2026-10-01"}, headers=headers).json()
    assert {i["body"] for i in utc_day["items"]} == {"late", "mid"}

    nepal_day = client.get(
        BASE, params={"from": "2026-10-02", "to": "2026-10-02", "tz_offset": 345}, headers=headers
    ).json()
    assert [i["body"] for i in nepal_day["items"]] == ["late"]

    open_ended = client.get(BASE, params={"from": "2026-10-02"}, headers=headers).json()
    assert [i["body"] for i in open_ended["items"]] == ["next"]


@pytest.mark.parametrize(
    "params",
    [
        {"limit": 0},
        {"limit": 101},
        {"offset": -1},
        {"q": "x" * 201},
        {"tag": "x" * 33},
        {"tag": "bad tag!"},
        {"from": "2026-10-05", "to": "2026-10-01"},
        {"from": "not-a-date"},
        {"tz_offset": 841},
        {"tz_offset": -721},
    ],
)
def test_list_validation_errors(client, make_user, auth_headers, params):
    user = make_user(email="j-list-422@example.com")
    resp = client.get(BASE, params=params, headers=auth_headers(user.id))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Stats
# ---------------------------------------------------------------------------


def test_stats_month(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-stats@example.com")
    other = make_user(email="j-stats-other@example.com")
    make_entry(user_id=user.id, mood=4, tags=["gym", "legs"], created_at=utc(2026, 2, 3, 8))
    make_entry(user_id=user.id, mood=5, tags=["gym"], created_at=utc(2026, 2, 3, 9))
    make_entry(user_id=user.id, mood=None, tags=["work"], created_at=utc(2026, 2, 10))
    make_entry(user_id=user.id, mood=1, tags=["apple"], created_at=utc(2026, 3, 1))  # other month
    make_entry(user_id=other.id, mood=1, tags=["gym", "zzz"], created_at=utc(2026, 2, 3))

    resp = client.get(f"{BASE}/stats", params={"month": "2026-02"}, headers=auth_headers(user.id))
    assert resp.status_code == 200
    body = resp.json()
    assert body["month"] == "2026-02"
    assert body["entry_count"] == 3
    assert body["avg_mood"] == 4.5
    assert body["total_entries"] == 4

    days = body["days"]
    assert len(days) == 28
    assert [d["date"] for d in days] == [f"2026-02-{i:02d}" for i in range(1, 29)]
    by_date = {d["date"]: d for d in days}
    assert by_date["2026-02-03"] == {"date": "2026-02-03", "entry_count": 2, "avg_mood": 4.5}
    assert by_date["2026-02-10"] == {"date": "2026-02-10", "entry_count": 1, "avg_mood": None}
    assert by_date["2026-02-01"] == {"date": "2026-02-01", "entry_count": 0, "avg_mood": None}

    # All-time, most used first, ties alphabetical; no other user's tags.
    assert body["tags"] == [
        {"tag": "gym", "count": 2},
        {"tag": "apple", "count": 1},
        {"tag": "legs", "count": 1},
        {"tag": "work", "count": 1},
    ]


def test_stats_days_cover_every_day_of_month(client, make_user, auth_headers):
    user = make_user(email="j-stats-days@example.com")
    headers = auth_headers(user.id)
    for month, n in [("2026-01", 31), ("2026-04", 30), ("2028-02", 29)]:
        body = client.get(f"{BASE}/stats", params={"month": month}, headers=headers).json()
        assert len(body["days"]) == n
        assert body["days"][0]["date"] == f"{month}-01"
        assert body["days"][-1]["date"] == f"{month}-{n:02d}"


def test_stats_empty_user(client, make_user, auth_headers):
    user = make_user(email="j-stats-empty@example.com")
    body = client.get(f"{BASE}/stats", params={"month": "2026-10"}, headers=auth_headers(user.id)).json()
    assert body["entry_count"] == 0
    assert body["avg_mood"] is None
    assert body["total_entries"] == 0
    assert body["tags"] == []
    assert len(body["days"]) == 31
    assert all(d["entry_count"] == 0 and d["avg_mood"] is None for d in body["days"])


def test_stats_tz_offset_buckets(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-stats-tz@example.com")
    # 2026-09-30 20:00 UTC = 2026-10-01 01:45 Nepal.
    make_entry(user_id=user.id, mood=2, created_at=utc(2026, 9, 30, 20))
    headers = auth_headers(user.id)

    utc_body = client.get(f"{BASE}/stats", params={"month": "2026-10"}, headers=headers).json()
    assert utc_body["entry_count"] == 0

    np_body = client.get(f"{BASE}/stats", params={"month": "2026-10", "tz_offset": 345}, headers=headers).json()
    assert np_body["entry_count"] == 1
    assert np_body["days"][0] == {"date": "2026-10-01", "entry_count": 1, "avg_mood": 2.0}


def test_stats_avg_mood_one_decimal(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-stats-round@example.com")
    for mood in (4, 4, 5):
        make_entry(user_id=user.id, mood=mood, created_at=utc(2026, 5, 5))
    body = client.get(f"{BASE}/stats", params={"month": "2026-05"}, headers=auth_headers(user.id)).json()
    assert body["avg_mood"] == 4.3


def test_stats_default_month_is_current(client, make_user, auth_headers):
    user = make_user(email="j-stats-default@example.com")
    body = client.get(f"{BASE}/stats", headers=auth_headers(user.id)).json()
    today = datetime.now(timezone.utc).date()
    assert body["month"] == f"{today.year:04d}-{today.month:02d}"


@pytest.mark.parametrize(
    "params", [{"month": "2026-13"}, {"month": "2026-1"}, {"month": "oct"}, {"tz_offset": 9999}]
)
def test_stats_validation_errors(client, make_user, auth_headers, params):
    user = make_user(email="j-stats-422@example.com")
    resp = client.get(f"{BASE}/stats", params=params, headers=auth_headers(user.id))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"


# ---------------------------------------------------------------------------
# Export
# ---------------------------------------------------------------------------


def test_export_headers_and_body_format(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-export@example.com")
    other = make_user(email="j-export-other@example.com")
    make_entry(
        user_id=user.id,
        title="Leg day finally",
        body="Squats felt heavy\n# not a heading\n  ## also escaped\nlast line",
        mood=4,
        tags=["gym", "legs"],
        created_at=utc(2026, 10, 17, 6),
    )
    make_entry(user_id=user.id, body="Random thought", mood=3, created_at=utc(2026, 10, 16, 6))
    make_entry(user_id=user.id, body="tags only", tags=["x"], created_at=utc(2026, 10, 15, 6))
    make_entry(user_id=user.id, body="plain", created_at=utc(2026, 10, 14, 6))
    make_entry(user_id=user.id, body="outside range", created_at=utc(2026, 9, 1, 6))
    make_entry(user_id=other.id, body="other user secret", created_at=utc(2026, 10, 16, 6))

    resp = client.get(
        f"{BASE}/export",
        params={"from": "2026-10-14", "to": "2026-10-17", "include_goals": "false"},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "text/markdown; charset=utf-8"
    assert (
        resp.headers["content-disposition"]
        == 'attachment; filename="bihan-journal-2026-10-14-to-2026-10-17.md"'
    )
    assert resp.headers["x-journal-entry-count"] == "4"
    # Body words only: 12 (first entry, '#'/'##' count) + 2 + 2 + 1.
    assert resp.headers["x-journal-word-count"] == str(3 + 4 + 3 + 2 + 2 + 2 + 1)
    assert resp.headers["x-journal-goal-count"] == "0"

    text = resp.text
    assert "other user secret" not in text
    assert "outside range" not in text
    assert "## Goals and scores" not in text
    lines = text.split("\n")
    assert lines[0] == "# Bihan journal: Oct 14 – Oct 17, 2026"
    assert lines[1].startswith("Exported: ") and lines[1].endswith(" · 4 entries")
    assert lines[2] == ""
    entries_section = text[text.index("## Entries\n"):]
    assert entries_section == (
        "## Entries\n"
        "### Wed, Oct 14\n"
        "plain\n"
        "\n"
        "### Thu, Oct 15\n"
        "Tags: #x\n"
        "tags only\n"
        "\n"
        "### Fri, Oct 16\n"
        "Mood: 3/5 (Okay)\n"
        "Random thought\n"
        "\n"
        "### Sat, Oct 17 · Leg day finally\n"
        "Mood: 4/5 (Good) · Tags: #gym #legs\n"
        "Squats felt heavy\n"
        "\\# not a heading\n"
        "  \\## also escaped\n"
        "last line\n"
    )


def test_export_cors_exposes_headers(client, make_user, auth_headers):
    user = make_user(email="j-export-cors@example.com")
    resp = client.get(
        f"{BASE}/export",
        params={"from": "2026-10-01", "to": "2026-10-02", "include_goals": "false"},
        headers={**auth_headers(user.id), "Origin": "http://localhost:5173"},
    )
    assert resp.status_code == 200
    exposed = {h.strip().lower() for h in resp.headers["access-control-expose-headers"].split(",")}
    assert {h.lower() for h in JOURNAL_EXPORT_HEADERS} <= exposed


def test_export_empty_range(client, make_user, auth_headers):
    user = make_user(email="j-export-empty@example.com")
    resp = client.get(
        f"{BASE}/export",
        params={"from": "2026-10-01", "to": "2026-10-01", "include_goals": "false"},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    assert resp.headers["x-journal-entry-count"] == "0"
    assert resp.headers["x-journal-word-count"] == "0"
    assert resp.text.startswith("# Bihan journal: Oct 1, 2026\nExported: ")
    assert " · 0 entries\n" in resp.text
    assert resp.text.endswith("## Entries\nNo entries in this range.\n")


def test_export_defaults_from_first_entry_to_today(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-export-default@example.com")
    first = datetime.now(timezone.utc) - timedelta(days=40)
    make_entry(user_id=user.id, body="first", created_at=first)
    make_entry(user_id=user.id, body="second")
    resp = client.get(f"{BASE}/export", params={"include_goals": "false"}, headers=auth_headers(user.id))
    assert resp.status_code == 200
    today = datetime.now(timezone.utc).date()
    assert resp.headers["content-disposition"] == (
        f'attachment; filename="bihan-journal-{first.date().isoformat()}-to-{today.isoformat()}.md"'
    )
    assert resp.headers["x-journal-entry-count"] == "2"


def test_export_defaults_with_no_entries(client, make_user, auth_headers):
    user = make_user(email="j-export-none@example.com")
    resp = client.get(f"{BASE}/export", params={"include_goals": "false"}, headers=auth_headers(user.id))
    assert resp.status_code == 200
    today = datetime.now(timezone.utc).date().isoformat()
    assert f"bihan-journal-{today}-to-{today}.md" in resp.headers["content-disposition"]


def test_export_year_added_when_range_spans_years(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-export-years@example.com")
    make_entry(user_id=user.id, body="old", created_at=utc(2025, 12, 31, 6))
    make_entry(user_id=user.id, body="new", title="NY", created_at=utc(2026, 1, 1, 6))
    resp = client.get(
        f"{BASE}/export",
        params={"from": "2025-12-30", "to": "2026-01-02", "include_goals": "false"},
        headers=auth_headers(user.id),
    )
    text = resp.text
    assert text.startswith("# Bihan journal: Dec 30, 2025 – Jan 2, 2026\n")
    assert "### Wed, Dec 31, 2025\nold\n" in text
    assert "### Thu, Jan 1, 2026 · NY\nnew\n" in text


def test_export_uses_tz_offset_for_dates(client, make_user, make_entry, auth_headers):
    user = make_user(email="j-export-tz@example.com")
    # 2026-10-16 20:00 UTC = Sat Oct 17 01:45 Nepal.
    make_entry(user_id=user.id, body="late night", created_at=utc(2026, 10, 16, 20))
    headers = auth_headers(user.id)
    params = {"from": "2026-10-17", "to": "2026-10-17", "include_goals": "false"}

    utc_resp = client.get(f"{BASE}/export", params=params, headers=headers)
    assert utc_resp.headers["x-journal-entry-count"] == "0"

    np_resp = client.get(f"{BASE}/export", params={**params, "tz_offset": 345}, headers=headers)
    assert np_resp.headers["x-journal-entry-count"] == "1"
    assert "### Sat, Oct 17\nlate night\n" in np_resp.text


def test_export_goals_section(client, make_user, make_goal, auth_headers, db_session):
    from app.models import GoalType

    user = make_user(email="j-export-goals@example.com")
    other = make_user(email="j-export-goals-other@example.com")
    today = datetime.now(timezone.utc).date()
    make_goal(user_id=user.id, title="Bench press", target_value=Decimal("80"), current_value=Decimal("72.5"))
    make_goal(user_id=user.id, title="Morning run", type=GoalType.HABIT, frequency_per_week=5)
    make_goal(user_id=user.id, title="Archived one", status=GoalStatus.ARCHIVED)
    make_goal(user_id=user.id, title="Future goal", start_date=today + timedelta(days=30))
    make_goal(user_id=other.id, title="Not mine")

    resp = client.get(
        f"{BASE}/export",
        params={"from": today.isoformat(), "to": today.isoformat()},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    assert resp.headers["x-journal-goal-count"] == "2"
    text = resp.text
    assert "\n## Goals and scores\n- Overall: " in text
    assert "- Bench press: " in text and "· 72.5 / 80 kg\n" in text
    assert "- Morning run: " in text and "· 0 / 5 this week\n" in text
    assert "Archived one" not in text
    assert "Future goal" not in text
    assert "Not mine" not in text
    # Goals section comes before entries.
    assert text.index("## Goals and scores") < text.index("## Entries")


def test_export_goals_section_no_goals(client, make_user, auth_headers):
    user = make_user(email="j-export-nogoals@example.com")
    resp = client.get(
        f"{BASE}/export", params={"from": "2026-10-01", "to": "2026-10-02"}, headers=auth_headers(user.id)
    )
    assert resp.headers["x-journal-goal-count"] == "0"
    assert "## Goals and scores\n- No goals yet.\n" in resp.text


def test_export_weekly_scores_from_snapshots(client, make_user, make_goal, auth_headers, db_session):
    user = make_user(email="j-export-weekly@example.com")
    today = datetime.now(timezone.utc).date()
    start = today - timedelta(days=40)
    goal = make_goal(
        user_id=user.id,
        title="Old goal",
        start_date=start,
        created_at=datetime.combine(start, datetime.min.time(), tzinfo=timezone.utc),
    )
    monday = today - timedelta(days=today.weekday()) - timedelta(days=7)
    db_session.add(
        ScoreSnapshot(
            goal_id=goal.id,
            snapshot_date=monday + timedelta(days=1),
            pace=Decimal("0.5"),
            consistency=Decimal("0.5"),
            momentum=Decimal("0.5"),
            effort=Decimal("0.5"),
            total=50,
        ))
    db_session.commit()

    resp = client.get(
        f"{BASE}/export",
        params={"from": (monday - timedelta(days=1)).isoformat(), "to": today.isoformat()},
        headers=auth_headers(user.id),
    )
    assert resp.status_code == 200
    text = resp.text
    assert "### Weekly overall scores\n- Week of " in text
    week_lines = [line for line in text.split("\n") if line.startswith("- Week of ")]
    # Only the week with snapshot data is listed.
    assert len(week_lines) == 1


def test_export_does_not_write_snapshots(client, make_user, make_goal, auth_headers, db_session):
    user = make_user(email="j-export-ro@example.com")
    make_goal(user_id=user.id)
    before = db_session.scalar(select(func.count()).select_from(ScoreSnapshot))
    resp = client.get(f"{BASE}/export", headers=auth_headers(user.id))
    assert resp.status_code == 200
    assert db_session.scalar(select(func.count()).select_from(ScoreSnapshot)) == before


@pytest.mark.parametrize(
    "params",
    [
        {"from": "2026-10-05", "to": "2026-10-01"},
        {"from": "bad"},
        {"include_goals": "maybe"},
        {"tz_offset": -721},
    ],
)
def test_export_validation_errors(client, make_user, auth_headers, params):
    user = make_user(email="j-export-422@example.com")
    resp = client.get(f"{BASE}/export", params=params, headers=auth_headers(user.id))
    assert resp.status_code == 422
    assert resp.json()["error"]["code"] == "VALIDATION_ERROR"
