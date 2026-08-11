"""Platform app factory (Phase 2).

create_app() builds the FastAPI API shell, runs lifespan, mounts legacy
feature routers, then calls the extension_loader hook (no-op until Phase 4).
"""
from __future__ import annotations

"""                                                                                                                                                                                                                                                             
FastAPI app with crawl router and CORS middleware                                                                                                                                                                                                                                                               
"""                                                                                                                                                                                                                                                             
# OpenTelemetry patch is applied in app/__init__.py before any imports                                                                                                                                                                                                                                                              
import os
from urllib.parse import unquote, urlparse
from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, Request, HTTPException, Query                                                                                                                                                                                                                                                             
from fastapi.middleware.cors import CORSMiddleware                                                                                                                                                                                                                                                              
from fastapi.exceptions import RequestValidationError                                                                                                                                                                                                                                                               
from fastapi.responses import JSONResponse, Response                                                                                                                                                                                                                                                              
from fastapi.openapi.utils import get_openapi
from sqlalchemy.exc import OperationalError                                                                                                                                                                                                                                                             
from app.platform.settings import settings
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.platform.limiter import limiter                                                                                                                                                                                                                                                              
from app.platform.db import create_tables                                                                                                                                                                                                                                                               
import json                                                                                                                                                                                                                                                              
import logging                                                                                                                                                                                                                                                              

logger = logging.getLogger(__name__)                                                                                                                                                                                                                                                                


from app.platform.extension_loader import load_extensions
from app.platform.legacy_mount import mount_legacy_feature_routers


