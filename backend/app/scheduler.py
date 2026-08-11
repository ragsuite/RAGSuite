"""
Scheduler service for automatic crawling based on cadence
"""
from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from .models import CrawlSource, CrawlCadence, CrawlSourceStatus
from .db import SessionLocal
from .services.crawler import run_crawl, create_crawl_job
import threading
import logging
from pathlib import Path
from typing import Set

logger = logging.getLogger(__name__)

# Global scheduler instance
scheduler = None
scheduler_lock = threading.Lock()

# Track processed files to avoid re-ingesting
_processed_files: Set[str] = set()
_processed_files_lock = threading.Lock()


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
    db: Session = SessionLocal()
    try:
        # Get all active sources
        sources = db.query(CrawlSource).filter(
            CrawlSource.is_active == True,
            CrawlSource.status == CrawlSourceStatus.READY
        ).all()
        
        logger.info(f"🔍 Checking {len(sources)} active sources for scheduled crawling")
        
        for source in sources:
            try:
                if should_crawl(source):
                    logger.info(f"📅 Scheduling crawl for source: {source.name} (ID: {source.id})")
                    # Run crawl in a separate thread to avoid blocking
                    threading.Thread(
                        target=run_crawl_in_thread,
                        args=(source.id,),
                        daemon=True
                    ).start()
                else:
                    next_crawl = get_next_crawl_time(source)
                    logger.debug(f"⏭️  Source {source.name} doesn't need crawling yet. Next crawl: {next_crawl}")
            except Exception as e:
                logger.error(f"❌ Error checking source {source.id}: {e}")
    
    except Exception as e:
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


def _get_shared_rag_pipeline():
    from .services.rag.singleton import get_pipeline
    return get_pipeline()


def check_and_ingest_data_folder():
    """
    Check the data folder for new files and automatically ingest them into RAG.
    This function runs periodically to monitor for new files.
    """
    try:
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

        # Reuse shared RAG pipeline to avoid loading model twice
        rag_pipeline = _get_shared_rag_pipeline()
        if not rag_pipeline:
            return
        
        # Process each new file
        for file_path in new_files:
            try:
                logger.info(f"📥 Ingesting file: {file_path.name}")

                # Try to infer user_id from crawl export filename: crawl_export_{source_id}_{timestamp}.csv
                user_id = None
                try:
                    from sqlalchemy.orm import Session
                    from .db import SessionLocal
                    from .models import CrawlSource

                    session: Session = SessionLocal()
                    project_id = None
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
                            source = (
                                session.query(CrawlSource)
                                .filter(CrawlSource.id == source_uuid)
                                .first()
                            )
                            if source:
                                if source.created_by_id is not None:
                                    user_id = source.created_by_id
                                if source.project_id is not None:
                                    project_id = str(source.project_id)
                    finally:
                        session.close()
                except Exception as e:
                    logger.warning(f"⚠️ Could not infer user_id/project_id for {file_path.name}: {e}")

                # Ingest the file scoped to the correct user and project.
                # Resolve the project's saved embedding model so the writer
                # targets the matching per-model Chroma collection.
                from .services.rag.singleton import locked_ingest
                from .services.rag.embedding_resolver import resolve_ingest_for_project as _resolve_emb_for_project
                emb_provider, emb_model, emb_api_key = (None, None, None)
                if project_id:
                    _resolve_session = None
                    try:
                        from .db import SessionLocal as _AppSession
                        _resolve_session = _AppSession()
                        emb_provider, emb_model, emb_api_key = _resolve_emb_for_project(
                            _resolve_session, project_id
                        )
                    except Exception as _emb_err:
                        logger.warning(
                            f"App scheduler: failed to resolve embedding for project {project_id}: {_emb_err}"
                        )
                    finally:
                        if _resolve_session is not None:
                            try:
                                _resolve_session.close()
                            except Exception:
                                pass
                result = locked_ingest(
                    str(file_path),
                    user_id=user_id,
                    project_id=project_id,
                    embedding_provider=emb_provider,
                    embedding_model=emb_model,
                    embedding_api_key=emb_api_key,
                )
                
                if result.get("status") == "Indexed" or result.get("chunks", 0) > 0:
                    # Mark as processed
                    with _processed_files_lock:
                        _processed_files.add(str(file_path))
                    
                    chunks_count = result.get("chunks", 0)
                    logger.info(f"✅ Successfully ingested {file_path.name} ({chunks_count} chunks)")
                else:
                    logger.warning(f"⚠️ File {file_path.name} ingested but no chunks found: {result}")
                    
            except Exception as e:
                logger.error(f"❌ Error ingesting file {file_path.name}: {e}")
                # Don't mark as processed if ingestion failed, so it can be retried
        
        logger.info(f"✅ Completed data folder check: {len(new_files)} file(s) processed")
        
    except ImportError as e:
        logger.warning(f"⚠️ RAGPipeline not available, skipping data folder check: {e}")
    except Exception as e:
        logger.error(f"❌ Error in check_and_ingest_data_folder: {e}")


