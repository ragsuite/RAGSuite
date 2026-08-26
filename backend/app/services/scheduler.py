"""
Scheduler service for automatic crawling based on cadence
"""
# Workaround for OpenTelemetry ReadableLogRecord import error
# Disable OpenTelemetry SDK proactively to prevent import errors
import os
import sys
# Set multiple environment variables to ensure OpenTelemetry is disabled
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"] = "all"
os.environ["MISTRAL_TELEMETRY_ENABLED"] = "false"

# Patch OpenTelemetry imports to prevent errors
# Create a dummy module for ReadableLogRecord if it doesn't exist
try:
    from opentelemetry.sdk._logs import ReadableLogRecord
except ImportError:
    # Create a dummy class to prevent import errors
    class ReadableLogRecord:
        pass
    # Inject into sys.modules to prevent future import attempts
    import opentelemetry.sdk._logs as otel_logs_module
    if not hasattr(otel_logs_module, 'ReadableLogRecord'):
        otel_logs_module.ReadableLogRecord = ReadableLogRecord

from fastapi import HTTPException
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta, timezone
from sqlalchemy.orm import Session
from ..models import (
    CrawlSource,
    CrawlCadence,
    CrawlSourceStatus,
    Document,
    Project,
    IntegrationEmbed,
    GmailIntegration,
    GmailIntegrationStatus,
    GmailProjectCredential,
    GmailSyncJob,
    GmailSyncJobStatus,
)
from ..security_utils import decrypt_secret, safe_decrypt_secret
from ..settings import settings
from ..db import SessionLocal
from .crawler import run_crawl, create_crawl_job
from urllib.parse import urlparse
import socket
import uuid
import threading
import logging
from pathlib import Path
from typing import Optional, Set

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None
scheduler_lock = threading.Lock()

# Consider jobs stale if they remain pending/running for too long.
GMAIL_JOB_STALE_MINUTES = 30

# Track processed files to avoid re-ingesting
_processed_files: Set[str] = set()
_processed_files_lock = threading.Lock()


def _try_acquire_scheduler_lock(
    redis_client: Optional[object],
    lock_key: str,
    ttl_seconds: int,
) -> bool:
    """
    Try to acquire a per-job-type distributed lock using Redis SET NX EX.
    Returns True if this instance should proceed (either acquired the lock or
    Redis is unavailable — fail-open so jobs always run on single-instance deploys).
    Lock key: ragsuite:sched:{lock_key}
    """
    if redis_client is None:
        return True  # No Redis configured — single-instance deployment, proceed freely.
    owner = f"{socket.gethostname()}:{os.getpid()}"
    try:
        acquired = redis_client.set(
            f"ragsuite:sched:{lock_key}",
            owner,
            nx=True,    # Only set if key does not already exist.
            ex=ttl_seconds,
        )
        return bool(acquired)
    except Exception as exc:
        # Redis error — fail open so scheduled jobs still run.
        logger.warning("Scheduler lock Redis error for %s: %s — proceeding without lock", lock_key, exc)
        return True


def _normalize_domain_from_url(url: str) -> str:
    """
    Extract and normalize domain from a URL.
    Returns the domain in lowercase without protocol, www, path, or port.
    """
    if not url:
        return ""
    try:
        parsed = urlparse(url)
        domain = parsed.netloc or parsed.path.split('/')[0]
        domain = domain.lower().strip()
        # Remove port if present
        if ':' in domain:
            domain = domain.split(':')[0]
        # Remove www prefix
        if domain.startswith('www.'):
            domain = domain[4:]
        return domain
    except Exception as e:
        logger.warning(f"⚠️ Error normalizing domain from URL {url}: {e}")
        return ""


