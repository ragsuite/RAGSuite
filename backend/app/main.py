"""
FastAPI entrypoint — Platform create_app (Phase 2).

Uvicorn / gunicorn continue to load ``app.main:app``.
"""
from app.platform.app_factory import create_app

app = create_app()