def _warmup_pipeline():
    """Warm RAG singleton in the background so first upload is faster."""
    try:
        from app.services.rag.singleton import get_pipeline
        pipeline = get_pipeline()
        if pipeline is None:
            logger.warning("⚠️ RAG pipeline warmup finished but pipeline is unavailable")
        else:
            logger.info("✅ RAG pipeline warmup completed")
    except Exception as exc:
        logger.warning(f"⚠️ RAG pipeline warmup failed: {exc}")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Primary startup/shutdown hook. Do not rely on @app.on_event("startup") here —
    with lifespan set, those handlers may not run, which previously left the job
    worker and scheduler never started (crawls stuck in PENDING).
    """
    try:
        create_tables()
    except Exception as e:
        error_msg = str(e.orig) if hasattr(e, "orig") else str(e)
        if "Connection refused" in error_msg:
            logger.warning("Database connection refused — PostgreSQL may not be running")
        else:
            logger.warning(
                "Could not create database tables: %s",
                str(error_msg).split("\n")[0],
            )

    # Security startup guards
    _DEFAULT_JWT = "change-me-use-a-long-random-secret-in-production"
    if settings.jwt_secret_key == _DEFAULT_JWT:
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY is the default placeholder. "
            "Set a strong random secret in your .env before starting in production."
        )
    if not settings.debug and settings.cors_origins_list == ["*"]:
        raise RuntimeError(
            "FATAL: CORS_ORIGINS='*' in non-debug mode. "
            "Set an explicit origin allowlist (e.g. https://yourdomain.com) in CORS_ORIGINS before starting in production."
        )
    if not settings.custom_llm_internal_api_key:
        raise RuntimeError(
            "FATAL: CUSTOM_LLM_INTERNAL_API_KEY is not set. "
            "Generate a strong random key and set it in your .env file."
        )
    from app.services.transactional_email import smtp_configured

    if not smtp_configured():
        raise RuntimeError(
            "FATAL: SMTP is not configured. "
            "Set SMTP_HOST, SMTP_USER, SMTP_PASSWORD, and EMAIL_FROM in your .env "
            "(see .env.example)."
        )
    if not settings.debug and not settings.gmail_credentials_encryption_key:
        logger.warning(
            "SECURITY: GMAIL_CREDENTIALS_ENCRYPTION_KEY is not set. "
            "Gmail OAuth tokens will be stored unencrypted in the database. "
            "Set GMAIL_CREDENTIALS_ENCRYPTION_KEY in your .env to protect user tokens."
        )

    try:
        from app.routes.analytics import init_app_start_time

        init_app_start_time()
    except Exception:
        pass

    # Initialize shared Redis client (non-blocking; logs warning if unavailable).
    try:
        from app.services.redis_client import get_redis
        _redis = get_redis()
    except Exception as _redis_exc:
        _redis = None
        logger.warning("Redis client initialization failed: %s", _redis_exc)

    # Multi-worker safety guard: Redis is required when running multiple workers.
    # Without it, rate limits, sessions, and scheduler locks all break.
    _web_concurrency = int(os.environ.get("WEB_CONCURRENCY", 1))
    if _web_concurrency > 1 and _redis is None:
        raise RuntimeError(
            f"Redis is required for multi-worker deployment (WEB_CONCURRENCY={_web_concurrency}). "
            "Set REDIS_HOST or REDIS_URL in your .env and ensure Redis is running."
        )

    # Chroma multi-worker guard: local/SQLite Chroma is NOT safe for concurrent writes
    # from multiple OS processes. Two processes writing simultaneously corrupt the DB.
    from app.services.infra_env import chroma_http_enabled

    if _web_concurrency > 1 and not chroma_http_enabled():
        raise RuntimeError(
            f"FATAL: WEB_CONCURRENCY={_web_concurrency} requires CHROMA_MODE=http. "
            "Local SQLite Chroma is not safe for multi-process concurrent writes — "
            "data corruption will occur. Either set WEB_CONCURRENCY=1 or configure "
            "a Chroma HTTP server (CHROMA_MODE=http, CHROMA_HOST=..., CHROMA_PORT=...)."
        )

    # Initialize chat session store (Redis-backed with in-memory fallback).
    try:
        from app.services.session_store import init_session_store
        _ss = init_session_store()
        if _ss.store_type() == "memory" and not settings.debug:
            logger.warning(
                "Session store: using IN-MEMORY fallback (Redis not configured). "
                "Chat sessions will NOT persist across restarts or be shared across workers. "
                "Set REDIS_HOST or REDIS_URL to enable Redis-backed sessions."
            )
        else:
            logger.info("Session store initialized: %s mode", _ss.store_type())
    except Exception as _ss_exc:
        logger.warning("Session store initialization failed: %s — chat sessions will use in-memory fallback", _ss_exc)

    if settings.enable_scheduler:
        try:
            from app.services.scheduler import start_scheduler

            start_scheduler()
            logger.info("Scheduler started for automatic crawling and data folder monitoring")
        except ImportError as exc:
            logger.warning("Scheduler not available: %s", exc)

    try:
        from app.services.job_queue import (
            cleanup_stale_crawl_jobs,
            reset_all_stale_running_jobs,
            reset_running_crawl_jobs,
            reset_stale_crawl_ingest_batch_jobs,
            reset_stale_ingest_jobs,
            reset_stale_reindex_jobs,
            start_job_worker,
            wait_for_job_worker,
        )

        reset_stale_reindex_jobs()
        reset_running_crawl_jobs()
        cleanup_stale_crawl_jobs()
        reset_stale_crawl_ingest_batch_jobs()
        reset_stale_ingest_jobs()
        reset_all_stale_running_jobs()
        if settings.run_inline_worker:
            start_job_worker()
            wait_for_job_worker(timeout_sec=15.0)
        else:
            logger.info("run_inline_worker=false — job workers run as separate process")
            from app.services.job_queue import _worker_started

            _worker_started.set()
    except Exception as job_exc:
        logger.warning("Background job worker not started: %s", job_exc)

    try:
        from app.services.chroma_repair import check_chroma_health, repair_chroma_index

        if settings.enable_chroma_startup_repair:
            repair_result = repair_chroma_index()
            removed = int(repair_result.get("orphans_removed", 0) or 0)
            if removed:
                logger.warning(
                    "Chroma startup repair removed %d orphaned chunk(s): %s",
                    removed,
                    repair_result.get("message"),
                )
            else:
                logger.info("Chroma startup repair: %s", repair_result.get("message", "ok"))
        health = check_chroma_health()
        if not health.get("healthy", True) and health.get("collections"):
            logger.warning(
                "Chroma health check: %s (path=%s)",
                health.get("message"),
                health.get("local_path"),
            )
    except Exception as repair_exc:
        logger.warning("ChromaDB consistency check skipped: %s", repair_exc)

    loop = asyncio.get_running_loop()
    if settings.enable_rag_warmup:
        loop.run_in_executor(None, _warmup_pipeline)
    else:
        logger.info("RAG warmup skipped (ENABLE_RAG_WARMUP=false)")

    yield

    if settings.enable_scheduler:
        try:
            from app.services.scheduler import stop_scheduler

            stop_scheduler()
            logger.info("Scheduler stopped")
        except ImportError:
            pass

    try:
        from app.services.rag.singleton import request_shutdown, wait_for_ingest_drain

        request_shutdown()
        clean = wait_for_ingest_drain(timeout=30.0)
        if clean:
            logger.info("Graceful shutdown: ingest drained cleanly")
        else:
            logger.warning("Graceful shutdown: ingest drain timed out after 30s — ChromaDB may need repair on next start")
    except Exception:
        pass




def create_app() -> FastAPI:
    """Build and return the Platform FastAPI application."""
    # Create FastAPI app — hide interactive docs in production to reduce attack surface
    app = FastAPI(
        title=settings.app_name,
        version=settings.app_version,
        description="RAGSuite API with Crawler and RAG endpoints",
        lifespan=lifespan,
        docs_url="/docs" if settings.debug else None,
        redoc_url="/redoc" if settings.debug else None,
        openapi_url="/openapi.json" if settings.debug else None,
    )

    # Rate limiting
    app.state.limiter = limiter
    app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


    def custom_openapi():
        """Patch OpenAPI file schemas so Swagger UI renders file pickers."""
        if app.openapi_schema:
            return app.openapi_schema

        openapi_schema = get_openapi(
            title=app.title,
            version=app.version,
            description=app.description,
            routes=app.routes,
        )

        components = openapi_schema.get("components", {}).get("schemas", {})
        for schema in components.values():
            properties = schema.get("properties", {})
            for field_schema in properties.values():
                items = field_schema.get("items")
                if isinstance(items, dict) and items.get("contentMediaType") == "application/octet-stream":
                    # Swagger UI reliably renders `format: binary` as a file picker.
                    items.pop("contentMediaType", None)
                    items["format"] = "binary"

        # Swagger UI auto-fills UUID examples for multipart fields. For project_id on
        # document upload, force an empty docs value so users don't submit a fake UUID.
        upload_body_schema = components.get("Body_upload_document_api_v1_documents_upload_post", {})
        upload_props = upload_body_schema.get("properties", {})
        project_id_schema = upload_props.get("project_id")
        if isinstance(project_id_schema, dict):
            any_of = project_id_schema.get("anyOf")
            if isinstance(any_of, list):
                for option in any_of:
                    if isinstance(option, dict):
                        option.pop("format", None)
            project_id_schema["example"] = ""
            project_id_schema["default"] = ""

        app.openapi_schema = openapi_schema
        return app.openapi_schema


    app.openapi = custom_openapi

    # CORS applied first so browser preflight and credentialed API calls get headers on every route.
    def _default_cors_origins() -> list[str]:
        """Build local/dev CORS defaults from FRONTEND_BASE_URL + PUBLIC_API_BASE_URL."""
        from app.services.infra_env import origin_from_url

        origins: list[str] = []
        seen: set[str] = set()

        def _add(raw: str | None) -> None:
            origin = origin_from_url(raw or "")
            if not origin or origin in seen:
                return
            seen.add(origin)
            origins.append(origin)
            # Also allow the 127.0.0.1 twin of localhost (and vice versa).
            if "://localhost" in origin:
                twin = origin.replace("://localhost", "://127.0.0.1", 1)
                if twin not in seen:
                    seen.add(twin)
                    origins.append(twin)
            elif "://127.0.0.1" in origin:
                twin = origin.replace("://127.0.0.1", "://localhost", 1)
                if twin not in seen:
                    seen.add(twin)
                    origins.append(twin)

        _add(settings.frontend_base_url)
        _add(settings.public_api_origin())
        # Common local frontend ports when FRONTEND_BASE_URL is unset/minimal.
        for fallback in (
            "http://localhost:9091",
            "http://localhost:3000",
            "http://localhost:5174",
            "http://localhost",
        ):
            _add(fallback)
        return origins


    default_cors_origins = _default_cors_origins()


    def _build_optional_port_origin_regex(origins: list[str]) -> str | None:
        """
        Build a regex that allows configured hosts on any port.
        This avoids fragile CORS failures when local/dev embeds run on dynamic ports.
        """
        host_patterns: list[str] = []
        for origin in origins:
            if not origin or origin == "*":
                continue
            try:
                parsed = urlparse(origin)
            except Exception:
                continue
            scheme = parsed.scheme
            hostname = parsed.hostname
            if not scheme or not hostname:
                continue
            escaped_host = hostname.replace(".", r"\.")
            host_patterns.append(rf"^{scheme}://{escaped_host}(?::\d+)?$")
        if not host_patterns:
            return None
        return "|".join(sorted(set(host_patterns)))

    _co = settings.cors_origins_list
    if settings.debug or _co == ["*"]:
        cors_origins = ["*"]
        _cors_origin_regex = None
        logger.info("🌐 CORS: Allowing all origins (debug mode or wildcard configured)")
    else:
        cors_origins = _co if _co else default_cors_origins
        # Allow configured hosts with optional ports (e.g. LAN embeds, Vite/dev dynamic ports).
        _auto_regex = _build_optional_port_origin_regex(cors_origins)
        _extra_regex = settings.cors_origin_regex.strip() if settings.cors_origin_regex else ""
        if _auto_regex and _extra_regex:
            _cors_origin_regex = f"{_auto_regex}|{_extra_regex}"
        else:
            _cors_origin_regex = _auto_regex or _extra_regex or None
        logger.info(
            "🌐 CORS: Explicit allow-list with optional-port regex. origins=%s regex=%s",
            cors_origins, _cors_origin_regex,
        )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=_cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
        max_age=86400,
        allow_private_network=True,
    )

    from starlette.middleware.base import BaseHTTPMiddleware


    class SecurityHeadersMiddleware(BaseHTTPMiddleware):
        """Add defensive security headers to every response."""

        async def dispatch(self, request, call_next):
            response = await call_next(request)
            response.headers.setdefault("X-Content-Type-Options", "nosniff")
            # Skip X-Frame-Options / restrictive CSP for content-stream so PDFs can render
            # in the admin iframe (frontend origin differs from API origin).
            # MutableHeaders has no .pop(); assign CSP and do not set X-Frame-Options.
            if request.url.path.endswith("/content-stream"):
                response.headers["Content-Security-Policy"] = "frame-ancestors *"
            else:
                response.headers.setdefault("X-Frame-Options", "DENY")
                # Swagger/ReDoc load JS/CSS from CDNs — skip CSP on debug-only doc pages.
                if request.url.path not in ("/docs", "/redoc"):
                    # Permissive CSP — tighten after collecting violation reports
                    response.headers.setdefault(
                        "Content-Security-Policy",
                        (
                            "default-src 'self'; "
                            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
                            "style-src 'self' 'unsafe-inline'; "
                            "img-src 'self' data: blob:; "
                            "connect-src *"
                        ),
                    )
            response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
            if request.url.scheme == "https":
                response.headers.setdefault(
                    "Strict-Transport-Security",
                    "max-age=31536000; includeSubDomains",
                )
            return response


    app.add_middleware(SecurityHeadersMiddleware)


    def _resolve_rag_config_api_base(
        request: Request,
        *,
        relative: bool,
        api: str | None,
    ) -> str:
        """API base URL that axios uses (includes /api/v1)."""
        if api:
            cand = unquote(api).strip()
            if cand.startswith("/"):
                if "\n" in cand or "\r" in cand or ".." in cand:
                    cand = ""
                else:
                    return cand.rstrip("/") or "/api/v1"
            if cand.startswith("https://") or cand.startswith("http://"):
                return cand.rstrip("/")
        if relative:
            return "/api/v1"
        base = (settings.public_api_base_url or "").strip().rstrip("/")
        if base:
            return base
        return str(request.base_url).rstrip("/") + "/api/v1"


    @app.get("/rag-config.js")
    async def rag_config_js(
        request: Request,
        relative: bool = Query(
            False,
            description="If true, set API base to /api/v1 (same host as the admin page; use with reverse proxy).",
        ),
        api: str | None = Query(
            None,
            description="Override base URL (URL-encoded). Must start with http://, https://, or /",
        ),
    ) -> Response:
        """Sets window.RAGSUITE_API_URL for static admin builds; load before the app bundle."""
        base = _resolve_rag_config_api_base(request, relative=relative, api=api)
        payload = "window.RAGSUITE_API_URL=" + json.dumps(base) + ";"
        return Response(
            content=payload,
            media_type="application/javascript; charset=utf-8",
            headers={
                "Cache-Control": "public, max-age=300",
                "Access-Control-Allow-Origin": "*",
            },
        )

    # Add custom validation error handler for better debugging and user-friendly messages                                                                                                                                                                                                                                                               
    @app.exception_handler(RequestValidationError)                                                                                                                                                                                                                                                              
    async def validation_exception_handler(request: Request, exc: RequestValidationError):                                                                                                                                                                                                                                                              
        """Log validation errors with request body for debugging and return user-friendly messages"""                                                                                                                                                                                                                                                               
        try:
            body = await request.body()
            body_str = body.decode('utf-8') if body else 'Empty'
        except:
            body_str = 'Could not read body'

        # Security: never log raw body on auth paths; scrub sensitive fields elsewhere
        _AUTH_PATHS = ("/api/v1/auth/", "/api/v1/crawl/auth/", "/api/v1/users/login")
        if any(request.url.path.startswith(p) for p in _AUTH_PATHS):
            body_str = "[REDACTED — auth endpoint]"
        else:
            try:
                import json as _json
                _parsed = _json.loads(body_str)
                for _k in ("password", "token", "api_key", "secret", "access_token", "code", "refresh_token"):
                    if _k in _parsed:
                        _parsed[_k] = "[REDACTED]"
                body_str = _json.dumps(_parsed)
            except Exception:
                pass  # Non-JSON body — log as-is; acceptable

        logger.error(f"Validation error on {request.url.path}")
        logger.error(f"Validation errors: {exc.errors()}")
        logger.error(f"Request body: {body_str}")                                                                                                                                                                                                                                                               

        # Extract user-friendly error messages                                                                                                                                                                                                                                                              
        errors = exc.errors()                                                                                                                                                                                                                                                               
        user_friendly_errors = []                                                                                                                                                                                                                                                               

        for error in errors:                                                                                                                                                                                                                                                                
            error_type = error.get('type', '')                                                                                                                                                                                                                                                              
            field = error.get('loc', [])[-1] if error.get('loc') else 'field'                                                                                                                                                                                                                                                               
            error_msg = error.get('msg', 'Validation error')                                                                                                                                                                                                                                                                
            ctx = error.get('ctx', {})                                                                                                                                                                                                                                                              

            # Create user-friendly messages based on error type                                                                                                                                                                                                                                                             
            if error_type == 'string_too_long':                                                                                                                                                                                                                                                             
                max_length = ctx.get('max_length', '')                                                                                                                                                                                                                                                              
                if field == 'name':                                                                                                                                                                                                                                                             
                    user_friendly_errors.append(f"Project name is too long. Maximum length is {max_length} characters.")                                                                                                                                                                                                                                                                
                elif field == 'description':                                                                                                                                                                                                                                                                
                    user_friendly_errors.append(f"Project description is too long. Maximum length is {max_length} character                                                                                                                                                                                                                                                             s.")
                else:                                                                                                                                                                                                                                                               
                    user_friendly_errors.append(f"{field} is too long. Maximum length is {max_length} characters.")                                                                                                                                                                                                                                                             
            elif error_type == 'string_too_short':                                                                                                                                                                                                                                                              
                min_length = ctx.get('min_length', '')                                                                                                                                                                                                                                                              
                user_friendly_errors.append(f"{field} is too short. Minimum length is {min_length} characters.")                                                                                                                                                                                                                                                                
            elif error_type == 'value_error':                                                                                                                                                                                                                                                               
                user_friendly_errors.append(f"Invalid value for {field}: {error_msg}")                                                                                                                                                                                                                                                              
            elif error_type == 'type_error':                                                                                                                                                                                                                                                                
                user_friendly_errors.append(f"Invalid type for {field}: {error_msg}")                                                                                                                                                                                                                                                               
            else:                                                                                                                                                                                                                                                               
                user_friendly_errors.append(f"{field}: {error_msg}")                                                                                                                                                                                                                                                                


        error_message = "; ".join(user_friendly_errors) if user_friendly_errors else "Validation error occurred"                                                                                                                                                                                                                                                                

        return JSONResponse(                                                                                                                                                                                                                                                                
            status_code=422,                                                                                                                                                                                                                                                                
            content={                                                                                                                                                                                                                                                               
                "detail": error_message,                                                                                                                                                                                                                                                                
                "errors": errors                                                                                                                                                                                                                                                                
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    # Add database connection error handler                                                                                                                                                                                                                                                             
    @app.exception_handler(OperationalError)                                                                                                                                                                                                                                                                
    async def database_exception_handler(request: Request, exc: OperationalError):                                                                                                                                                                                                                                                              
        """Handle database connection errors gracefully"""                                                                                                                                                                                                                                                              
        logger.error(f"Database connection error on {request.url.path}: {exc}")                                                                                                                                                                                                                                                             

        error_str = str(exc.orig) if hasattr(exc, 'orig') else str(exc)                                                                                                                                                                                                                                                             
        if "Connection refused" in error_str or "could not connect" in error_str.lower():                                                                                                                                                                                                                                                               
            return JSONResponse(                                                                                                                                                                                                                                                                
                status_code=503,                                                                                                                                                                                                                                                                
                content={                                                                                                                                                                                                                                                               
                    "detail": "Database service is currently unavailable. Please ensure PostgreSQL is running and try again                                                                                                                                                                                                                                                             .",
                    "error": "Database connection refused"                                                                                                                                                                                                                                                              
                }                                                                                                                                                                                                                                                               
            )                                                                                                                                                                                                                                                               

        # Generic database error                                                                                                                                                                                                                                                                
        return JSONResponse(                                                                                                                                                                                                                                                                
            status_code=503,                                                                                                                                                                                                                                                                
            content={                                                                                                                                                                                                                                                               
                "detail": "Database service error. Please try again later.",                                                                                                                                                                                                                                                                
                "error": "Database operational error"                                                                                                                                                                                                                                                               
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    @app.exception_handler(Exception)                                                                                                                                                                                                                                                               
    async def global_exception_handler(request: Request, exc: Exception):                                                                                                                                                                                                                                                               
        """Handle all unhandled exceptions gracefully to prevent 500 errors from causing frontend issues"""                                                                                                                                                                                                                                                             
        if isinstance(exc, HTTPException):                                                                                                                                                                                                                                                              
            raise exc                                                                                                                                                                                                                                                               

        import traceback                                                                                                                                                                                                                                                                

        # Log the full exception with traceback                                                                                                                                                                                                                                                             
        logger.error(f"Unhandled exception on {request.url.path}: {exc}")                                                                                                                                                                                                                                                               
        logger.error(f"Traceback: {traceback.format_exc()}")                                                                                                                                                                                                                                                                

        # Don't expose internal errors to frontend in production                                                                                                                                                                                                                                                                
        error_detail = str(exc) if settings.debug else "An internal server error occurred. Please try again later."                                                                                                                                                                                                                                                             

        return JSONResponse(                                                                                                                                                                                                                                                                
            status_code=500,                                                                                                                                                                                                                                                                
            content={                                                                                                                                                                                                                                                               
                "detail": error_detail,                                                                                                                                                                                                                                                             
                "error": "Internal server error",                                                                                                                                                                                                                                                               
                "path": str(request.url.path)                                                                                                                                                                                                                                                               
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               


    # NOTE: All startup/shutdown logic lives in the `lifespan` context manager above.
    # Legacy @app.on_event blocks removed — FastAPI 0.93+ runs both lifespan AND on_event,
    # causing double-start of scheduler and job worker threads.


    load_extensions(app)
    mount_legacy_feature_routers(app)
    return app