def _auto_add_trained_domains_to_allowed_list(source: CrawlSource, db: Session):
    """
    Automatically add all unique domains from trained documents to allowed domains for both chatbot and search widgets.
    This is called when training completes successfully.
    Extracts domains from all document URLs for this source.
    """
    try:
        # Get all documents for this source
        documents = db.query(Document).filter(Document.source_id == source.id).all()
        
        if not documents:
            logger.info(f"ℹ️ No documents found for source {source.id} - skipping domain addition")
            return
        
        # Extract all unique domains from all document URLs
        unique_domains = set()
        for doc in documents:
            if doc.url:
                domain = _normalize_domain_from_url(doc.url)
                if domain:
                    unique_domains.add(domain)
        
        if not unique_domains:
            logger.info(f"ℹ️ Could not extract any domains from {len(documents)} documents")
            return
        
        logger.info(f"🌐 Extracted {len(unique_domains)} unique domains from {len(documents)} trained documents")
        
        # Get project to find owner
        project = db.query(Project).filter(Project.id == source.project_id).first()
        if not project:
            logger.warning(f"⚠️ Project {source.project_id} not found for source {source.id}")
            return
        
        owner_id = project.owner_id
        
        # Get or create IntegrationEmbed config for the project owner
        embed_config = db.query(IntegrationEmbed).filter(
            IntegrationEmbed.user_id == owner_id
        ).first()
        
        if not embed_config:
            # Create default config if it doesn't exist
            def _generate_default_public_id() -> str:
                """Generate a simple default publicId similar to docs-widget-xxxxxx."""
                suffix = uuid.uuid4().hex[:6]
                return f"docs-widget-{suffix}"
            
            embed_config = IntegrationEmbed(
                user_id=owner_id,
                public_id=_generate_default_public_id(),
                keys={
                    "keys": [],
                    "chatbot_domains": [],
                    "search_domains": [],
                },
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc),
            )
            db.add(embed_config)
            logger.info(f"✅ Created new IntegrationEmbed config for user {owner_id}")
        
        # Get current domain lists (per-project)
        from .integration_domains import (
            append_domains_for_project,
            ensure_domains_by_project_for_owner,
        )

        keys_data = ensure_domains_by_project_for_owner(
            embed_config.keys or {}, db, owner_id
        )
        keys_data, domains_added_to_chatbot, domains_added_to_search = append_domains_for_project(
            keys_data,
            source.project_id,
            unique_domains,
            to_chatbot=True,
            to_search=True,
        )

        if domains_added_to_chatbot or domains_added_to_search:
            embed_config.keys = keys_data
            embed_config.updated_at = datetime.now(timezone.utc)
            db.commit()
            logger.info(
                f"✅ Automatically added {len(domains_added_to_chatbot)} chatbot / "
                f"{len(domains_added_to_search)} search domains for project {source.project_id} "
                f"(user: {owner_id})"
            )
            if domains_added_to_chatbot:
                logger.info(
                    f"   Chatbot domains added: {', '.join(list(domains_added_to_chatbot)[:5])}"
                    f"{'...' if len(domains_added_to_chatbot) > 5 else ''}"
                )
            if domains_added_to_search:
                logger.info(
                    f"   Search domains added: {', '.join(list(domains_added_to_search)[:5])}"
                    f"{'...' if len(domains_added_to_search) > 5 else ''}"
                )
        else:
            logger.info(f"ℹ️ All {len(unique_domains)} domains already exist in allowed domains")
            
    except Exception as e:
        logger.error(f"❌ Error auto-adding domains to allowed list after training: {e}")
        import traceback
        traceback.print_exc()
        # Don't raise - this is a non-critical operation


def get_scheduler() -> BackgroundScheduler:
    """Get or create the global scheduler instance"""
    global scheduler
    with scheduler_lock:
        if scheduler is None:
            scheduler = BackgroundScheduler()
            scheduler.start()
            logger.info("✅ Scheduler started")
        return scheduler


def should_crawl(source: CrawlSource) -> bool:
    """
    Determine if a source should be crawled based on its cadence and last crawl time
    """
    # Skip if not active or disabled
    if not source.is_active or source.status != CrawlSourceStatus.READY:
        return False
    
    # ONCE cadence - only crawl if never crawled
    if source.cadence == CrawlCadence.ONCE:
        return source.last_crawl_at is None
    
    # If never crawled, should crawl
    if source.last_crawl_at is None:
        return True
    
    # Calculate time since last crawl
    time_since_last_crawl = datetime.utcnow() - source.last_crawl_at.replace(tzinfo=None)
    
    # Check based on cadence
    if source.cadence == CrawlCadence.DAILY:
        return time_since_last_crawl >= timedelta(days=1)
    elif source.cadence == CrawlCadence.WEEKLY:
        return time_since_last_crawl >= timedelta(weeks=1)
    elif source.cadence == CrawlCadence.MONTHLY:
        return time_since_last_crawl >= timedelta(days=30)
    
    return False


def check_and_crawl_sources():
    """
    Check all active sources and trigger crawls for those that need it
    This function runs periodically to check for sources that need crawling
    """
    try:
        from .redis_client import get_redis as _get_redis
        if not _try_acquire_scheduler_lock(_get_redis(), "crawl_sources", ttl_seconds=65 * 60):
            logger.debug("Scheduler: skipping check_and_crawl_sources (another instance holds lock)")
            return
    except Exception:
        pass  # Redis client not available — proceed normally

    try:
        from .job_queue import (
            cleanup_stale_crawl_jobs,
            reset_stale_crawl_ingest_batch_jobs,
            sweep_orphaned_indexing_crawl_jobs,
        )

        cleanup_stale_crawl_jobs()
        reset_stale_crawl_ingest_batch_jobs()
        sweep_orphaned_indexing_crawl_jobs()
    except Exception as exc:
        logger.warning("Stale crawl job cleanup failed: %s", exc)

    db: Session = SessionLocal()
    try:
        # Check if project_id column exists in crawl_sources table
        # This handles cases where migrations haven't been run yet
        from sqlalchemy import inspect as sa_inspect
        has_project_id = False
        try:
            inspector = sa_inspect(db.bind)
            columns = [col['name'] for col in inspector.get_columns('crawl_sources')]
            has_project_id = 'project_id' in columns
        except Exception as inspect_err:
            # If we can't inspect, try to query and catch the error
            logger.debug(f"⚠️  Could not inspect crawl_sources table: {inspect_err}")
            has_project_id = None  # Unknown - will try query and catch error
        
        if has_project_id is False:
            logger.warning("⚠️  project_id column not found in crawl_sources table. Please run database migrations: alembic upgrade head")
            return
        
        # Get all active sources
        # Wrap query in try-except to handle missing column gracefully
        try:
            sources = db.query(CrawlSource).filter(
                CrawlSource.is_active == True,
                CrawlSource.status == CrawlSourceStatus.READY
            ).all()
        except Exception as query_err:
            error_msg = str(query_err)
            # Check if this is the project_id column error
            if "project_id" in error_msg and ("does not exist" in error_msg or "UndefinedColumn" in error_msg):
                logger.warning("⚠️  project_id column not found in crawl_sources table. Please run database migrations: alembic upgrade head")
                return
            # Re-raise if it's a different error
            raise
        
        logger.info(f"🔍 Checking {len(sources)} active sources for scheduled crawling")
        
        for source in sources:
            try:
                if should_crawl(source):
                    logger.info(f"📅 Scheduling crawl for source: {source.name} (ID: {source.id})")
                    from .concurrency_limits import source_has_active_crawl
                    from .crawl_orchestration import CrawlStartTrigger, start_crawl_for_source

                    if source_has_active_crawl(db, source.id):
                        logger.info(
                            "Skipping scheduled crawl for source %s: active job exists",
                            source.id,
                        )
                        continue
                    try:
                        start_crawl_for_source(
                            db,
                            source.id,
                            user_id=source.created_by_id,
                            trigger=CrawlStartTrigger.SCHEDULED,
                            run_inline_fallback=not settings.enable_durable_jobs,
                        )
                    except HTTPException as sched_exc:
                        if sched_exc.status_code == 409:
                            logger.info(
                                "Scheduled crawl skipped for source %s: %s",
                                source.id,
                                sched_exc.detail,
                            )
                        else:
                            logger.error(
                                "Scheduled crawl start failed for source %s: %s",
                                source.id,
                                sched_exc.detail,
                            )
                    except Exception as sched_exc:
                        logger.error(
                            "Scheduled crawl start failed for source %s: %s",
                            source.id,
                            sched_exc,
                        )
                else:
                    next_crawl = get_next_crawl_time(source)
                    logger.debug(f"⏭️  Source {source.name} doesn't need crawling yet. Next crawl: {next_crawl}")
            except Exception as e:
                logger.error(f"❌ Error checking source {source.id}: {e}")
    
    except Exception as e:
        error_msg = str(e)
        if "project_id" in error_msg and ("does not exist" in error_msg or "UndefinedColumn" in error_msg):
            logger.warning("⚠️  Database schema mismatch: project_id column missing from crawl_sources table. Please run migrations: alembic upgrade head")
        else:
            logger.error(f"❌ Error in check_and_crawl_sources: {e}")
    finally:
        db.close()