def sync_all_clickup_integrations():
    """Periodic job: sync all active ClickUp integrations whose cadence has elapsed."""
    try:
        from .models import ClickUpIntegration, ClickUpIntegrationStatus, ClickUpSyncJob
        from .routes.clickup import _run_sync_job
        import threading as _threading

        db: Session = SessionLocal()
        try:
            integrations = (
                db.query(ClickUpIntegration)
                .filter(
                    ClickUpIntegration.is_active == True,
                    ClickUpIntegration.status == ClickUpIntegrationStatus.ACTIVE,
                )
                .all()
            )
            now = datetime.now()
            for integration in integrations:
                last = integration.last_sync_at
                cadence = integration.cadence_minutes or 60
                if last is None or (now - last.replace(tzinfo=None)).total_seconds() >= cadence * 60:
                    sync_job = ClickUpSyncJob(integration_id=integration.id)
                    db.add(sync_job)
                    db.commit()
                    db.refresh(sync_job)
                    t = _threading.Thread(
                        target=_run_sync_job,
                        args=(str(integration.id), str(sync_job.id)),
                        daemon=True,
                    )
                    t.start()
                    logger.info(f"ClickUp sync triggered for integration {integration.id}")
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"sync_all_clickup_integrations error: {exc}")


def sync_all_gmail_integrations():
    """Periodic job: sync all active Gmail integrations whose cadence has elapsed."""
    try:
        from .models import GmailIntegration, GmailIntegrationStatus, GmailSyncJob
        from .routes.gmail import _run_sync_job
        import threading as _threading

        db: Session = SessionLocal()
        try:
            integrations = (
                db.query(GmailIntegration)
                .filter(
                    GmailIntegration.is_active == True,
                    GmailIntegration.status == GmailIntegrationStatus.ACTIVE,
                )
                .all()
            )
            now = datetime.now()
            for integration in integrations:
                last = integration.last_sync_at
                cadence = integration.cadence_minutes or 60
                if last is None or (now - last.replace(tzinfo=None)).total_seconds() >= cadence * 60:
                    sync_job = GmailSyncJob(integration_id=integration.id)
                    db.add(sync_job)
                    db.commit()
                    db.refresh(sync_job)
                    t = _threading.Thread(
                        target=_run_sync_job,
                        args=(str(integration.id), str(sync_job.id)),
                        daemon=True,
                    )
                    t.start()
                    logger.info(f"Gmail sync triggered for integration {integration.id}")
        finally:
            db.close()
    except Exception as exc:
        logger.error(f"sync_all_gmail_integrations error: {exc}")


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

    # Sync ClickUp integrations every 30 minutes
    sched.add_job(
        sync_all_clickup_integrations,
        trigger=IntervalTrigger(minutes=30),
        id='sync_clickup',
        name='Sync all active ClickUp integrations',
        replace_existing=True
    )

    # Sync Gmail integrations every 5 minutes
    sched.add_job(
        sync_all_gmail_integrations,
        trigger=IntervalTrigger(minutes=5),
        id='sync_gmail',
        name='Sync all active Gmail integrations',
        replace_existing=True
    )

    logger.info("✅ Scheduler jobs registered:")
    logger.info("   - Checking for scheduled crawls every hour")
    logger.info("   - Checking data folder for new files every 5 minutes")
    logger.info("   - Syncing ClickUp integrations every 30 minutes")
    logger.info("   - Syncing Gmail integrations every 5 minutes")


def stop_scheduler():
    """Stop the scheduler"""
    global scheduler
    with scheduler_lock:
        if scheduler and scheduler.running:
            scheduler.shutdown()
            scheduler = None
            logger.info("🛑 Scheduler stopped")

