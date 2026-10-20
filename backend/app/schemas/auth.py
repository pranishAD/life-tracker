"""Pydantic v2 request/response schemas for the `auth` tag of
docs/api-contract.yaml (RegisterRequest, LoginRequest, AuthResponse, User).
"""

from __future__ import annotations

import uuid
from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.schemas.common import NAME_MAX_LENGTH

PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 128
# bcrypt only uses the first 72 bytes of a password, so two long passwords
# sharing their first 72 bytes would be treated as equal (SEC-012).
PASSWORD_MAX_BYTES = 72


class UserOut(BaseModel):
    """Matches api-contract.yaml `User` schema. Never include password_hash."""

    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    created_at: datetime


class RegisterRequest(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)
    email: EmailStr
    password: str = Field(min_length=PASSWORD_MIN_LENGTH, max_length=PASSWORD_MAX_LENGTH)

    @field_validator("password")
    @classmethod
    def _password_fits_bcrypt(cls, value: str) -> str:
        if len(value.encode("utf-8")) > PASSWORD_MAX_BYTES:
            raise ValueError(
                f"password is too long: at most {PASSWORD_MAX_BYTES} bytes "
                "(fewer characters if you use emoji or non-Latin letters)"
            )
        return value


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(max_length=PASSWORD_MAX_LENGTH)


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserOut


class UpdateProfileRequest(BaseModel):
    name: str = Field(min_length=1, max_length=NAME_MAX_LENGTH)