def run_crawl_in_thread(source_id):
    """Run crawl in a separate thread with its own database session and event loop"""
    import asyncio
    db: Session = SessionLocal()
    loop = None
    try:
        # Create a crawl job first
        job_id = create_crawl_job(db, source_id)
        db.close()  # Close the session before async operations
        
        # Create new event loop for this thread (scheduler runs in background thread)
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        loop.run_until_complete(run_crawl(job_id, source_id))
    except Exception as e:
        logger.error(f"❌ Error running scheduled crawl for source {source_id}: {e}")
    finally:
        if db:
            db.close()
        if loop:
            loop.close()


def get_next_crawl_time(source: CrawlSource) -> str:
    """Calculate when the next crawl should happen"""
    if source.cadence == CrawlCadence.ONCE:
        return "Never (ONCE cadence)"
    
    if source.last_crawl_at is None:
        return "Immediately (never crawled)"
    
    last_crawl = source.last_crawl_at.replace(tzinfo=None)
    
    if source.cadence == CrawlCadence.DAILY:
        next_crawl = last_crawl + timedelta(days=1)
    elif source.cadence == CrawlCadence.WEEKLY:
        next_crawl = last_crawl + timedelta(weeks=1)
    elif source.cadence == CrawlCadence.MONTHLY:
        next_crawl = last_crawl + timedelta(days=30)
    else:
        return "Unknown"
    
    return next_crawl.strftime("%Y-%m-%d %H:%M:%S")


# Global RAGPipeline instance to avoid re-initializing heavy models
_rag_pipeline_instance = None
_rag_pipeline_lock = threading.Lock()

