"""POST /auth/register, POST /auth/login, GET /auth/me, PATCH /auth/me
(docs/api-contract.yaml `auth` tag, US-01/US-02/US-03/US-19).
"""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.security import create_access_token, hash_password, verify_password_or_dummy
from app.deps import get_current_user
from app.errors import conflict, unauthorized
from app.models import User
from app.schemas.auth import (
    AuthResponse,
    LoginRequest,
    RegisterRequest,
    UpdateProfileRequest,
    UserOut,
)
from app.services.categories import seed_default_categories
from db.session import get_session

router = APIRouter(prefix="/auth", tags=["auth"])


def _get_user_by_email(db: Session, email: str) -> User | None:
    # Case-insensitive lookup to match the DB's functional unique index on
    # lower(email) -- see app/models/user.py.
    return db.scalar(select(User).where(func.lower(User.email) == email.lower()))


@router.post("/register", response_model=AuthResponse, status_code=201)
def register(payload: RegisterRequest, db: Session = Depends(get_session)) -> AuthResponse:
    if _get_user_by_email(db, payload.email) is not None:
        raise conflict("EMAIL_ALREADY_REGISTERED", "An account with this email already exists.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=hash_password(payload.password),
    )
    db.add(user)
    db.flush()  # assigns user.id
    # The 4 default categories, committed in the same transaction as the user.
    seed_default_categories(db, user.id)
    db.commit()
    db.refresh(user)

    token = create_access_token(str(user.id))
    return AuthResponse(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, db: Session = Depends(get_session)) -> AuthResponse:
    user = _get_user_by_email(db, payload.email)
    # Always runs bcrypt exactly once, even for an unknown email (SEC-005).
    password_ok = verify_password_or_dummy(
        payload.password, user.password_hash if user is not None else None
    )
    if user is None or not password_ok:
        raise unauthorized("Incorrect email or password.")

    token = create_access_token(str(user.id))
    return AuthResponse(access_token=token, token_type="bearer", user=UserOut.model_validate(user))


@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)) -> UserOut:
    return UserOut.model_validate(current_user)


@router.patch("/me", response_model=UserOut)
def update_me(
    payload: UpdateProfileRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_session),
) -> UserOut:
    current_user.name = payload.name
    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return UserOut.model_validate(current_user)
