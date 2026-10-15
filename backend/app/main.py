# Placeholder FastAPI app created by devops for Phase 0/2 so that
# `docker compose up` is verifiable end-to-end before backend-dev builds
# the real app.
#
# backend-dev: this file is yours from here — add routers (auth, goals,
# check-ins, dashboard, reviews, settings), settings/config loading from
# env vars (DATABASE_URL, JWT_SECRET, JWT_EXPIRES_MINUTES, CORS_ORIGINS),
# and wire up SQLAlchemy / Alembic. Please keep `GET /api/v1/health`
# working — devops and CI use it as the smoke test.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Life Tracker API")

# TODO(backend-dev): read allowed origins from the CORS_ORIGINS env var
# instead of allowing all origins.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
