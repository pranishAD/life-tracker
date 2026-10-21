"""SEC-002: the app must refuse to start on Vercel with a missing, placeholder
or short JWT_SECRET, while local dev / docker / tests (no VERCEL var) keep
working with the dev default.

Settings() is constructed directly with `_env_file=None` (so a developer's
local .env can't influence the result); `get_settings()` is lru_cached, so the
one test that goes through it clears the cache before and after.
"""

from __future__ import annotations

import os
import secrets
import subprocess
import sys
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.config import DEV_JWT_SECRET, Settings, get_settings

BACKEND_ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture
def on_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "1")


@pytest.fixture
def off_vercel(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)


def _build(monkeypatch, secret: str | None) -> Settings:
    if secret is None:
        monkeypatch.delenv("JWT_SECRET", raising=False)
    else:
        monkeypatch.setenv("JWT_SECRET", secret)
    return Settings(_env_file=None)


def test_vercel_rejects_default_secret(monkeypatch, on_vercel):
    with pytest.raises(ValidationError, match="JWT_SECRET"):
        _build(monkeypatch, None)


def test_vercel_rejects_explicit_dev_default(monkeypatch, on_vercel):
    with pytest.raises(ValidationError):
        _build(monkeypatch, DEV_JWT_SECRET)


@pytest.mark.parametrize("secret", ["", "changeme", "secret", "  SECRET  ", "ci-test-secret"])
def test_vercel_rejects_placeholders(monkeypatch, on_vercel, secret):
    with pytest.raises(ValidationError):
        _build(monkeypatch, secret)


def test_vercel_rejects_short_secret(monkeypatch, on_vercel):
    with pytest.raises(ValidationError):
        _build(monkeypatch, "a" * 31)


def test_vercel_accepts_long_random_secret(monkeypatch, on_vercel):
    secret = secrets.token_hex(24)  # 48 chars
    assert len(secret) == 48
    settings = _build(monkeypatch, secret)
    assert settings.jwt_secret == secret


def test_error_message_does_not_leak_secret(monkeypatch, on_vercel):
    weak = "short-but-unique-xyz123"
    with pytest.raises(ValidationError) as exc_info:
        _build(monkeypatch, weak)
    assert weak not in str(exc_info.value)
    assert weak not in repr(exc_info.value)


def test_without_vercel_default_secret_still_works(monkeypatch, off_vercel):
    settings = _build(monkeypatch, None)
    assert settings.jwt_secret == DEV_JWT_SECRET


def test_vercel_other_value_is_not_treated_as_vercel(monkeypatch):
    monkeypatch.setenv("VERCEL", "0")
    assert _build(monkeypatch, None).jwt_secret == DEV_JWT_SECRET


def test_get_settings_without_vercel_uses_default(monkeypatch, off_vercel):
    monkeypatch.delenv("JWT_SECRET", raising=False)
    get_settings.cache_clear()
    try:
        assert get_settings().jwt_secret
    finally:
        get_settings.cache_clear()


def _import_app_main(
    env_overrides: dict[str, str | None], cwd: Path
) -> subprocess.CompletedProcess:
    """Import app.main in a fresh interpreter (so module-level create_app()
    really runs with this env) from an empty scratch cwd (so no .env is picked
    up and nothing in cwd shadows the real `app`/`scoring` packages)."""
    env = dict(os.environ)
    for key, value in env_overrides.items():
        if value is None:
            env.pop(key, None)
        else:
            env[key] = value
    env["PYTHONPATH"] = str(BACKEND_ROOT) + os.pathsep + env.get("PYTHONPATH", "")
    return subprocess.run(
        [sys.executable, "-c", "import app.main"],
        cwd=str(cwd),
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )


def test_app_import_crashes_on_vercel_with_default_secret(tmp_path):
    """create_app() runs at import of app.main (the Vercel entrypoint), so a
    bad config must crash startup rather than serve requests."""
    result = _import_app_main({"VERCEL": "1", "JWT_SECRET": None}, tmp_path)
    assert result.returncode != 0
    assert "JWT_SECRET" in result.stderr
    assert DEV_JWT_SECRET not in result.stderr


def test_app_import_succeeds_on_vercel_with_strong_secret(tmp_path):
    result = _import_app_main(
        {"VERCEL": "1", "JWT_SECRET": secrets.token_urlsafe(48)}, tmp_path
    )
    assert result.returncode == 0, result.stderr