def check_and_ingest_data_folder():
    """
    Check the data folder for new files and automatically ingest them into RAG.
    This function runs periodically to monitor for new files.
    """
    try:
        from .redis_client import get_redis as _get_redis
        if not _try_acquire_scheduler_lock(_get_redis(), "ingest_data_folder", ttl_seconds=6 * 60):
            logger.debug("Scheduler: skipping check_and_ingest_data_folder (another instance holds lock)")
            return
    except Exception:
        pass

    global _rag_pipeline_instance

    # Saturation guard: yield to the job queue when ingest workers are fully loaded.
    # Running inline against the Chroma write lock while workers are active causes
    # queued DOCUMENT_INGEST jobs to stall waiting for the lock.
    try:
        _sat_db = SessionLocal()
        try:
            from ..models import BackgroundJob, BackgroundJobType, BackgroundJobStatus
            _running_ingest = (
                _sat_db.query(BackgroundJob)
                .filter(
                    BackgroundJob.job_type == BackgroundJobType.DOCUMENT_INGEST.value,
                    BackgroundJob.status == BackgroundJobStatus.RUNNING.value,
                )
                .count()
            )
            _ingest_cap = max(1, int(settings.ingest_pool_workers))
            if _running_ingest >= _ingest_cap:
                logger.info(
                    "check_and_ingest_data_folder: deferring — ingest pool at capacity "
                    "(%d/%d running). Will retry next tick.",
                    _running_ingest, _ingest_cap,
                )
                return
        finally:
            _sat_db.close()
    except Exception as _sat_exc:
        logger.debug("check_and_ingest_data_folder: saturation check failed: %s", _sat_exc)

    try:
        # Import RAGPipeline here to avoid circular imports
        # OpenTelemetry workaround is already set at module level above
        # Wrap import in try-except to handle any remaining OpenTelemetry errors gracefully
        try:
            from .rag.rag import RAGPipeline
        except ImportError as import_err:
            # If import fails due to OpenTelemetry or other issues, log and return
            if "ReadableLogRecord" in str(import_err) or "opentelemetry" in str(import_err).lower():
                logger.warning(f"⚠️ RAGPipeline import failed due to OpenTelemetry: {import_err}")
                return
            # Re-raise other import errors
            raise
        
        # Get data folder path
        project_root = Path(__file__).parent.parent.parent
        data_folder = project_root / "data"
        
        if not data_folder.exists():
            logger.debug(f"📁 Data folder does not exist: {data_folder}")
            return
        
        # Supported file extensions for ingestion
        supported_extensions = {'.csv', '.pdf', '.txt', '.md', '.docx', '.doc'}
        
        # Get all files in data folder
        all_files = []
        for file_path in data_folder.iterdir():
            if file_path.is_file() and file_path.suffix.lower() in supported_extensions:
                # Crawl exports are now indexed directly in crawler flow.
                # Skip legacy crawl_export CSV files to avoid fallback re-ingestion.
                if file_path.name.startswith("crawl_export_"):
                    continue
                all_files.append(file_path)
        
        if not all_files:
            logger.debug("📁 No supported files found in data folder")
            return
        
        # Filter out already processed files
        with _processed_files_lock:
            new_files = [f for f in all_files if str(f) not in _processed_files]
        
        if not new_files:
            logger.debug(f"📁 All {len(all_files)} files in data folder already processed")
            return
        
        logger.info(f"🔍 Found {len(new_files)} new file(s) in data folder to ingest")
        
        # Initialize RAG pipeline (Singleton pattern)
        if _rag_pipeline_instance is None:
            with _rag_pipeline_lock:
                if _rag_pipeline_instance is None:
                    try:
                        logger.info("⚙️ Initializing RAGPipeline singleton...")
                        _rag_pipeline_instance = RAGPipeline()
                        logger.info("✅ RAGPipeline initialized successfully")
                    except Exception as e:
                        logger.error(f"❌ Failed to initialize RAGPipeline: {e}")
                        return
        
        rag_pipeline = _rag_pipeline_instance
        
        # Process each new file
        for file_path in new_files:
            try:
                logger.info(f"📥 Ingesting file: {file_path.name}")

                # Try to infer user_id and project_id from crawl export filename: crawl_export_{source_id}_{timestamp}.csv
                user_id = None
                project_id = None
                try:
                    from sqlalchemy.orm import Session
                    from ..db import SessionLocal
                    from ..models import CrawlSource

                    session: Session = SessionLocal()
                    try:
                        stem = file_path.stem  # filename without extension
                        prefix = "crawl_export_"
                        if stem.startswith(prefix):
                            rest = stem[len(prefix) :]  # {source_id}_{timestamp}
                            if "_" in rest:
                                source_id_str, _ = rest.split("_", 1)
                            else:
                                source_id_str = rest
                            import uuid

                            source_uuid = uuid.UUID(source_id_str)
                            try:
                                source = (
                                    session.query(CrawlSource)
                                    .filter(CrawlSource.id == source_uuid)
                                    .first()
                                )
                            except Exception as query_err:
                                error_msg = str(query_err)
                                if "project_id" in error_msg and ("does not exist" in error_msg or "UndefinedColumn" in error_msg):
                                    logger.warning(f"⚠️  Database schema mismatch: project_id column missing from crawl_sources table. Please run migrations: alembic upgrade head")
                                    source = None  # Set to None to skip processing
                                else:
                                    raise  # Re-raise if it's a different error
                            
                            if source:
                                if source.created_by_id is not None:
                                    user_id = source.created_by_id
                                # Extract project_id from CrawlSource - this is critical for project-based filtering
                                try:
                                    if source.project_id is not None:
                                        project_id = str(source.project_id)
                                        logger.info(f"📦 Found project_id {project_id} for crawl source {source_id_str}")
                                except (AttributeError, Exception) as e:
                                    # Handle case where project_id column doesn't exist in database
                                    logger.debug(f"⚠️  Could not access project_id for source {source_id_str}: {e}")
                    finally:
                        session.close()
                except Exception as e:
                    error_msg = str(e)
                    if "project_id" in error_msg and ("does not exist" in error_msg or "UndefinedColumn" in error_msg):
                        logger.warning(f"⚠️  Database schema mismatch: project_id column missing from crawl_sources table. Please run migrations: alembic upgrade head")
                    else:
                        logger.warning(f"⚠️ Could not infer user_id/project_id for {file_path.name}: {e}")

                # Ingest the file with user_id and project_id for proper project-based filtering.
                # Resolve the project's saved embedding model so the scheduler
                # writes into the same Chroma collection used by interactive
                # uploads/queries.
                from .rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project
                emb_provider, emb_model, emb_api_key = (None, None, None)
                if project_id:
                    _sess: Session = SessionLocal()
                    try:
                        emb_provider, emb_model, emb_api_key = _resolve_emb_for_project(
                            _sess, project_id
                        )
                    except Exception as _emb_err:
                        logger.warning(
                            f"Scheduler: failed to resolve embedding for project {project_id}: {_emb_err}"
                        )
                    finally:
                        _sess.close()

                from ..settings import settings as _settings
                if _settings.enable_durable_jobs:
                    try:
                        from .job_queue import enqueue_data_folder_ingest
                        _enq_db = SessionLocal()
                        try:
                            import uuid as _uuid_mod
                            enqueue_data_folder_ingest(
                                _enq_db,
                                file_path=str(file_path),
                                user_id=user_id,
                                project_id=_uuid_mod.UUID(str(project_id)) if project_id else None,
                                embedding_provider=emb_provider,
                                embedding_model=emb_model,
                                embedding_api_key=emb_api_key,
                            )
                        finally:
                            _enq_db.close()
                        # Mark as processed at enqueue time to prevent re-enqueueing next tick.
                        with _processed_files_lock:
                            _processed_files.add(str(file_path))
                        logger.info("📥 Enqueued data_folder_ingest job for %s", file_path.name)
                    except Exception as _enq_exc:
                        logger.warning(
                            "data_folder_ingest: durable enqueue failed (%s) — running inline", _enq_exc
                        )
                        _settings = None  # fall through to inline path
                else:
                    _settings = None  # fall through to inline path

                if _settings is None or not _settings.enable_durable_jobs:
                    from .ingest_runtime import run_ingest_sync
                    from .rag.singleton import locked_ingest
                    result = run_ingest_sync(
                        locked_ingest,
                        str(file_path),
                        user_id=user_id,
                        project_id=project_id,
                        embedding_provider=emb_provider,
                        embedding_model=emb_model,
                        embedding_api_key=emb_api_key,
                    )
                    if result.get("status") == "Indexed" or result.get("chunks", 0) > 0:
                        with _processed_files_lock:
                            _processed_files.add(str(file_path))
                        logger.info(
                            "✅ Successfully ingested %s (%s chunks)",
                            file_path.name, result.get("chunks", 0)
                        )
                    else:
                        logger.warning("⚠️ File %s ingested but no chunks found: %s", file_path.name, result)
                    
            except Exception as e:
                logger.error(f"❌ Error ingesting file {file_path.name}: {e}")
                # Don't mark as processed if ingestion failed, so it can be retried
        
        logger.info(f"✅ Completed data folder check: {len(new_files)} file(s) processed")
        
    except ImportError as e:
        logger.warning(f"⚠️ RAGPipeline not available, skipping data folder check: {e}")
    except Exception as e:
        logger.error(f"❌ Error in check_and_ingest_data_folder: {e}")


