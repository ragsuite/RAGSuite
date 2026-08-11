"""
Application settings
"""
import json
from pathlib import Path
from typing import List, Literal, Optional

from dotenv import load_dotenv
from pydantic import computed_field
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.platform.version import PLATFORM_VERSION

# RAG/Chroma read os.environ; pydantic does not export unknown .env keys into the process env.
# platform/ → app/ → backend/
_backend_root = Path(__file__).resolve().parent.parent.parent
# Make backend/.env the single source of truth for local app startup.
# This avoids accidental drift when stale shell-level DATABASE_URL is set.
load_dotenv(_backend_root / ".env", override=True)


def _parse_cors_origins(raw: str) -> List[str]:
    """Parse CORS_ORIGINS: *, comma-separated hosts, or JSON array string."""
    if raw is None:
        return ["*"]
    s = str(raw).strip()
    if not s or s == "*":
        return ["*"]
    if s.startswith("["):
        try:
            parsed = json.loads(s)
            if isinstance(parsed, list):
                return [str(x).strip() for x in parsed if str(x).strip()]
        except json.JSONDecodeError:
            pass
    return [x.strip() for x in s.split(",") if x.strip()]
class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # App settings
    app_name: str = "RAGSuite"
    app_version: str = PLATFORM_VERSION
    debug: bool = False
    # Log every SQL statement (very noisy). Independent of debug — debug controls /docs etc.
    sql_echo: bool = False
    enable_scheduler: bool = True
    enable_rag_warmup: bool = True

    # Database — must be set via DATABASE_URL env var; no default to prevent accidental exposure
    database_url: str

    # JWT — secret must be set via JWT_SECRET_KEY env var; no default to prevent forgeable tokens
    jwt_secret_key: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60
    jwt_inactivity_timeout_minutes: int = 1440
    oauth_state_secret: str = ""
    oauth_state_ttl_seconds: int = 600

    # Stored as string so .env can use: CORS_ORIGINS=*  or  https://a.com,https://b.com
    cors_origins: str = "*"
    # Optional extra regex applied to the CORSMiddleware allow_origin_regex.
    # Useful for dev tunnels or Coder proxy URLs that change per-session.
    # Example: CORS_ORIGIN_REGEX=^https://[^.]+\.keeen\.work$
    cors_origin_regex: str = ""

    # Public API URL for browser clients (admin SPA). Include /api/v1 if required.
    public_api_base_url: str = ""
    # Frontend origin used for OAuth callback redirects.
    frontend_base_url: str = "http://localhost:9091"
    # Temporary password validity for admin-provisioned org invites.
    org_invite_temp_password_ttl_minutes: int = 30
    password_reset_ttl_minutes: int = 60

    # Crawler settings
    max_concurrent_requests: int = 32
    download_delay: float = 0.5
    user_agent: str = "RAGSuite-Crawler/1.0"
    # Max characters stored per crawled page/PDF (global default for all projects/sources).
    crawl_content_length_limit: int = 10_000_000
    external_crawler_url: str = ""
    # Verify HTTPS certificates when crawling. Set false only for local debugging (insecure).
    crawl_ssl_verify: bool = True

    # Headless (Playwright) crawl — used when crawl source headless mode is ON or AUTO
    crawl_headless_max_parallel: int = 2
    crawl_headless_navigation_timeout_ms: int = 45000
    crawl_headless_auto_min_text_chars: int = 120
    crawl_headless_auto_settle_ms: int = 500

    # Google OAuth / Gmail
    google_client_id: str = ""
    google_client_secret: str = ""
    google_redirect_uri: str = "http://localhost:9090/api/v1/gmail/auth/callback"
    gmail_credentials_encryption_key: str = ""

    # ClickUp OAuth
    clickup_client_id: str = ""
    clickup_client_secret: str = ""
    clickup_redirect_uri: str = "http://localhost:9090/api/v1/clickup/auth/callback"
    # Force embedding source globally for resolver calls: "search" or "chat".
    embedding_preferred_source: Literal["search", "chat"] = "search"
    # Compare Models: search profiles, chatbot only, both (search+chat), or auto (search then chat).
    compare_model_config_source: Literal["search", "chat", "auto", "both"] = "search"
    # Embedding default used when per-project/per-user value is missing.
    default_embedding_model: str = "jina/jina-embeddings-v2-base-de"

    # Manual document upload: wall-clock limit for extract + chunk + embed + Chroma write.
    # Large PDFs or slow remote embedding APIs may need longer; override via DOCUMENT_INGEST_TIMEOUT_SECONDS in .env.
    document_ingest_timeout_seconds: int = 7200  # 2 hours
    # Queue document indexing like crawls (requires enable_durable_jobs). Inline when false.
    enable_async_document_ingest: bool = True
    document_staging_dir: str = "data/staging"

    # Ingest isolation: keep heavy embed/Chroma work off the API event loop.
    enable_async_ingest: bool = True
    ingest_pool_workers: int = 6
    # Crawl post-ingest batching (0 = single batch). 100 keeps embed+write lock holds short.
    crawl_ingest_batch_size: int = 100
    # Chroma collection.add() batch size (0 = auto: smaller in CHROMA_MODE=http).
    chroma_ingest_batch_size: int = 0
    # Pause between crawl ingest embed HTTP batches (ms). Helps hosted API rate limits.
    ingest_batch_pause_ms: int = 1000
    # Extra pause after each Mistral embed HTTP batch (ms). Prefer rate-limit retries over long proactive sleep.
    mistral_ingest_batch_pause_ms: int = 500
    # Mistral embed batch caps (free tier is strict on RPM + tokens/request).
    mistral_embed_max_batch_items: int = 8
    mistral_embed_max_batch_tokens: int = 8000
    # Max concurrent hosted embed HTTP calls across worker threads (1 = serialize).
    embed_hosted_api_max_concurrency: int = 2
    # Inline retries per embedding HTTP call when provider returns 429/503.
    embed_rate_limit_max_retries: int = 10
    embed_rate_limit_base_delay_ms: int = 3000
    embed_rate_limit_retry_cap_seconds: int = 300
    # Background indexing job deferrals on rate limit (0 = unlimited pause/resume).
    crawl_ingest_rate_limit_max_attempts: int = 0
    embed_rate_limit_job_retry_cap_seconds: int = 600

    # Dedicated pool for chat/search RAG queries (keeps default executor free for crawls).
    query_pool_workers: int = 12

    # Durable background jobs (Postgres queue + in-process or separate worker).
    enable_durable_jobs: bool = True
    # When false, API process does not start background job workers.
    # Workers run as a separate process (python -m app.worker).
    run_inline_worker: bool = True
    # Use Redis atomic counters for job caps (requires Redis). Falls back to DB when false/unavailable.
    enable_redis_admission: bool = False
    job_worker_poll_seconds: float = 1.0
    job_worker_max_per_tick: int = 5
    job_worker_threads: int = 4
    # Minutes before a non-crawl job stuck in RUNNING is reset to PENDING on startup.
    job_worker_stale_minutes: int = 30

    # Chat session store (Redis-backed; falls back to in-process dict when Redis is unavailable).
    chat_session_ttl_seconds: int = 7200  # sliding TTL; env: CHAT_SESSION_TTL_SECONDS

    # Redis connection — optional override URL (redis://[:pass@]host:port/db or rediss:// for TLS).
    # Takes priority over REDIS_HOST + REDIS_PORT.
    redis_url: Optional[str] = None
    # Host Redis for this project publishes on 6382; Docker compose sets REDIS_HOST=redis and REDIS_PORT=6379.
    redis_host: str = ""
    redis_port: int = 6382

    # Chroma — host defaults match backend/.env.example; Docker compose overrides to chromadb:8000.
    chroma_mode: str = "local"
    chroma_host: str = "127.0.0.1"
    chroma_port: int = 8004
    chroma_ssl: bool = False

    # Ollama embeddings / local LLM base URL
    ollama_base_url: str = "http://localhost:11434"

    # Per-user caps — set to 0 (unlimited); limits are enforced per-project instead.
    max_concurrent_crawls_per_user: int = 0
    max_concurrent_reindexes_per_user: int = 0

    # Per-project caps for heavy operations (0 = unlimited).
    max_concurrent_crawls_per_project: int = 2
    max_concurrent_reindexes_per_project: int = 2

    # Crawl worker isolation: max concurrent CRAWL jobs across all worker threads.
    # Prevents crawls from monopolising the entire thread pool.
    # Remaining threads (job_worker_threads - job_worker_crawl_threads) handle ingest/purge/webhook.
    job_worker_crawl_threads: int = 2

    # Per-project ingest caps (DB-enforced; 0 = unlimited).
    max_concurrent_ingest_per_project: int = 2   # RUNNING indexing jobs per project
    max_queued_ingest_per_project: int = 50       # PENDING + RUNNING indexing jobs per project

    # Local Chroma storage (HTTP sidecar path). Empty = backend/rag_db_local.
    chroma_persist_path: str = ""
    enable_chroma_startup_repair: bool = True
    # When true, default Jina/Ollama embedding uses per-project collections (new ingests only).
    per_project_default_collection: bool = False

    # WAITING crawl sweeper: how often to promote WAITING → PENDING (seconds).
    waiting_crawl_promote_interval_sec: int = 60
    # Log a WARNING (no 429) when a user has this many WAITING crawls queued.
    waiting_crawl_alert_threshold: int = 10

    # Background job retention: archive COMPLETED/FAILED rows older than N days.
    background_job_retention_days: int = 30

    # Sprint 2: per-collection Chroma lock (only effective when CHROMA_MODE=http).
    enable_chroma_per_collection_lock: bool = True
    # Batch size for REINDEX background jobs.
    reindex_batch_size: int = 100
    # Docs per CRAWL_INGEST_BATCH job (0 = all at once, same as legacy).
    crawl_ingest_batch_size_jobs: int = 25
    # Base delay (seconds) for exponential retry backoff. Formula: min(2^(attempts-1)*base, 3600).
    job_retry_base_delay_seconds: int = 30

    # Mark crawl jobs stuck in PENDING/RUNNING/INDEXING longer than this as FAILED.
    # Effective timeout is max(base, pages_fetched * crawl_job_stale_minutes_per_page).
    crawl_job_stale_minutes: int = 360
    # Extra stale budget for large crawls (minutes per page fetched). 4116 pages ≈ +412 min.
    crawl_job_stale_minutes_per_page: float = 0.1

    # Transactional email (verification, etc.) — Gmail SMTP or any SMTP server
    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    email_from: str = ""
    # Security policy: these are intentionally fixed in code, not env-overridable.
    disable_email_verification: bool = False
    # Invite-only policy: public registration remains disabled.
    allow_public_registration: bool = False

    # SSO (Google OIDC for organization login)
    sso_enabled: bool = False
    sso_callback_base_url: str = ""
    sso_require_redis: bool = False
    email_verification_ttl_minutes: int = 1440
    email_verification_otp_length: int = 6
    email_verification_otp_ttl_minutes: int = 15
    email_verification_otp_max_attempts: int = 5
    email_verification_resend_cooldown_seconds: int = 60
    email_verification_resend_max_per_day: int = 5

    # Internal API key used by custom-LLM integration. MUST be set via CUSTOM_LLM_INTERNAL_API_KEY env var.
    # No default — server refuses to start without it (see lifespan guard in main.py).
    custom_llm_internal_api_key: str = ""

    def model_post_init(self, __context) -> None:  # type: ignore[override]
        # Force non-public, verified-email auth model even if someone sets env vars.
        self.disable_email_verification = False
        self.allow_public_registration = False

    @computed_field
    def cors_origins_list(self) -> List[str]:
        return _parse_cors_origins(self.cors_origins)

    def public_api_origin(self) -> str:
        """API origin for SSO/OAuth fallbacks (no path). Defaults to local Docker API host."""
        for raw in (self.sso_callback_base_url, self.public_api_base_url):
            candidate = (raw or "").strip()
            if not candidate:
                continue
            if candidate.endswith("/api/v1") or candidate.endswith("/api/v1/"):
                candidate = candidate.rsplit("/api/v1", 1)[0]
            if "/api/v1/auth/sso/callback" in candidate:
                candidate = candidate.split("/api/v1/auth/sso/callback", 1)[0]
            candidate = candidate.rstrip("/")
            if candidate:
                return candidate
        return "http://localhost:9090"


settings = Settings()
