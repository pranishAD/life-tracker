"""FastAPI app factory for Life Tracker.

`app` (module-level, below) is what `uvicorn app.main:app` and the test
suite's TestClient both use. Kept as a factory function (`create_app`) so
tests can build fresh app instances with dependency overrides without
import-order headaches.
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.errors import register_exception_handlers
from app.routers.auth import router as auth_router
from app.routers.check_ins import router as check_ins_router
from app.routers.dashboard import router as dashboard_router
from app.routers.goals import router as goals_router
from app.routers.internal import router as internal_router
from app.routers.journal import router as journal_router
from app.routers.milestones import router as milestones_router
from app.routers.reviews import router as reviews_router
from app.routers.scoring import router as scoring_router
from app.routers.settings import router as settings_router

API_PREFIX = "/api/v1"

JOURNAL_EXPORT_HEADERS = [
    "Content-Disposition",
    "X-Journal-Entry-Count",
    "X-Journal-Word-Count",
    "X-Journal-Goal-Count",
]


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title="Life Tracker API")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins_list,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        # Let the browser read the Markdown export's filename + summary
        # headers cross-origin (GET /journal/export, api-contract.yaml).
        expose_headers=JOURNAL_EXPORT_HEADERS,
    )

    register_exception_handlers(app)

    @app.get(f"{API_PREFIX}/health")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    app.include_router(auth_router, prefix=API_PREFIX)
    app.include_router(goals_router, prefix=API_PREFIX)
    app.include_router(milestones_router, prefix=API_PREFIX)
    app.include_router(check_ins_router, prefix=API_PREFIX)
    app.include_router(scoring_router, prefix=API_PREFIX)
    app.include_router(dashboard_router, prefix=API_PREFIX)
    app.include_router(reviews_router, prefix=API_PREFIX)
    app.include_router(settings_router, prefix=API_PREFIX)
    app.include_router(journal_router, prefix=API_PREFIX)
    app.include_router(internal_router, prefix=API_PREFIX)

    return app


app = create_app()