def sync_gmail_integrations():
    """Check all active Gmail integrations and sync those due for a refresh."""
    try:
        from .redis_client import get_redis as _get_redis
        if not _try_acquire_scheduler_lock(_get_redis(), "gmail_sync", ttl_seconds=6 * 60):
            logger.debug("Scheduler: skipping sync_gmail_integrations (another instance holds lock)")
            return
    except Exception:
        pass

    try:
        from . import gmail_service  # noqa: F401 — ensures gmail deps load
    except ImportError:
        logger.debug("Gmail service not available, skipping gmail sync")
        return

    # Guard: if a previous sync tick is still running, skip this tick.
    # _run_gmail_sync_thread runs synchronously in the scheduler thread — overlapping
    # ticks would block the scheduler for the full duration of both syncs.
    try:
        _guard_db = SessionLocal()
        try:
            _active_syncs = (
                _guard_db.query(GmailSyncJob)
                .filter(GmailSyncJob.status == GmailSyncJobStatus.RUNNING)
                .count()
            )
            if _active_syncs > 0:
                logger.info(
                    "sync_gmail_integrations: skipping tick — %d sync(s) still running",
                    _active_syncs,
                )
                return
        finally:
            _guard_db.close()
    except Exception as _guard_exc:
        logger.debug("sync_gmail_integrations: running-sync check failed: %s", _guard_exc)

    try:
        db = SessionLocal()
        try:
            _cleanup_stale_gmail_jobs(db)
            now = datetime.now(timezone.utc)
            integrations = (
                db.query(GmailIntegration)
                .filter(
                    GmailIntegration.is_active == True,
                    GmailIntegration.status == GmailIntegrationStatus.ACTIVE,
                )
                .all()
            )
            logger.info(f"Gmail sync scheduler: found {len(integrations)} active integration(s)")

            for integration in integrations:
                # Check if cadence elapsed
                if integration.last_sync_at:
                    elapsed = (now - integration.last_sync_at).total_seconds() / 60
                    if elapsed < integration.cadence_minutes:
                        logger.debug(
                            "Gmail sync scheduler: skipping integration %s (elapsed %.1f min < cadence %s min)",
                            integration.id,
                            elapsed,
                            integration.cadence_minutes,
                        )
                        continue

                sync_job = GmailSyncJob(integration_id=integration.id)
                db.add(sync_job)
                db.commit()
                db.refresh(sync_job)

                logger.info(
                    "Gmail sync scheduler: enqueuing sync for integration %s (job %s)",
                    integration.id,
                    sync_job.id,
                )
                try:
                    from .job_queue import enqueue_gmail_sync
                    enqueue_gmail_sync(
                        db,
                        integration_id=str(integration.id),
                        sync_job_id=str(sync_job.id),
                        user_id=getattr(integration, "user_id", None),
                        project_id=getattr(integration, "project_id", None),
                    )
                except Exception as _enq_exc:
                    logger.warning(
                        "Gmail sync: durable enqueue failed (%s) — running inline", _enq_exc
                    )
                    _run_gmail_sync_thread(str(integration.id), str(sync_job.id))

        finally:
            db.close()
    except Exception as exc:
        logger.error(f"Error in sync_gmail_integrations: {exc}")


CONNECTOR_JOB_STALE_MINUTES = 30
CONNECTOR_SYNC_FANOUT_CAP = 3


def _cleanup_stale_connector_jobs(db: Session) -> None:
    from ..models import ConnectorSyncJob, ConnectorSyncJobStatus

    cutoff = datetime.now(timezone.utc) - timedelta(minutes=CONNECTOR_JOB_STALE_MINUTES)
    stale_jobs = (
        db.query(ConnectorSyncJob)
        .filter(
            ConnectorSyncJob.status.in_(
                [ConnectorSyncJobStatus.PENDING, ConnectorSyncJobStatus.RUNNING]
            ),
            ConnectorSyncJob.queued_at < cutoff,
        )
        .all()
    )
    if not stale_jobs:
        return
    now = datetime.now(timezone.utc)
    for job in stale_jobs:
        job.status = ConnectorSyncJobStatus.FAILED
        job.errors = (job.errors or []) + [
            {"error": f"stale connector sync auto-failed after {CONNECTOR_JOB_STALE_MINUTES} minutes"}
        ]
        job.finished_at = now
    db.commit()
    logger.warning("Connector scheduler: auto-failed %s stale job(s)", len(stale_jobs))


def sync_connector_integrations():
    """Enqueue due connector syncs (Google Drive, Notion, etc.)."""
    try:
        from .redis_client import get_redis as _get_redis
        if not _try_acquire_scheduler_lock(_get_redis(), "connector_sync", ttl_seconds=6 * 60):
            logger.debug("Scheduler: skipping sync_connector_integrations (lock held)")
            return
    except Exception:
        pass

    try:
        from ..models import (
            ConnectorIntegration,
            ConnectorIntegrationStatus,
            ConnectorSyncJob,
            ConnectorSyncJobStatus,
        )
        from .connectors.framework import (
            CONNECTOR_TYPE_CONFLUENCE,
            CONNECTOR_TYPE_GOOGLE_DRIVE,
            CONNECTOR_TYPE_NOTION,
            CONNECTOR_TYPE_SHAREPOINT,
            CONNECTOR_TYPE_SLACK,
            create_sync_job,
            enqueue_connector_sync,
            get_or_create_settings_row,
            get_or_create_sources_row,
            validate_confluence_settings,
            validate_connector_settings,
            validate_notion_settings,
            validate_sharepoint_settings,
            validate_slack_settings,
        )

        db = SessionLocal()
        try:
            _cleanup_stale_connector_jobs(db)

            active_running = (
                db.query(ConnectorSyncJob)
                .filter(ConnectorSyncJob.status == ConnectorSyncJobStatus.RUNNING)
                .count()
            )
            if active_running > 0:
                logger.info(
                    "sync_connector_integrations: skipping tick — %d sync(s) still running",
                    active_running,
                )
                return

            now = datetime.now(timezone.utc)
            integrations = (
                db.query(ConnectorIntegration)
                .filter(
                    ConnectorIntegration.connector_type.in_(
                        [
                            CONNECTOR_TYPE_GOOGLE_DRIVE,
                            CONNECTOR_TYPE_NOTION,
                            CONNECTOR_TYPE_CONFLUENCE,
                            CONNECTOR_TYPE_SHAREPOINT,
                            CONNECTOR_TYPE_SLACK,
                        ]
                    ),
                    ConnectorIntegration.is_active.is_(True),
                    ConnectorIntegration.status == ConnectorIntegrationStatus.ACTIVE,
                )
                .order_by(ConnectorIntegration.last_sync_at.asc().nullsfirst())
                .limit(CONNECTOR_SYNC_FANOUT_CAP)
                .all()
            )

            started = 0
            for integration in integrations:
                if started >= CONNECTOR_SYNC_FANOUT_CAP:
                    break
                settings_row = get_or_create_settings_row(db, integration.id)
                if integration.connector_type == CONNECTOR_TYPE_NOTION:
                    cfg = validate_notion_settings(settings_row.settings)
                elif integration.connector_type == CONNECTOR_TYPE_CONFLUENCE:
                    cfg = validate_confluence_settings(settings_row.settings)
                elif integration.connector_type == CONNECTOR_TYPE_SHAREPOINT:
                    cfg = validate_sharepoint_settings(settings_row.settings)
                elif integration.connector_type == CONNECTOR_TYPE_SLACK:
                    cfg = validate_slack_settings(settings_row.settings)
                else:
                    cfg = validate_connector_settings(settings_row.settings)
                cadence = int(cfg.get("cadence_minutes", 30))
                if integration.last_sync_at:
                    elapsed = (now - integration.last_sync_at).total_seconds() / 60
                    if elapsed < cadence:
                        continue

                sources_row = get_or_create_sources_row(db, integration.id)
                has_sources = False
                if sources_row and isinstance(sources_row.sources, dict):
                    if integration.connector_type == CONNECTOR_TYPE_NOTION:
                        pages = sources_row.sources.get("pages") or []
                        databases = sources_row.sources.get("databases") or []
                        has_sources = bool(pages or databases)
                    elif integration.connector_type == CONNECTOR_TYPE_CONFLUENCE:
                        spaces = sources_row.sources.get("spaces") or []
                        pages = sources_row.sources.get("pages") or []
                        has_sources = bool(spaces or pages)
                    elif integration.connector_type == CONNECTOR_TYPE_SHAREPOINT:
                        sites = sources_row.sources.get("sites") or []
                        drives = sources_row.sources.get("drives") or []
                        has_sources = bool(sites or drives)
                    elif integration.connector_type == CONNECTOR_TYPE_SLACK:
                        channels = sources_row.sources.get("channels") or []
                        has_sources = bool(channels)
                    else:
                        folders = sources_row.sources.get("folders") or []
                        files = sources_row.sources.get("files") or []
                        has_sources = bool(folders or files)
                if not has_sources:
                    continue

                sync_job = create_sync_job(db, integration.id)

                if enqueue_connector_sync(db, integration=integration, sync_job_id=sync_job.id):
                    started += 1
                    logger.info(
                        "Connector scheduler: enqueued %s sync integration=%s job=%s",
                        integration.connector_type,
                        integration.id,
                        sync_job.id,
                    )
                else:
                    if integration.connector_type == CONNECTOR_TYPE_NOTION:
                        from .connectors.notion import run_notion_sync

                        run_notion_sync(db, str(integration.id), str(sync_job.id))
                    elif integration.connector_type == CONNECTOR_TYPE_CONFLUENCE:
                        from .connectors.confluence import run_confluence_sync

                        run_confluence_sync(db, str(integration.id), str(sync_job.id))
                    elif integration.connector_type == CONNECTOR_TYPE_SHAREPOINT:
                        from .connectors.sharepoint import run_sharepoint_sync

                        run_sharepoint_sync(db, str(integration.id), str(sync_job.id))
                    elif integration.connector_type == CONNECTOR_TYPE_SLACK:
                        from .connectors.slack import run_slack_sync

                        run_slack_sync(db, str(integration.id), str(sync_job.id))
                    else:
                        from .connectors.google_drive import run_google_drive_sync

                        run_google_drive_sync(db, str(integration.id), str(sync_job.id))
                    started += 1
        finally:
            db.close()
    except Exception as exc:
        logger.error("Error in sync_connector_integrations: %s", exc)


def _cleanup_stale_gmail_jobs(db: Session) -> None:
    """Mark stale PENDING/RUNNING Gmail sync jobs as FAILED."""
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=GMAIL_JOB_STALE_MINUTES)
    stale_jobs = (
        db.query(GmailSyncJob)
        .filter(
            GmailSyncJob.status.in_([GmailSyncJobStatus.PENDING, GmailSyncJobStatus.RUNNING]),
            GmailSyncJob.queued_at < cutoff,
        )
        .all()
    )
    if not stale_jobs:
        return

    now = datetime.now(timezone.utc)
    for job in stale_jobs:
        job.status = GmailSyncJobStatus.FAILED
        existing_errors = job.errors or []
        existing_errors.append(
            {"error": f"stale sync job auto-failed after {GMAIL_JOB_STALE_MINUTES} minutes"}
        )
        job.errors = existing_errors
        if not job.finished_at:
            job.finished_at = now

    db.commit()
    logger.warning("Gmail sync scheduler: auto-failed %s stale job(s)", len(stale_jobs))


def _run_gmail_sync_thread(integration_id: str, sync_job_id: str):
    """Background thread for a single Gmail sync job."""
    from .gmail_service import fetch_emails, upsert_staged_from_parsed_list
    import uuid as _uuid

    db = SessionLocal()
    try:
        integration = db.query(GmailIntegration).filter(GmailIntegration.id == _uuid.UUID(integration_id)).first()
        sync_job = db.query(GmailSyncJob).filter(GmailSyncJob.id == _uuid.UUID(sync_job_id)).first()
        if not integration or not sync_job:
            return

        sync_job.status = GmailSyncJobStatus.RUNNING
        sync_job.started_at = datetime.now(timezone.utc)
        db.commit()

        errors = []
        emails_fetched = 0
        emails_indexed = 0
        catastrophic = False

        try:
            credential = (
                db.query(GmailProjectCredential)
                .filter(
                    GmailProjectCredential.user_id == integration.user_id,
                    GmailProjectCredential.project_id == integration.project_id,
                )
                .first()
            )
            if credential:
                client_id = credential.client_id
                client_secret = decrypt_secret(credential.client_secret_encrypted)
            elif settings.google_client_id and settings.google_client_secret:
                client_id = settings.google_client_id
                client_secret = settings.google_client_secret
            else:
                raise ValueError("Gmail OAuth credentials are not configured for this project")

            parsed_emails, new_history_id = fetch_emails(
                access_token=safe_decrypt_secret(integration.access_token),
                refresh_token=safe_decrypt_secret(integration.refresh_token),
                client_id=client_id,
                client_secret=client_secret,
                max_results=integration.max_emails_per_sync,
                last_history_id=integration.last_history_id,
            )
            emails_fetched = len(parsed_emails)

            _, staging_errors = upsert_staged_from_parsed_list(
                db,
                integration.id,
                integration.project_id,
                parsed_emails,
            )
            errors.extend(staging_errors)

            integration.last_sync_at = datetime.now(timezone.utc)
            if new_history_id:
                integration.last_history_id = new_history_id
            if integration.status == GmailIntegrationStatus.ERROR:
                integration.status = GmailIntegrationStatus.ACTIVE

        except Exception as exc:
            catastrophic = True
            errors.append({"error": str(exc)})
            integration.status = GmailIntegrationStatus.ERROR
            logger.error(f"Gmail scheduled sync failed for {integration_id}: {exc}")

        sync_job.status = GmailSyncJobStatus.FAILED if catastrophic else GmailSyncJobStatus.COMPLETED
        sync_job.emails_fetched = emails_fetched
        sync_job.emails_indexed = emails_indexed
        sync_job.errors = errors
        sync_job.finished_at = datetime.now(timezone.utc)
        db.commit()

        logger.info(f"Gmail scheduled sync {sync_job_id}: fetched={emails_fetched} indexed={emails_indexed}")

    except Exception as exc:
        logger.error(f"Unhandled error in gmail sync thread {sync_job_id}: {exc}")
    finally:
        db.close()


def start_scheduler():
    """Start the scheduler and register periodic jobs"""
    sched = get_scheduler()

    # Check for sources that need crawling every hour
    sched.add_job(
        check_and_crawl_sources,
        trigger=IntervalTrigger(hours=1),
        id='check_scheduled_crawls',
        name='Check and trigger scheduled crawls',
        replace_existing=True
    )

    # Check data folder for new files every 5 minutes
    sched.add_job(
        check_and_ingest_data_folder,
        trigger=IntervalTrigger(minutes=5),
        id='check_data_folder',
        name='Check data folder and auto-ingest new files',
        replace_existing=True
    )

    # Check Gmail integrations every 5 minutes (each integration has its own cadence)
    sched.add_job(
        sync_gmail_integrations,
        trigger=IntervalTrigger(minutes=5),
        id='sync_gmail_integrations',
        name='Sync Gmail integrations',
        replace_existing=True,
    )

    # Check Google Drive connector integrations every 5 minutes
    sched.add_job(
        sync_connector_integrations,
        trigger=IntervalTrigger(minutes=5),
        id='sync_connector_integrations',
        name='Sync connector integrations',
        replace_existing=True,
    )

    # Promote WAITING crawl jobs to PENDING as slots free up
    sched.add_job(
        _promote_waiting_crawls_sweep,
        trigger=IntervalTrigger(seconds=settings.waiting_crawl_promote_interval_sec),
        id='promote_waiting_crawls',
        name='Promote WAITING crawl jobs to PENDING',
        replace_existing=True,
    )

    # Archive completed/failed background jobs (retention configured via BACKGROUND_JOB_RETENTION_DAYS)
    def _archive_old_jobs():
        try:
            from .job_queue import archive_old_jobs
            archive_old_jobs(retention_days=settings.background_job_retention_days)
        except Exception as exc:
            logger.warning("Weekly job archival failed: %s", exc)

    sched.add_job(
        _archive_old_jobs,
        trigger=IntervalTrigger(weeks=1),
        id='archive_old_background_jobs',
        name='Archive completed/failed background jobs',
        replace_existing=True,
    )

    logger.info("✅ Scheduler jobs registered:")
    logger.info("   - Checking for scheduled crawls every hour")
    logger.info("   - Checking data folder for new files every 5 minutes")
    logger.info("   - Checking Gmail integrations every 5 minutes")
    logger.info("   - Checking connector integrations every 5 minutes")
    logger.info("   - Promoting WAITING crawls every %ss", settings.waiting_crawl_promote_interval_sec)
    logger.info("   - Archiving old background jobs weekly (retention=%sd)", settings.background_job_retention_days)

    def _run_startup_scheduler_jobs():
        """Must not block ASGI startup — RAGPipeline init can take minutes."""
        try:
            check_and_ingest_data_folder()
        except Exception as e:
            logger.warning(f"⚠️ Initial data folder check failed: {e}")
        try:
            sync_gmail_integrations()
        except Exception as e:
            logger.warning(f"⚠️ Initial Gmail sync check failed: {e}")

    # Defer so login and health endpoints respond immediately after uvicorn startup.
    threading.Thread(
        target=_run_startup_scheduler_jobs,
        daemon=True,
        name="scheduler-startup-jobs",
    ).start()


def _promote_waiting_crawls_sweep():
    """Promote WAITING crawl jobs to PENDING for users who have free slots."""
    try:
        from .redis_client import get_redis as _get_redis
        ttl = max(10, int(settings.waiting_crawl_promote_interval_sec) + 10)
        if not _try_acquire_scheduler_lock(_get_redis(), "promote_waiting_crawls", ttl_seconds=ttl):
            logger.debug("Scheduler: skipping promote_waiting_crawls_sweep (another instance holds lock)")
            return
    except Exception:
        pass

    db: Session = SessionLocal()
    try:
        from .concurrency_limits import promote_all_waiting_for_user
        from ..models import CrawlJob, CrawlJobStatus, CrawlSource

        waiting_user_rows = (
            db.query(CrawlSource.created_by_id)
            .join(CrawlJob, CrawlJob.source_id == CrawlSource.id)
            .filter(CrawlJob.status == CrawlJobStatus.WAITING)
            .distinct()
            .all()
        )

        if not waiting_user_rows:
            return

        logger.debug("promote_waiting_crawls_sweep: %d user(s) have WAITING crawls", len(waiting_user_rows))
        for (user_id,) in waiting_user_rows:
            try:
                promote_all_waiting_for_user(db, user_id)
            except Exception as exc:
                logger.error(
                    "promote_waiting_crawls_sweep: failed for user %s: %s",
                    user_id,
                    exc,
                )
    except Exception as exc:
        logger.error("promote_waiting_crawls_sweep: unexpected error: %s", exc)
    finally:
        db.close()


def stop_scheduler():
    """Stop the scheduler"""
    global scheduler
    with scheduler_lock:
        if scheduler and scheduler.running:
            scheduler.shutdown()
            scheduler = None
            logger.info("🛑 Scheduler stopped")

