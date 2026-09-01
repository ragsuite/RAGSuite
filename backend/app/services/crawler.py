import scrapy

from scrapy_playwright.page import PageMethod

from scrapy.http import Request

from scrapy.crawler import CrawlerProcess

from scrapy.utils.project import get_project_settings

from scrapy import signals

from typing import List, Dict, Optional

from datetime import datetime, timezone

from sqlalchemy.orm import Session

from sqlalchemy import create_engine

from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import IntegrityError

from ..models import CrawlSource, CrawlJob, Document, CrawlJobStatus, Project, IntegrationEmbed, CrawlHeadlessMode

from ..settings import settings

from ..db import engine, SessionLocal

from ..services.notification_service import create_notification
from ..services.crawl_diagnostics import CrawlDiagnosticsCollector
from ..services.html_text_utils import enrich_contact_links, extract_canonical_page_url
from ..services.pdf_text_cleaner import normalize_pdf_extracted_text

import uuid

import threading

import os

import sys

import pandas as pd

from pathlib import Path

import hashlib

from urllib.parse import urlparse, urljoin as _stdlib_urljoin

import re
import logging

logger = logging.getLogger(__name__)


def _sanitize_postgres_text(value: Optional[str]) -> str:
    """PostgreSQL rejects NUL (0x00) bytes in text/varchar fields."""
    if not value:
        return ""
    return value.replace("\x00", "")


def _extract_document_base_url(soup, page_url: str) -> str:
    """Resolve <base href> against page_url for link discovery, or return page_url."""
    base_tag = soup.find("base", href=True)
    if not base_tag:
        return page_url

    href = (base_tag.get("href") or "").strip()
    if not href or href.startswith(("#", "javascript:", "mailto:", "tel:")):
        return page_url

    try:
        resolved = _stdlib_urljoin(page_url, href)
        parsed = urlparse(resolved)
        if parsed.scheme not in ("http", "https") or not parsed.netloc:
            return page_url

        page_parsed = urlparse(page_url)
        if parsed.netloc.lower() != page_parsed.netloc.lower():
            return page_url

        return resolved
    except Exception:
        return page_url


def _safe_urljoin(
    base_url: str,
    href: str,
    start_url: str = None,
    *,
    rescope_root_links: bool = False,
) -> str:
    """urljoin that:
    1. When rescope_root_links is enabled, re-scopes root-relative hrefs back under the
       start_url sub-path when the crawl base is a sub-path (e.g. /en/latest/).  Sites
       like Read-the-Docs use root-relative links (/ExtXXX/...) that resolve outside the
       base path without this correction.  Has no effect when start_url is the domain root.
    2. Detects bare relative hrefs that get doubled onto a deep base path and
       re-anchors them to the domain root (e.g. base.bund.de CMS pattern).
    """
    result = _stdlib_urljoin(base_url, href)

    # Fix root-relative hrefs that resolve outside the start_url sub-path.
    if (
        rescope_root_links
        and start_url
        and href
        and href.startswith('/')
        and not href.startswith('//')
    ):
        parsed_start = urlparse(start_url)
        base_prefix = parsed_start.path.rstrip('/')  # e.g. "/en/latest"
        if base_prefix and base_prefix != '/':
            parsed_result = urlparse(result)
            if (parsed_result.netloc == parsed_start.netloc and
                    not parsed_result.path.startswith(base_prefix + '/')):
                new_path = base_prefix + parsed_result.path
                result = parsed_result._replace(path=new_path).geturl()

    # Only act on bare relative hrefs below — skip /absolute, ./relative, #anchor, http://, mailto: etc.
    if not href or href.startswith(('/', '#', '.', 'http://', 'https://', 'mailto:', 'tel:', 'javascript:')):
        return result

    parsed_base = urlparse(base_url)
    base_dir = parsed_base.path.rsplit('/', 1)[0].strip("/")
    result_path = urlparse(result).path.strip("/")

    # Doubled-path heuristic (bund.de CMS pattern): bare hrefs that get appended
    # onto a deep base path instead of resolving relative to the domain root.
    # Skip this fix when start_url has a sub-path and result is correctly under it —
    # otherwise we'd strip the sub-path prefix from legitimately deep URLs.
    if base_dir and '/' in base_dir and result_path.startswith(base_dir + "/"):
        skip_doubling_fix = False
        if start_url:
            parsed_st = urlparse(start_url)
            st_prefix = parsed_st.path.rstrip('/')
            if st_prefix and st_prefix != '/' and urlparse(result).path.startswith(st_prefix):
                skip_doubling_fix = True  # result already under start_url sub-path — correct
        if not skip_doubling_fix:
            root = f"{parsed_base.scheme}://{parsed_base.netloc}/"
            result = _stdlib_urljoin(root, href)

    return result



# Add the ragsuites directory to the Python path for Scrapy

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', '..', 'ragsuites'))

# Per-source cancellation flags. Set by request_crawl_cancel(); checked inside the
# main crawl loop so the spider exits at the next iteration without waiting for
# the full runtime or page limit.
_cancel_flags: dict[str, threading.Event] = {}
_cancel_flags_lock = threading.Lock()


def request_crawl_cancel(source_id: str) -> None:
    """Signal the running crawl for source_id to stop at next loop iteration."""
    with _cancel_flags_lock:
        flag = _cancel_flags.get(str(source_id))
        if flag:
            flag.set()


def _register_cancel_flag(source_id: str) -> threading.Event:
    flag = threading.Event()
    with _cancel_flags_lock:
        _cancel_flags[str(source_id)] = flag
    return flag


def _clear_cancel_flag(source_id: str) -> None:
    with _cancel_flags_lock:
        _cancel_flags.pop(str(source_id), None)


# Old Scrapy spider code removed - now using autonomous crawler

# Single source of truth for crawl defaults (non-limit fields).
# Per-page/PDF size cap: settings.crawl_content_length_limit — see get_crawl_content_length_limit().
DEFAULT_CRAWL_SETTINGS = {
    "depth": 3,
    "max_pages": 2000,
    "delay_seconds": 0.5,
    "max_links_per_page": 80,
    "max_runtime_minutes": 120,
}


def get_crawl_content_length_limit() -> int:
    """Global crawl content cap (env: CRAWL_CONTENT_LENGTH_LIMIT). Used for all projects/sources."""
    from ..settings import settings

    return int(getattr(settings, "crawl_content_length_limit", 10_000_000) or 10_000_000)


def _crawl_aiohttp_ssl_connector_arg():
    """
    SSL argument for aiohttp.TCPConnector when fetching HTTPS URLs.

    Uses certifi's CA bundle when available so verification works on Python installs
    whose default store is incomplete (common on macOS with python.org builds).
    Set CRAWL_SSL_VERIFY=false only for local debugging (insecure).
    """
    import ssl

    if not settings.crawl_ssl_verify:
        return False
    try:
        import certifi

        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def _coerce_crawl_headless_mode(mode) -> CrawlHeadlessMode:
    """Normalize DB/API headless enum or string to CrawlHeadlessMode."""
    if mode is None:
        return CrawlHeadlessMode.AUTO
    if isinstance(mode, CrawlHeadlessMode):
        return mode
    key = str(mode).strip().upper().split(".")[-1]
    try:
        return CrawlHeadlessMode[key]
    except KeyError:
        return CrawlHeadlessMode.AUTO


def _quick_visible_text_length(html: str) -> int:
    """Cheap extract for AUTO mode: skip Playwright when enough text exists without JS."""
    if not html:
        return 0
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html, "html.parser")
        for tag in soup(["script", "style", "noscript"]):
            tag.decompose()
        return len(" ".join(soup.get_text().split()))
    except Exception:
        return 0


def validate_url_reachable(url: str, timeout: int = 10) -> tuple[bool, str]:
    """
    Validate if a URL is reachable and returns a valid HTTP response.
    Returns (is_valid, error_message)
    """
    import aiohttp
    import asyncio
    from urllib.parse import urlparse
    
    # Basic URL format validation
    try:
        parsed = urlparse(url)
        if not parsed.scheme or not parsed.netloc:
            return False, "Invalid URL format"
        if parsed.scheme not in ('http', 'https'):
            return False, f"Unsupported URL scheme: {parsed.scheme}"
    except Exception as e:
        return False, f"Invalid URL format: {str(e)}"
    
    # Check if URL is reachable
    async def _check_reachable():
        try:
            async with aiohttp.ClientSession(headers={'User-Agent': 'RAGSuite-Crawler/1.0'}) as session:
                async with session.get(
                    url,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                    allow_redirects=True,
                    ssl=settings.crawl_ssl_verify  # configurable; set CRAWL_SSL_VERIFY=false for dev self-signed certs
                ) as response:
                    if response.status >= 400:
                        return False, f"URL returned HTTP {response.status}"
                    return True, "URL is reachable"
        except aiohttp.ClientConnectorError as e:
            return False, f"Cannot connect to URL: {str(e)}"
        except aiohttp.ServerTimeoutError:
            return False, f"Connection timeout after {timeout} seconds"
        except asyncio.TimeoutError:
            return False, f"Request timeout after {timeout} seconds"
        except Exception as e:
            return False, f"Error validating URL: {str(e)}"
    
    # Run async check
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            # If loop is already running, create a new task
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(asyncio.run, _check_reachable())
                return future.result(timeout=timeout + 2)
        else:
            return loop.run_until_complete(_check_reachable())
    except Exception as e:
        # Fallback: try synchronous check
        try:
            import requests
            response = requests.get(url, timeout=timeout, allow_redirects=True)
            if response.status_code >= 400:
                return False, f"URL returned HTTP {response.status_code}"
            return True, "URL is reachable"
        except requests.exceptions.ConnectionError:
            return False, "Cannot connect to URL - domain may not exist"
        except requests.exceptions.Timeout:
            return False, f"Connection timeout after {timeout} seconds"
        except requests.exceptions.RequestException as e:
            return False, f"Error validating URL: {str(e)}"
        except Exception as e:
            return False, f"Error validating URL: {str(e)}"


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
        print(f"⚠️ Error normalizing domain from URL {url}: {e}")
        return ""


def _auto_add_crawled_domains_to_allowed_list(source: CrawlSource, crawled_urls: set, db: Session):
    """
    Automatically add all unique crawled domains to allowed domains for both chatbot and search widgets.
    This is called when a crawl completes successfully.
    Extracts domains from all crawled URLs, not just the base URL.
    """
    try:
        if not crawled_urls or len(crawled_urls) == 0:
            print(f"⚠️ No crawled URLs provided for source {source.id}")
            return
        
        # Extract all unique domains from all crawled URLs
        unique_domains = set()
        for url in crawled_urls:
            domain = _normalize_domain_from_url(url)
            if domain:
                unique_domains.add(domain)
        
        if not unique_domains:
            print(f"⚠️ Could not extract any domains from crawled URLs")
            return
        
        print(f"🌐 Extracted {len(unique_domains)} unique domains from {len(crawled_urls)} crawled URLs")
        
        # Get project to find owner
        project = db.query(Project).filter(Project.id == source.project_id).first()
        if not project:
            print(f"⚠️ Project {source.project_id} not found for source {source.id}")
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
            print(f"✅ Created new IntegrationEmbed config for user {owner_id}")
        
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
            print(f"✅ Automatically added {len(domains_added_to_chatbot)} domains to chatbot and {len(domains_added_to_search)} domains to search allowed lists (user: {owner_id}, project: {source.project_id})")
            if domains_added_to_chatbot:
                print(f"   Chatbot domains added: {', '.join(list(domains_added_to_chatbot)[:5])}{'...' if len(domains_added_to_chatbot) > 5 else ''}")
            if domains_added_to_search:
                print(f"   Search domains added: {', '.join(list(domains_added_to_search)[:5])}{'...' if len(domains_added_to_search) > 5 else ''}")
        else:
            print(f"ℹ️ All {len(unique_domains)} domains already exist in allowed domains")
            
    except Exception as e:
        print(f"❌ Error auto-adding domains to allowed list: {e}")
        import traceback
        traceback.print_exc()
        try:
            db.rollback()
        except Exception:
            pass
        # Don't raise - this is a non-critical operation


def create_crawl_job(
    db: Session,
    source_id,
    initial_status: CrawlJobStatus = CrawlJobStatus.PENDING,
) -> uuid.UUID:
    """
    Create a crawl job and return its ID immediately.

    initial_status=WAITING  → job is queued but not started (slots full).
    initial_status=PENDING  → normal; concurrency limit is enforced here.
    """
    from .concurrency_limits import assert_can_start_crawl, source_has_active_crawl

    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not source:
        raise ValueError(f"Source {source_id} not found")

    if source_has_active_crawl(db, source.id):
        raise ValueError(
            f"A crawl is already in progress for source {source_id}. "
            "Wait for it to finish before starting another."
        )

    # Only enforce the per-project concurrency cap for PENDING jobs;
    # WAITING jobs are allowed regardless (they sit in queue, not using a slot).
    if initial_status == CrawlJobStatus.PENDING:
        assert_can_start_crawl(db, source.project_id)

    job = CrawlJob(
        id=uuid.uuid4(),
        source_id=source.id,
        status=initial_status,
        queued_at=datetime.now(timezone.utc),
    )
    db.add(job)
    db.commit()
    db.refresh(job)

    status_label = initial_status.value if hasattr(initial_status, "value") else str(initial_status)
    print(f"🔄 Created crawl job {job.id} for source {source.id} [{status_label}]")

    return job.id



async def run_crawl_fetch(job_id: uuid.UUID, source_id: uuid.UUID):
    """
    Crawl fetch phase: validate URL, run spider, save Documents, enqueue ingest batches.

    Completion (COMPLETED/FAILED) is handled by the last CRAWL_INGEST_BATCH job when
    durable jobs are enabled, or inline below when they are not.
    """

    # Create a new database session for the background task

    from ..db import SessionLocal

    db = SessionLocal()

    

    try:

        # Fetch the job and source

        job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()

        if not job:

            print(f"❌ Job {job_id} not found")

            return

        

        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()

        if not source:

            print(f"❌ Source {source_id} not found")

            job.status = CrawlJobStatus.FAILED

            job.errors = [{"error": f"Source {source_id} not found", "timestamp": datetime.now(timezone.utc).isoformat()}]

            db.commit()

            return

        
        # Validate URL is reachable before starting crawl
        print(f"🔍 Validating URL: {source.base_url}")
        is_valid, error_msg = validate_url_reachable(source.base_url, timeout=10)
        if not is_valid:
            print(f"❌ URL validation failed: {error_msg}")
            job.status = CrawlJobStatus.FAILED
            job.errors = [{"error": f"Invalid or unreachable URL: {error_msg}", "timestamp": datetime.now(timezone.utc).isoformat()}]
            job.finished_at = datetime.now(timezone.utc)
            db.commit()
            return
        
        print(f"✅ URL validation passed: {source.base_url}")

        # Update job status to RUNNING

        job.status = CrawlJobStatus.RUNNING

        job.started_at = datetime.now(timezone.utc)
        job.pages_fetched = 0
        source.trained_at = None
        if source.last_crawl_at is None:
            source.last_crawl_at = job.started_at

        db.commit()

        

        # Keep existing documents for content comparison
        # We'll check for duplicate URLs and only update if content has changed
        existing_docs_count = db.query(Document).filter(Document.source_id == source_id).count()
        if existing_docs_count > 0:
            print(f"📚 Found {existing_docs_count} existing documents - will check for content changes before re-crawling")

        

        print(f"🕷️ Starting crawl for {source.base_url} (depth: {source.depth})")

        print(f"🔍 DEBUG: Source depth from database: {source.depth}")

        

        # Calculate reasonable max_pages based on depth if not set or too low
        # For depth N, we need at least enough pages to crawl through all levels
        # Formula: minimum pages = (max_links_per_page ^ depth) or at least 100 * depth
        configured_max_pages = source.max_pages if source.max_pages and source.max_pages > 0 else None
        if source.depth == 0:
            max_pages = max(1, configured_max_pages or 1)
            print(f"🔍 DEBUG: depth=0 single-page crawl, max_pages={max_pages}")
        elif not configured_max_pages or configured_max_pages < 10:
            # Calculate minimum pages needed based on depth
            # For depth 1: at least 10 pages, depth 2: at least 50, depth 3: at least 200, depth 4: at least 500
            min_pages_by_depth = {
                1: 10,
                2: 50,
                3: 200,
                4: 500,
                5: 2000,
            }
            # Use depth-based minimum or default to max_pages cap
            depth_based_min = min_pages_by_depth.get(
                source.depth, max(100 * source.depth, DEFAULT_CRAWL_SETTINGS["max_pages"])
            )
            # Use configured value if reasonable, otherwise use depth-based minimum
            max_pages = max(configured_max_pages or 0, depth_based_min)
            print(f"🔍 DEBUG: max_pages was {configured_max_pages}, adjusted to {max_pages} based on depth {source.depth}")
        else:
            max_pages = configured_max_pages

        # Copy scalars before closing session — ORM instances detach after db.close().
        crawl_start_url = source.base_url
        crawl_source_id = source.id
        crawl_job_id = job.id
        crawl_max_depth = source.depth
        crawl_max_runtime = (
            source.max_runtime_minutes or DEFAULT_CRAWL_SETTINGS["max_runtime_minutes"]
        )
        crawl_delay = source.delay_seconds or DEFAULT_CRAWL_SETTINGS["delay_seconds"]
        crawl_content_limit = get_crawl_content_length_limit()
        crawl_max_links = (
            source.max_links_per_page or DEFAULT_CRAWL_SETTINGS["max_links_per_page"]
        )
        crawl_headless = source.headless
        crawl_allowlist = source.allowlist
        crawl_denylist = source.denylist
        crawl_skip_header_footer = getattr(source, "skip_header_footer", True)
        crawl_rescope_root_links = getattr(source, "rescope_root_links", False)

        db.close()
        db = None

        documents_saved, total_urls_crawled, crawled_urls, crawl_diagnostics = await _run_scrapy_spider(
            start_url=crawl_start_url,
            source_id=crawl_source_id,
            job_id=crawl_job_id,
            max_depth=crawl_max_depth,
            max_pages=max_pages,
            max_runtime_minutes=crawl_max_runtime,
            delay_seconds=crawl_delay,
            content_length_limit=crawl_content_limit,
            max_links_per_page=crawl_max_links,
            headless_mode=crawl_headless,
            allowlist=crawl_allowlist,
            denylist=crawl_denylist,
            skip_header_footer=crawl_skip_header_footer,
            rescope_root_links=crawl_rescope_root_links,
        )

        finished_time = datetime.now(timezone.utc)

        db = SessionLocal()
        job = db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
        if not job or not source:
            print(f"❌ Job or source missing after crawl for job {job_id}")
            return

        job.status = CrawlJobStatus.INDEXING
        job.pages_fetched = documents_saved
        existing_errors = job.errors if isinstance(job.errors, list) else []
        existing_errors = [
            e for e in existing_errors
            if not (isinstance(e, dict) and e.get("type") == "crawl_diagnostics")
        ]
        existing_errors.append(crawl_diagnostics)
        job.errors = existing_errors
        source.last_crawl_at = finished_time
        source.documents_count = documents_saved
        db.commit()
        db.refresh(source)

        try:
            _auto_add_crawled_domains_to_allowed_list(source, crawled_urls, db)
        except Exception as e:
            print(f"⚠️ Warning: Failed to auto-add domains to allowed list: {e}")
            import traceback
            traceback.print_exc()
            try:
                db.rollback()
            except Exception:
                pass

        

        # Verify the stored value matches what we set

        print(f"✅ Crawl completed! Saved {documents_saved} documents from {total_urls_crawled} unique URLs")

        if source.last_crawl_at:

            # Check if the stored value matches what we set

            stored_tz = source.last_crawl_at.tzinfo

            stored_utc = source.last_crawl_at.astimezone(timezone.utc) if stored_tz else source.last_crawl_at.replace(tzinfo=timezone.utc)

            now_utc = datetime.now(timezone.utc)

            diff_seconds = (now_utc - stored_utc).total_seconds()

            print(f"📅 last_crawl_at set to: {finished_time.isoformat()}")

            print(f"📅 last_crawl_at stored in DB: {source.last_crawl_at.isoformat()} (tzinfo: {stored_tz})")

            print(f"📅 Current UTC time: {now_utc.isoformat()}")

            print(f"📅 Time difference: {diff_seconds:.0f} seconds ({diff_seconds/60:.1f} minutes)")

        

        if settings.enable_durable_jobs:
            _enqueue_crawl_ingest_batches(
                db, source_id, job_id, user_id=source.created_by_id
            )
        else:
            from .ingest_runtime import run_ingest_async

            indexing_error: Optional[str] = None
            ingest_result: dict = {"chunks": 0, "status": None}
            try:
                ingest_result = await run_ingest_async(
                    _direct_ingest_crawl_documents, crawl_source_id
                )
                if ingest_result["chunks"] > 0:
                    source.trained_at = datetime.now(timezone.utc)
                    print(
                        f"✅ Direct indexing completed for source {crawl_source_id} "
                        f"({ingest_result['chunks']} chunks)"
                    )
                else:
                    indexing_error = str(
                        ingest_result.get("status") or "Indexing produced no chunks"
                    )
                    print(
                        f"⚠️ Direct indexing skipped for source {crawl_source_id}: "
                        f"{indexing_error}"
                    )
            except Exception as e:
                indexing_error = str(e)
                print(f"⚠️ Warning: Direct indexing failed: {e}")

            _finalize_crawl_job_after_ingest(
                db,
                job,
                source,
                documents_saved=documents_saved,
                ingest_result=ingest_result,
                indexing_error=indexing_error,
            )

    except Exception as e:

        print(f"❌ Crawl failed: {str(e)}")

        fail_db = db if db is not None else SessionLocal()
        if db is not None:
            try:
                fail_db.rollback()
            except Exception:
                pass
        try:
            job_row = fail_db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
            if job_row:
                job_row.status = CrawlJobStatus.FAILED
                job_row.finished_at = datetime.now(timezone.utc)
                job_row.errors = [
                    {"error": str(e), "timestamp": datetime.now(timezone.utc).isoformat()}
                ]
                fail_db.commit()
                try:
                    src = fail_db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
                    if src:
                        create_notification(
                            db=fail_db,
                            user_id=src.created_by_id,
                            title="Crawl Job Failed",
                            message=f"Crawl job for {src.base_url} failed: {str(e)[:200]}",
                            type="error",
                            action_url="/crawl",
                        )
                        # Slot freed by failure — promote all eligible waiting crawls.
                        try:
                            from .concurrency_limits import promote_all_waiting_for_user
                            promote_all_waiting_for_user(fail_db, src.created_by_id)
                        except Exception as promote_err:
                            print(f"⚠️ Failed to promote waiting crawls after failure: {promote_err}")
                except Exception as notif_error:
                    print(f"⚠️ Failed to create notification: {notif_error}")
        except Exception as db_error:
            print(f"❌ Error updating job status: {db_error}")
        finally:
            if db is None and fail_db is not None:
                fail_db.close()

    finally:

        if db is not None:
            db.close()
        _clear_cancel_flag(str(source_id))


async def run_crawl(job_id: uuid.UUID, source_id: uuid.UUID) -> None:
    """Legacy shim — routes to run_crawl_fetch for new-style split execution."""
    await run_crawl_fetch(job_id, source_id)


def _enqueue_crawl_ingest_batches(
    db: Session,
    source_id: uuid.UUID,
    crawl_job_id: uuid.UUID,
    user_id: Optional[int] = None,
) -> None:
    from .job_queue import enqueue_job
    from ..models import BackgroundJobType

    source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
    if not source:
        return
    doc_ids = [
        str(d.id)
        for d in db.query(Document.id).filter(Document.source_id == source_id).all()
    ]
    if not doc_ids:
        job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
        if job:
            job.status = CrawlJobStatus.FAILED
            job.finished_at = datetime.now(timezone.utc)
            job.errors = [
                {
                    "error": "No documents saved during fetch",
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                }
            ]
            db.commit()
        return

    batch_size = int(settings.crawl_ingest_batch_size_jobs)
    if batch_size <= 0:
        batch_size = len(doc_ids)
    else:
        batch_size = max(1, batch_size)
    batches = [doc_ids[i : i + batch_size] for i in range(0, len(doc_ids), batch_size)]

    crawl_job = db.query(CrawlJob).filter(CrawlJob.id == crawl_job_id).first()
    if crawl_job:
        from .crawl_ingest_helpers import init_indexing_progress

        crawl_job.errors = init_indexing_progress(crawl_job.errors, len(batches))
        db.commit()

    project_id = source.project_id if source else None
    for idx, batch in enumerate(batches):
        is_last = idx == len(batches) - 1
        enqueue_job(
            db,
            job_type=BackgroundJobType.CRAWL_INGEST_BATCH.value,
            payload={
                "source_id": str(source_id),
                "crawl_job_id": str(crawl_job_id),
                "document_ids": batch,
                "batch_index": idx,
                "total_batches": len(batches),
                "is_last_batch": is_last,
                "user_id": user_id,
            },
            user_id=user_id,
            project_id=project_id,
            idempotency_key=f"crawl_ingest:{crawl_job_id}:batch{idx}",
        )


def _finalize_crawl_job_after_ingest(
    db: Session,
    job: CrawlJob,
    source: CrawlSource,
    *,
    documents_saved: int,
    ingest_result: dict,
    indexing_error: Optional[str],
) -> None:
    chunks_indexed = int(ingest_result.get("chunks", 0) or 0)
    job.finished_at = datetime.now(timezone.utc)
    existing_errors = job.errors if isinstance(job.errors, list) else []

    allow_empty = bool(getattr(source, "allow_empty_crawl", False))
    indexing_failed = bool(indexing_error)
    no_content = documents_saved == 0 and chunks_indexed == 0

    if indexing_failed:
        from ..services.llm_error_messages import format_embed_error_for_crawl

        job.status = CrawlJobStatus.FAILED
        friendly = format_embed_error_for_crawl(indexing_error or "Indexing failed")
        existing_errors.append(
            {
                "error": f"Indexing failed: {friendly}",
                "raw_error": str(indexing_error or "")[:500],
                "timestamp": job.finished_at.isoformat(),
            }
        )
        job.errors = existing_errors
    elif no_content and not allow_empty:
        job.status = CrawlJobStatus.FAILED
        existing_errors.append(
            {
                "error": "Crawl finished with no pages saved and no vectors indexed",
                "timestamp": job.finished_at.isoformat(),
            }
        )
        job.errors = existing_errors
    else:
        job.status = CrawlJobStatus.COMPLETED
    db.commit()

    if job.status == CrawlJobStatus.COMPLETED:
        try:
            create_notification(
                db=db,
                user_id=source.created_by_id,
                title="Crawl Job Completed",
                message=(
                    f"Successfully crawled and indexed {documents_saved} pages "
                    f"from {source.base_url}"
                ),
                type="success",
                action_url="/crawl",
            )
        except Exception as notif_error:
            print(f"⚠️ Failed to create notification: {notif_error}")
    elif job.status == CrawlJobStatus.FAILED:
        try:
            friendly = ""
            if isinstance(job.errors, list):
                for entry in reversed(job.errors):
                    if isinstance(entry, dict) and entry.get("error"):
                        err = str(entry["error"])
                        if err.startswith("Indexing failed:"):
                            friendly = err.replace("Indexing failed:", "", 1).strip()
                            break
            fail_msg = (
                f"Crawl for {source.base_url} failed during indexing: {friendly}"
                if friendly
                else (
                    f"Crawl for {source.base_url} did not complete successfully. "
                    f"Check job errors for details."
                )
            )
            create_notification(
                db=db,
                user_id=source.created_by_id,
                title="Crawl Job Failed",
                message=fail_msg,
                type="error",
                action_url="/crawl",
            )
        except Exception as notif_error:
            print(f"⚠️ Failed to create notification: {notif_error}")

    try:
        from .concurrency_limits import promote_all_waiting_for_user

        if source.created_by_id is not None:
            promote_all_waiting_for_user(db, source.created_by_id)
    except Exception as promote_err:
        print(f"⚠️ Failed to promote waiting crawls: {promote_err}")


async def _run_scrapy_spider(
    start_url: str,
    source_id,
    job_id,
    max_depth: int,
    max_pages: int = 2000,
    max_runtime_minutes: int = 120,
    delay_seconds: float = 0.5,
    content_length_limit: int = 10_000_000,
    max_links_per_page: int = 80,
    headless_mode=None,

                       allowlist: list = None, denylist: list = None,
                       skip_header_footer: bool = True,
                       rescope_root_links: bool = False) -> tuple[int, int]:

    """

    Run an optimized concurrent web crawler with async requests and batched database commits

    

    Uses aiohttp by default; ON/AUTO use Playwright Chromium when available.

    """

    import asyncio

    import aiohttp

    from bs4 import BeautifulSoup

    from urllib.parse import urljoin, urlparse

    import time

    import re

    from collections import deque

    from threading import Lock

    effective_headless = _coerce_crawl_headless_mode(headless_mode)
    _playwright_binding: dict = {"context": None, "sem": None}

    
    # Helper function to calculate content hash
    def calculate_content_hash(text_content: str) -> str:
        """Calculate SHA256 hash of text content for comparison"""
        if not text_content:
            return hashlib.sha256(b"").hexdigest()
        return hashlib.sha256(text_content.encode('utf-8')).hexdigest()
    
    def check_existing_document(url: str, sid: uuid.UUID) -> Optional[Document]:
        """Thread-safe: uses a dedicated short-lived session per call."""
        session = SessionLocal()
        try:
            return (
                session.query(Document)
                .filter(Document.url == url, Document.source_id == sid)
                .first()
            )
        except Exception as e:
            print(f"⚠️ Error checking existing document for {url}: {e}")
            return None
        finally:
            session.close()

    cancel_flag = _register_cancel_flag(str(source_id))

    documents_saved = 0
    max_tracked_urls = 500
    diagnostics = CrawlDiagnosticsCollector(max_tracked=max_tracked_urls)

    visited_urls = set()

    visited_lock = Lock()

    # Use deque for better performance

    urls_to_visit = deque([(start_url, 0)])  # (url, depth)

    pages_crawled = 0

    start_time = time.time()

    last_progress_time = [start_time]  # Track last progress time (use list for closure access)

    

    # Batch database operations - larger batches for better performance

    documents_batch = []

    batch_size = 100  # Increased from 50 to 100 for fewer DB commits

    batch_lock = Lock()

    

    print(f"🚀 Starting optimized concurrent crawler for {start_url}")

    print(f"⚡ Concurrency: 50 parallel requests, batch commits every {batch_size} documents")

    print(f"📏 Depth limit: {max_depth} levels, Max pages: {max_pages}")

    print(f"⏱️ Max runtime: {max_runtime_minutes}min (delays removed for speed)")

    hm_label = getattr(effective_headless, "value", str(effective_headless))
    print(f"🖥️ Headless mode: {hm_label} (Playwright for ON/AUTO when Chromium is installed)")

    

    # Async function to crawl a single URL

    async def crawl_url(session: aiohttp.ClientSession, url: str, depth: int) -> tuple:

        """Crawl a single URL and return discovered links"""

        nonlocal pages_crawled, documents_saved

        

        with visited_lock:

            if url in visited_urls:

                return ([], None)

            visited_urls.add(url)

            pages_crawled += 1

            # Update progress time when we actually crawl a page

            last_progress_time[0] = time.time()

        
        loop = asyncio.get_event_loop()
        max_retries = 3
        retry_delay = 1

        async def pull_via_aiohttp() -> Optional[str]:
            for attempt in range(max_retries):
                try:
                    async with session.get(
                        url, timeout=aiohttp.ClientTimeout(total=30), allow_redirects=True
                    ) as response:
                        if response.status >= 400:
                            if attempt < max_retries - 1:
                                await asyncio.sleep(retry_delay * (attempt + 1))
                                continue
                            print(f"⚠️ HTTP {response.status} for {url}")
                            diagnostics.record_failed(
                                url=url,
                                reason=f"http_{response.status}",
                                status_code=response.status,
                                attempt_count=max_retries,
                            )
                            return None
                        content_type = response.headers.get("Content-Type", "")
                        if "application/pdf" in content_type or url.lower().split("?")[0].endswith(".pdf"):
                            raw = await response.read()
                            try:
                                import io
                                import pypdf
                                reader = pypdf.PdfReader(io.BytesIO(raw))
                                text = "\n".join(page.extract_text() or "" for page in reader.pages)
                                text = normalize_pdf_extracted_text(text)
                                text = _sanitize_postgres_text(text)
                                return text if text.strip() else None
                            except Exception as pdf_err:
                                print(f"❌ PDF parse failed for {url}: {pdf_err}")
                                return None
                        return await response.text()
                except aiohttp.ClientConnectorCertificateError as e:
                    if attempt < max_retries - 1:
                        print(f"🔄 Retry {attempt + 1}/{max_retries} for {url} after SSL error: {e}")
                        await asyncio.sleep(retry_delay * (attempt + 1))
                        continue
                    print(f"❌ SSL certificate error for {url} after {max_retries} attempts: {e}")
                    diagnostics.record_failed(
                        url=url,
                        reason="ssl_certificate_verification_failed",
                        attempt_count=max_retries,
                    )
                    return None
                except (aiohttp.ClientConnectorError, aiohttp.ServerConnectionError, asyncio.TimeoutError) as e:
                    if attempt < max_retries - 1:
                        print(f"🔄 Retry {attempt + 1}/{max_retries} for {url} after connection error: {e}")
                        await asyncio.sleep(retry_delay * (attempt + 1))
                        continue
                    print(f"❌ Error crawling {url} after {max_retries} attempts: {e}")
                    diagnostics.record_failed(
                        url=url,
                        reason="connection_or_timeout_error",
                        attempt_count=max_retries,
                    )
                    return None
                except Exception as e:
                    print(f"❌ Error crawling {url}: {e}")
                    diagnostics.record_failed(url=url, reason=f"unexpected_error: {str(e)[:200]}")
                    return None
            return None

        async def pull_via_playwright() -> Optional[str]:
            ctx = _playwright_binding.get("context")
            sem = _playwright_binding.get("sem")
            if not ctx or not sem:
                return None
            async with sem:
                page = await ctx.new_page()
                try:
                    resp = await page.goto(
                        url,
                        wait_until="domcontentloaded",
                        timeout=settings.crawl_headless_navigation_timeout_ms,
                    )
                    if resp is not None and resp.status >= 400:
                        print(f"⚠️ Playwright HTTP {resp.status} for {url}")
                        return None
                    settle_s = settings.crawl_headless_auto_settle_ms / 1000.0
                    if settle_s > 0:
                        await asyncio.sleep(settle_s)
                    return await page.content()
                except Exception as e:
                    print(f"⚠️ Playwright navigation error for {url}: {e}")
                    return None
                finally:
                    await page.close()

        pw_ctx = _playwright_binding.get("context")
        pw_sem = _playwright_binding.get("sem")
        html: Optional[str] = None

        if effective_headless == CrawlHeadlessMode.ON and pw_ctx and pw_sem:
            html = await pull_via_playwright()
            if not html:
                html = await pull_via_aiohttp()
        elif effective_headless == CrawlHeadlessMode.ON:
            html = await pull_via_aiohttp()
        elif effective_headless == CrawlHeadlessMode.AUTO and pw_ctx and pw_sem:
            html = await pull_via_aiohttp()
            if html:
                text_len = await loop.run_in_executor(None, _quick_visible_text_length, html)
                if text_len < settings.crawl_headless_auto_min_text_chars:
                    pw_html = await pull_via_playwright()
                    if pw_html:
                        html = pw_html
            else:
                html = await pull_via_playwright()
        else:
            html = await pull_via_aiohttp()

        if not html:
            return ([], None)

        

        try:

            # Process the HTML we successfully fetched

            # Run CPU-intensive HTML parsing in executor to avoid blocking event loop

            

            def parse_html_content(
                html_content,
                page_url,
                page_depth,
                limit,
                max_links,
                skip_header_footer_local: bool,
                rescope_root_links_local: bool,
            ):

                """Parse HTML content - CPU-intensive operation runs in thread pool"""

                # PDFs are extracted as plain text by pull_via_aiohttp (pypdf). Do not
                # run BeautifulSoup — it treats plain text like HTML and truncation at
                # ``limit`` silently kept only ~10k chars even when the DB limit was raised.
                if (
                    page_url.lower().split("?")[0].endswith(".pdf")
                    and html_content.lstrip()
                    and not html_content.lstrip().startswith("<")
                ):
                    text_content = normalize_pdf_extracted_text(
                        " ".join(html_content.split())
                    )
                    title_text = text_content[:240].strip() or "No Title"
                    if len(text_content) > limit:
                        truncated = text_content[:limit]
                        last_period = truncated.rfind(".")
                        if last_period > limit * 0.8:
                            text_content = truncated[:last_period + 1] + "..."
                        else:
                            text_content = truncated + "..."
                    return title_text, text_content, [], page_url, ''

                # Parse HTML

                soup = BeautifulSoup(html_content, 'html.parser')

                

                # Extract title

                title = soup.find('title')

                title_text = title.get_text().strip() if title else "No Title"

                # Extract og:image / twitter:image for source card thumbnails
                _og_tag = soup.find('meta', property='og:image')
                og_image = (_og_tag.get('content') or '').strip() if _og_tag else ''
                if not og_image:
                    _tw_tag = soup.find('meta', attrs={'name': 'twitter:image'})
                    og_image = (_tw_tag.get('content') or '').strip() if _tw_tag else ''
                if og_image:
                    # Resolve relative / protocol-relative OG URLs against the page.
                    og_image = _stdlib_urljoin(page_url, og_image)

                

                # Smart content extraction

                main_content = ""

                content_selectors = [

                    'main', 'article', '.content', '.main-content', '.post-content',

                    '.entry-content', '.page-content', '#content', '#main'

                ]

                

                for selector in content_selectors:

                    content_elem = soup.select_one(selector)

                    if content_elem:
                        if skip_header_footer_local:
                            for unwanted in content_elem(["script", "style", "nav", "footer", "header", "aside"]):
                                unwanted.decompose()

                        enrich_contact_links(content_elem)
                        main_content = content_elem.get_text()

                        break

                

                if not main_content:

                    body = soup.find('body')

                    if body:
                        if skip_header_footer_local:
                            for unwanted in body(["script", "style", "nav", "footer", "header", "aside"]):
                                unwanted.decompose()

                        enrich_contact_links(body)
                        main_content = body.get_text()

                    else:

                        enrich_contact_links(soup)
                        main_content = soup.get_text()

                

                # Clean text

                text_content = ' '.join(main_content.split())

                

                # Truncate if needed

                if len(text_content) > limit:

                    truncated = text_content[:limit]

                    last_period = truncated.rfind('.')

                    if last_period > limit * 0.8:

                        text_content = truncated[:last_period + 1] + "..."

                    else:

                        text_content = truncated + "..."

                

                # Extract links
                #
                # When skip_header_footer is enabled, avoid discovering links from global
                # navigation blocks (header/footer/nav/aside). This prevents following menu
                # links while still allowing content links.

                link_sources = []

                link_sources.extend(soup.find_all('a', href=True))

                link_sources.extend(soup.find_all('link', href=True))

                link_sources.extend(soup.find_all('area', href=True))

                

                def _is_in_excluded_section(tag) -> bool:
                    if not skip_header_footer_local:
                        return False
                    try:
                        # Only exclude global header/footer links from discovery.
                        # Keep nav/aside links (often contain real content navigation).
                        return tag.find_parent(["header", "footer"]) is not None
                    except Exception:
                        return False

                link_base_url = _extract_document_base_url(soup, page_url)

                parsed_links = []
                links_added = 0

                # Important: apply max_links AFTER filtering, otherwise header/footer
                # links can fill the first max_links slots and starve real content links.
                for link in link_sources:
                    if links_added >= max_links:
                        break

                    href = link.get('href', '')

                    if not href:

                        continue

                    if _is_in_excluded_section(link):
                        continue

                    absolute_url = _safe_urljoin(
                        link_base_url,
                        href,
                        start_url,
                        rescope_root_links=rescope_root_links_local,
                    )

                    parsed_links.append((absolute_url, page_depth + 1))
                    links_added += 1

                

                canonical_url = extract_canonical_page_url(soup, page_url)

                return title_text, text_content, parsed_links, canonical_url, og_image

            

            # Run HTML parsing in thread pool to avoid blocking event loop

            title_text, text_content, parsed_links, canonical_url, og_image = await loop.run_in_executor(

                None,
                parse_html_content,
                html,
                url,
                depth,
                content_length_limit,
                max_links_per_page,
                bool(skip_header_footer),
                bool(rescope_root_links),

            )

            stored_url = canonical_url or url

            title_text = _sanitize_postgres_text(title_text)
            text_content = _sanitize_postgres_text(text_content)

            # Calculate content hash for comparison
            new_content_hash = calculate_content_hash(text_content)
            
            # Check if document exists and compare content hash
            existing_doc = await loop.run_in_executor(None, check_existing_document, stored_url, source_id)
            if not existing_doc and stored_url != url:
                existing_doc = await loop.run_in_executor(None, check_existing_document, url, source_id)
            
            # Filter links (single pass — records referrers for skipped/enqueued URLs)
            links_found = []
            links_filtered = 0
            for link_url, link_depth in parsed_links:
                diagnostics.note_discovery(link_url, url)
                with visited_lock:
                    url_not_visited = link_url not in visited_urls
                is_valid, skip_reason = _validate_crawl_url(link_url, start_url, allowlist, denylist)
                if is_valid and url_not_visited:
                    links_found.append((link_url, link_depth))
                elif not is_valid:
                    links_filtered += 1
                    diagnostics.record_skipped(url=link_url, reason=skip_reason)
            
            # Check if content has changed
            if existing_doc:
                # Get existing content hash from meta_data
                existing_hash = existing_doc.meta_data.get('content_hash') if existing_doc.meta_data else None
                
                # If content hash matches, skip saving this document
                if existing_hash == new_content_hash:
                    print(f"⏭️ Skipped: {url} (Depth: {depth}, Page: {pages_crawled}) - No new content detected")
                    diagnostics.record_skipped(url=url, reason="no_content_change")
                    return (links_found, None)  # Return None for document_data to skip saving
                else:
                    # Content has changed, update the document
                    print(f"🔄 Updated: {url} (Depth: {depth}, Page: {pages_crawled}) - Content has changed")
                    document_id = existing_doc.id
            else:
                # New document
                document_id = uuid.uuid4()
                if links_filtered > 0:
                    print(f"✅ Crawled: {url} (Depth: {depth}, Page: {pages_crawled}) - Found {len(parsed_links)} total links, {len(links_found)} valid, {links_filtered} filtered")
                else:
                    print(f"✅ Crawled: {url} (Depth: {depth}, Page: {pages_crawled}) - Found {len(links_found)} valid links")

            # Prepare document for batch save (with content hash)

            document_data = {

                'id': document_id,

                'source_id': source_id,

                'url': stored_url,

                'title': title_text,

                'text_content': text_content,

                'meta_data': {
                    'crawled_at': datetime.now(timezone.utc).isoformat(),
                    'content_hash': new_content_hash,
                    'og_image': og_image or '',
                },

                'indexed_at': datetime.now(timezone.utc)

            }

            return (links_found, document_data)

                

        except Exception as e:

            print(f"❌ Error crawling {url}: {e}")
            diagnostics.record_failed(url=url, reason=f"parse_or_processing_error: {str(e)[:200]}")
            return ([], None)

    

    # Batch save documents to database (async to avoid blocking)

    async def save_documents_batch(docs: list):

        """Save a batch of documents to the database with verification - runs in executor to avoid blocking"""

        nonlocal documents_saved, pages_crawled

        if not docs:

            return

        

        def _save_batch_sync(docs_to_save):

            """Synchronous database save operation - runs in thread pool"""

            local_session = SessionLocal()
            try:

                saved_count = 0
                updated_count = 0
                new_count = 0

                for doc_data in docs_to_save:
                    doc_data['url'] = _sanitize_postgres_text(doc_data.get('url'))
                    doc_data['title'] = _sanitize_postgres_text(doc_data.get('title'))
                    doc_data['text_content'] = _sanitize_postgres_text(doc_data.get('text_content'))

                    # Check if document already exists (by ID - which we set from existing doc if updating)
                    existing_doc = local_session.query(Document).filter(Document.id == doc_data['id']).first()
                    
                    if existing_doc:
                        # Update existing document
                        existing_doc.title = doc_data['title']
                        existing_doc.text_content = doc_data['text_content']
                        existing_doc.meta_data = doc_data['meta_data']
                        existing_doc.indexed_at = doc_data['indexed_at']
                        updated_count += 1
                    else:
                        # Create new document
                        document = Document(**doc_data)
                        local_session.add(document)
                        new_count += 1
                    
                    saved_count += 1

                try:
                    local_session.commit()
                except IntegrityError as e:
                    local_session.rollback()
                    print(f"⚠️ Batch commit failed due to integrity error: {e}. Retrying per-document.")
                    # Retry per-document to skip duplicates
                    saved_count = 0
                    updated_count = 0
                    new_count = 0
                    for doc_data in docs_to_save:
                        try:
                            existing_doc = local_session.query(Document).filter(Document.id == doc_data['id']).first()
                            if existing_doc:
                                existing_doc.title = doc_data['title']
                                existing_doc.text_content = doc_data['text_content']
                                existing_doc.meta_data = doc_data['meta_data']
                                existing_doc.indexed_at = doc_data['indexed_at']
                                updated_count += 1
                            else:
                                local_session.add(Document(**doc_data))
                                new_count += 1
                            local_session.commit()
                            saved_count += 1
                        except IntegrityError:
                            local_session.rollback()
                            print(f"⚠️ Skipping duplicate document ID: {doc_data.get('id')}")

                if updated_count > 0:
                    print(f"💾 Batch: {new_count} new, {updated_count} updated (Total: {saved_count})")
                else:
                    print(f"💾 Batch: {saved_count} new documents")

                return saved_count

            except Exception as e:

                local_session.rollback()

                print(f"❌ Error saving batch: {e}")

                raise
            finally:
                local_session.close()

        

        try:

            # Run database save in executor to avoid blocking event loop

            loop = asyncio.get_event_loop()

            saved_count = await loop.run_in_executor(None, _save_batch_sync, docs)

            

            documents_saved += saved_count

            print(f"💾 Saved batch of {saved_count} documents (Total: {documents_saved})")

            

            # Update job progress in database (also in executor)

            def _update_progress():

                try:

                    from ..models import CrawlJob
                    local_session = SessionLocal()
                    try:
                        job = local_session.query(CrawlJob).filter(CrawlJob.id == job_id).first()

                        if job:

                            job.pages_fetched = pages_crawled


                            local_session.commit()
                    finally:
                        local_session.close()

                except Exception as e:

                    print(f"⚠️ Warning: Failed to update job progress: {e}")

            

            await loop.run_in_executor(None, _update_progress)

                

        except Exception as e:

            print(f"❌ Error in batch save: {e}")

            raise  # Re-raise to handle in caller

    

    # Main async crawling loop

    async def run_concurrent_crawl():

        nonlocal documents_saved, pages_crawled, documents_batch, urls_to_visit, last_progress_time, visited_urls

        

        # Optimized connector: higher limits for faster crawling

        connector = aiohttp.TCPConnector(

            limit=50,  # Total connection pool

            limit_per_host=5,  # Per-host connections (avoid triggering rate limits)

            ttl_dns_cache=300,  # Cache DNS for 5 minutes

            force_close=False,  # Reuse connections

            enable_cleanup_closed=True,

            ssl=_crawl_aiohttp_ssl_connector_arg(),

        )

        timeout = aiohttp.ClientTimeout(total=30, connect=10)

        ua_headers = {"User-Agent": settings.user_agent}

        async def crawl_with_session(session: aiohttp.ClientSession):

            nonlocal documents_saved, pages_crawled, documents_batch, urls_to_visit, last_progress_time, visited_urls

            

            concurrent_limit = 8  # Conservative limit to avoid rate limiting per host

            active_tasks = set()

            

            iteration_count = 0

            last_progress_time = [start_time]  # Use list to allow modification in nested function
            last_db_update_time = [start_time]  # Track when we last updated the database
            last_db_update_pages = [0]  # Track pages count at last DB update

            

            while urls_to_visit or active_tasks:

                iteration_count += 1

                if cancel_flag.is_set():
                    logger.info("Crawl cancelled (in-process signal) job=%s source=%s", job_id, source_id)
                    break

                # Cross-process cancel: every 10 iterations re-read CrawlJob status from DB.
                # Catches cancellations triggered by the API process (separate worker process).
                if iteration_count % 10 == 0:
                    try:
                        _db = SessionLocal()
                        try:
                            _job = _db.query(CrawlJob).filter(CrawlJob.id == job_id).first()
                            if _job and _job.status in (CrawlJobStatus.CANCELLED, CrawlJobStatus.FAILED):
                                logger.info(
                                    "Crawl stopped via DB status=%s job=%s source=%s",
                                    _job.status.value, job_id, source_id,
                                )
                                break
                        finally:
                            _db.close()
                    except Exception as _db_exc:
                        logger.debug("Crawl DB cancel check failed (continuing): %s", _db_exc)

                elapsed = time.time() - start_time

                if elapsed > max_runtime_minutes * 60:

                    print(f"🛑 Reached maximum runtime ({max_runtime_minutes} minutes)")

                    break

                

                # Safety check: if no progress for 5 minutes, break

                if time.time() - last_progress_time[0] > 300:  # 5 minutes

                    print(f"⚠️ No progress for 5 minutes, stopping crawl")

                    print(f"   Queue size: {len(urls_to_visit)}, Active tasks: {len(active_tasks)}, Pages crawled: {pages_crawled}")

                    break

                

                # Update progress more frequently: every 10 pages OR every 3 seconds, whichever comes first
                should_update_db = False
                pages_since_update = pages_crawled - last_db_update_pages[0]
                time_since_update = time.time() - last_db_update_time[0]
                
                if pages_since_update >= 10 or time_since_update >= 3.0:
                    should_update_db = True
                
                # Log progress every 100 iterations

                if iteration_count % 100 == 0:

                    total_urls_crawled = len(visited_urls)

                    print(f"📊 Progress: {pages_crawled} pages, {total_urls_crawled} unique URLs crawled, {len(urls_to_visit)} queued, {len(active_tasks)} active, {elapsed:.1f}s elapsed")

                    last_progress_time[0] = time.time()

                    

                # Update job progress in database more frequently (every 10 pages or 3 seconds)

                if should_update_db:
                    try:
                        progress_session = SessionLocal()
                        try:
                            from ..models import CrawlJob

                            job_row = (
                                progress_session.query(CrawlJob)
                                .filter(CrawlJob.id == job_id)
                                .first()
                            )
                            if job_row:
                                job_row.pages_fetched = pages_crawled
                                progress_session.commit()
                                last_db_update_time[0] = time.time()
                                last_db_update_pages[0] = pages_crawled
                        finally:
                            progress_session.close()
                    except Exception as e:
                        print(f"⚠️ Warning: Failed to update job progress: {e}")

                

                # Skip URL filtering on every iteration - filter only when needed

                # URLs are already filtered when added to queue

                if not urls_to_visit and not active_tasks:

                    break

                

                # Start new tasks up to concurrent limit

                while len(active_tasks) < concurrent_limit and urls_to_visit:

                    current_url, current_depth = urls_to_visit.popleft()

                    

                    if current_depth > max_depth:
                        diagnostics.record_skipped(url=current_url, reason="depth_limit_exceeded")
                        continue

                    

                    task = asyncio.create_task(crawl_url(session, current_url, current_depth))

                    active_tasks.add(task)

                

                # Wait for tasks to complete - process multiple at once for better throughput

                if active_tasks:

                    # Wait for up to 5 tasks or all if less than 5

                    wait_count = min(5, len(active_tasks))

                    done, pending = await asyncio.wait(active_tasks, return_when=asyncio.FIRST_COMPLETED)

                    active_tasks = pending

                    

                    # Process all completed tasks in batch

                    for task in done:

                        try:

                            links, doc_data = await task

                            

                            # Add document to batch

                            if doc_data:

                                with batch_lock:

                                    documents_batch.append(doc_data)

                                    

                                    # Commit batch if full

                                    if len(documents_batch) >= batch_size:

                                        batch_to_save = documents_batch[:batch_size]

                                        documents_batch = documents_batch[batch_size:]

                                        # Create task for async save (fire and forget to avoid blocking)

                                        asyncio.create_task(save_documents_batch(batch_to_save))

                            

                            # Add discovered links (only if not already visited) - batch check for performance

                            new_urls = []

                            with visited_lock:

                                for link_url, link_depth in links:

                                    if link_depth <= max_depth and link_url not in visited_urls:

                                        new_urls.append((link_url, link_depth))

                                if new_urls:
                                    urls_to_visit.extend(new_urls)
                                    print(f"📝 Added {len(new_urls)} new URLs to queue (Total in queue: {len(urls_to_visit)})")

                            

                            # Note: Removed per-task delay - delay is handled at connection level via connector limits

                        except Exception as e:

                            print(f"❌ Task error: {e}")

            

            # Cancel any tasks still running so they don't use the closed session
            for t in active_tasks:
                t.cancel()
            if active_tasks:
                await asyncio.gather(*active_tasks, return_exceptions=True)

            # Save remaining documents

            if documents_batch:

                await save_documents_batch(documents_batch)

        want_pw = effective_headless in (CrawlHeadlessMode.ON, CrawlHeadlessMode.AUTO)

        async def http_only_run():
            _playwright_binding["context"] = None
            _playwright_binding["sem"] = None
            async with aiohttp.ClientSession(
                connector=connector,
                timeout=timeout,
                headers=ua_headers,
                raise_for_status=False,
            ) as session:
                await crawl_with_session(session)

        if not want_pw:
            await http_only_run()
            return

        try:
            from playwright.async_api import async_playwright
        except ImportError:
            print(
                "⚠️ Playwright not installed — HTTP-only crawl. "
                "Install: pip install playwright && playwright install chromium"
            )
            await http_only_run()
            return

        browser = None
        pw_context = None
        try:
            async with async_playwright() as p:
                try:
                    browser = await p.chromium.launch(headless=True)
                except Exception as e:
                    print(
                        f"⚠️ Could not launch Chromium ({e}). "
                        "Run: playwright install chromium — using HTTP-only crawl."
                    )
                    await http_only_run()
                    return
                pw_context = await browser.new_context(
                    user_agent=settings.user_agent,
                    viewport={"width": 1280, "height": 720},
                )
                _playwright_binding["context"] = pw_context
                _playwright_binding["sem"] = asyncio.Semaphore(settings.crawl_headless_max_parallel)
                try:
                    async with aiohttp.ClientSession(
                        connector=connector,
                        timeout=timeout,
                        headers=ua_headers,
                        raise_for_status=False,
                    ) as session:
                        await crawl_with_session(session)
                finally:
                    _playwright_binding["context"] = None
                    _playwright_binding["sem"] = None
                    if pw_context:
                        await pw_context.close()
                    if browser:
                        await browser.close()
        except Exception as e:
            print(f"⚠️ Playwright error ({e}); falling back to HTTP-only crawl.")
            _playwright_binding["context"] = None
            _playwright_binding["sem"] = None
            await http_only_run()

    

    # Run the async crawler (we're already in an async context from FastAPI)

    await run_concurrent_crawl()

    

    runtime_minutes = (time.time() - start_time) / 60

    # Calculate total unique URLs crawled

    total_urls_crawled = len(visited_urls)

    print(f"✅ Optimized crawl completed!")

    print(f"📊 Results: {documents_saved} documents saved from {pages_crawled} pages in {runtime_minutes:.1f} minutes")

    print(f"🔗 Total unique URLs crawled: {total_urls_crawled}")

    print(f"⚡ Speed: {pages_crawled / runtime_minutes:.1f} pages/minute")

    # Return visited_urls so we can extract all unique domains
    crawled_urls_list = [{"url": u} for u in list(visited_urls)[:max_tracked_urls]]
    skipped_urls, failed_urls = diagnostics.finalize()

    crawl_diagnostics = {
        "type": "crawl_diagnostics",
        "failed_count": len(failed_urls),
        "skipped_count": len(skipped_urls),
        "crawled_urls_total": total_urls_crawled,
        "failed_urls": failed_urls,
        "skipped_urls": skipped_urls,
        "crawled_urls": crawled_urls_list,
    }

    return documents_saved, total_urls_crawled, visited_urls, crawl_diagnostics



DEFAULT_BLOCKED_EXTERNAL_DOMAINS = {
    "instagram.com",
    "youtube.com",
    "youtu.be",
    "facebook.com",
    "x.com",
    "twitter.com",
    "linkedin.com",
    "tiktok.com",
    "pinterest.com",
    "snapchat.com",
    "whatsapp.com",
    "t.me",
}


def _normalize_hostname(url: str) -> str:
    try:
        hostname = (urlparse(url).hostname or "").lower().strip()
        if hostname.startswith("www."):
            hostname = hostname[4:]
        return hostname
    except Exception:
        return ""


def _domain_matches(hostname: str, candidate: str) -> bool:
    candidate = candidate.lower().strip()
    if not candidate:
        return False
    if candidate.startswith("www."):
        candidate = candidate[4:]
    return hostname == candidate or hostname.endswith(f".{candidate}")


def _path_and_query(url: str) -> str:
    try:
        parsed = urlparse(url)
        path = parsed.path or "/"
        query = f"?{parsed.query}" if parsed.query else ""
        return f"{path}{query}"
    except Exception:
        return ""


def _matches_pattern(url: str, pattern: str) -> bool:
    if not pattern or not isinstance(pattern, str):
        return False

    cleaned = pattern.strip()
    if not cleaned or cleaned.lower() == "string":
        return False

    wildcard_regex = "^" + re.escape(cleaned).replace(r"\*", ".*") + "$"
    try:
        if re.match(wildcard_regex, url, re.IGNORECASE):
            return True
        if re.match(wildcard_regex, _path_and_query(url), re.IGNORECASE):
            return True
    except re.error:
        pass

    return cleaned.lower() in url.lower()


_BINARY_EXTENSIONS = {
    ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico", ".bmp", ".tiff",
    ".zip", ".gz", ".tar", ".rar", ".7z",
    ".mp4", ".mp3", ".avi", ".mov", ".wmv", ".webm", ".ogg", ".wav",
    ".woff", ".woff2", ".ttf", ".eot", ".otf",
    ".css", ".js", ".map",
    ".exe", ".dmg", ".pkg", ".deb", ".rpm",
    ".xls", ".xlsx", ".ppt", ".pptx",
}


def _validate_crawl_url(url: str, base_url: str, allowlist: list = None, denylist: list = None) -> tuple[bool, str]:
    """
    Strict URL validation for crawling.
    Order:
    1) scheme
    2) binary/non-text extension
    3) global blocked domains
    4) same-domain policy
    5) denylist
    6) allowlist (if configured)
    """
    if not url.startswith(("http://", "https://")):
        return False, "invalid_scheme"

    from urllib.parse import urlparse
    path = urlparse(url).path.lower().split("?")[0]
    if any(path.endswith(ext) for ext in _BINARY_EXTENSIONS):
        return False, "binary_extension"

    url_host = _normalize_hostname(url)
    base_host = _normalize_hostname(base_url)
    if not url_host or not base_host:
        return False, "invalid_hostname"

    for blocked in DEFAULT_BLOCKED_EXTERNAL_DOMAINS:
        if _domain_matches(url_host, blocked):
            return False, "blocked_external_domain"

    if not _domain_matches(url_host, base_host):
        return False, "external_domain"

    if denylist:
        for pattern in denylist:
            if _matches_pattern(url, pattern):
                return False, "denylist_match"

    effective_allowlist = [
        p for p in (allowlist or [])
        if isinstance(p, str) and p.strip() and p.strip().lower() != "string"
    ]
    if effective_allowlist:
        if not any(_matches_pattern(url, pattern) for pattern in effective_allowlist):
            return False, "allowlist_miss"

    return True, "allowed"


def _is_smart_valid_url(url: str, base_url: str, allowlist: list = None, denylist: list = None) -> bool:
    """Intelligent URL validation for autonomous crawling."""
    is_valid, _ = _validate_crawl_url(url, base_url, allowlist, denylist)
    return is_valid



def _is_valid_url(url: str, base_url: str) -> bool:

    """Legacy function for backward compatibility"""

    return _is_smart_valid_url(url, base_url)



def detect_pages(
    start_url: str,
    max_depth: int = 3,
    max_pages: int = 1000,
    *,
    rescope_root_links: bool = False,
) -> dict:

    """

    Detect and count all crawlable pages without actually crawling their content.

    Returns a preview of what pages would be discovered during a full crawl.

    """

    import requests

    from bs4 import BeautifulSoup

    from urllib.parse import urljoin, urlparse

    import time

    import re

    

    detected_urls = set()

    # Track URLs with their depth level for detection too

    urls_to_scan = [(start_url, 0)]  # (url, depth)

    pages_scanned = 0

    start_time = time.time()

    

    # Detection parameters (lighter than full crawl)

    max_detection_pages = 1000  # Fixed limit for detection (not using max_pages parameter)

    max_detection_time = 5 * 60  # 5 minutes max for detection

    delay_seconds = 0.1  # Very fast detection

    

    print(f"🔍 Starting page detection for {start_url}")

    print(f"📊 Max depth: {max_depth}, Max pages: {max_detection_pages}")

    

    while urls_to_scan and pages_scanned < max_detection_pages:

        # Check time limit

        if time.time() - start_time > max_detection_time:

            print(f"⏰ Detection time limit reached ({max_detection_time/60:.1f} minutes)")

            break

            

        # Get URL and its depth

        current_url, current_depth = urls_to_scan.pop(0)

        

        # Check depth limit for detection

        if current_depth > max_depth:

            print(f"🛑 Reached maximum depth ({max_depth}), skipping {current_url}")

            continue

        

        if current_url in detected_urls:

            continue

            

        detected_urls.add(current_url)

        pages_scanned += 1

        

        print(f"🔍 Scanning: {current_url} (Depth: {current_depth}, Page: {pages_scanned})")

        

        try:

            # Quick fetch with short timeout

            response = requests.get(current_url, timeout=10, headers={

                'User-Agent': 'RAGSuite-Crawler/1.0'

            })

            response.raise_for_status()

            

            # Parse HTML quickly

            soup = BeautifulSoup(response.content, 'html.parser')

            

            # Extract title for preview

            title = soup.find('title')

            title_text = title.get_text().strip() if title else "No Title"

            

            # Find all links (same logic as full crawler)

            links_found = 0

            max_links_per_page = 50  # Reduced for detection

            

            # Find all possible link sources

            link_sources = []

            link_sources.extend(soup.find_all('a', href=True))

            link_sources.extend(soup.find_all('link', href=True))

            link_sources.extend(soup.find_all('area', href=True))

            link_base_url = _extract_document_base_url(soup, current_url)

            # Process discovered links

            for link in link_sources:

                if links_found >= max_links_per_page:

                    break

                    

                href = link.get('href', '')

                if not href:

                    continue

                    

                absolute_url = _safe_urljoin(
                    link_base_url,
                    href,
                    start_url,
                    rescope_root_links=rescope_root_links,
                )

                # Smart URL validation

                is_valid, _ = _validate_crawl_url(absolute_url, start_url)
                if (is_valid and
                    absolute_url not in detected_urls and
                    not any(url == absolute_url for url, _ in urls_to_scan)):

                    

                    # Add new URL with depth + 1

                    urls_to_scan.append((absolute_url, current_depth + 1))

                    links_found += 1

                        

        except Exception as e:

            print(f"❌ Error scanning {current_url}: {e}")

            continue

        

        # Very short delay for detection

        time.sleep(delay_seconds)

    

    detection_time = time.time() - start_time

    

    # Calculate estimated crawl time and content

    estimated_crawl_time = len(detected_urls) * 0.5  # 0.5 seconds per page

    estimated_content_size = len(detected_urls) * 5000  # ~5KB per page average

    

    result = {

        "total_pages_detected": len(detected_urls),

        "pages_scanned": pages_scanned,

        "detection_time_seconds": round(detection_time, 2),

        "estimated_crawl_time_minutes": round(estimated_crawl_time / 60, 1),

        "estimated_content_size_mb": round(estimated_content_size / (1024 * 1024), 2),

        "sample_urls": list(detected_urls)[:10],  # First 10 URLs as sample

        "base_url": start_url,

        "max_depth": max_depth,

        "detection_limits": {

            "max_pages_scanned": max_detection_pages,

            "max_detection_time_minutes": max_detection_time / 60

        }

    }

    

    print(f"✅ Page detection completed!")

    print(f"📊 Found {len(detected_urls)} crawlable pages in {detection_time:.1f} seconds")

    print(f"⏱️ Estimated crawl time: {estimated_crawl_time/60:.1f} minutes")

    print(f"🔍 Detection limits: max_pages={max_detection_pages}, max_time={max_detection_time/60:.1f}min")

    print(f"📈 Pages scanned: {pages_scanned}, URLs detected: {len(detected_urls)}")

    

    return result



def _export_crawl_to_csv(source_id: uuid.UUID, db: Session):

    """

    Export all documents from a crawl source to CSV file in data folder.

    CSV format matches what RAG expects: url, title, text_content (as meaningful_content)

    """

    # Query all documents for this source

    documents = db.query(Document).filter(Document.source_id == source_id).all()

    

    if not documents:

        print(f"⚠️ No documents to export for source {source_id}")

        return

    

    # Prepare data for CSV export

    data_rows = []

    for doc in documents:

        data_rows.append({

            'url': doc.url,

            'title': doc.title or '',

            'meaningful_content': doc.text_content or '',

            'keywords': doc.meta_data.get('keywords', '') if doc.meta_data else '',

            'crawled_at': doc.meta_data.get('crawled_at', '') if doc.meta_data else '',

            'indexed_at': doc.indexed_at.isoformat() if doc.indexed_at else ''

        })

    

    # Create data folder if it doesn't exist

    data_folder = Path("data")

    data_folder.mkdir(exist_ok=True)

    

    # Generate CSV filename with timestamp

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")

    csv_filename = f"crawl_export_{source_id}_{timestamp}.csv"

    csv_path = data_folder / csv_filename

    

    # Export to CSV

    df = pd.DataFrame(data_rows)

    df.to_csv(csv_path, index=False, encoding='utf-8')

    

    print(f"📄 Exported {len(data_rows)} documents to {csv_path}")


def _write_prepared_ingest_in_batches(
    texts: list,
    chunk_metadata: list,
    ingest_kwargs: dict,
) -> Dict[str, object]:
    """Write prepared crawl chunks in smaller batches to avoid oversized embed/index requests."""
    import time

    from ..settings import settings
    from .rag.singleton import locked_write_prepared_ingest

    batch_size = int(settings.crawl_ingest_batch_size or 0)
    pause_ms = int(settings.ingest_batch_pause_ms or 0)

    if not texts:
        return {"status": "No text extracted", "chunks": 0}

    if batch_size <= 0 or batch_size >= len(texts):
        return locked_write_prepared_ingest(
            texts=texts,
            chunk_metadata=chunk_metadata,
            **ingest_kwargs,
        )

    total_chunks = 0
    last_collection = ""
    for start in range(0, len(texts), batch_size):
        end = start + batch_size
        result = locked_write_prepared_ingest(
            texts=texts[start:end],
            chunk_metadata=chunk_metadata[start:end],
            **ingest_kwargs,
        )
        total_chunks += int(result.get("chunks", 0) or 0)
        last_collection = result.get("collection", last_collection) or last_collection
        if pause_ms > 0 and end < len(texts):
            time.sleep(pause_ms / 1000.0)

    if total_chunks <= 0:
        return {
            "status": "No chunks indexed",
            "chunks": 0,
            "collection": last_collection,
        }
    return {
        "status": "Indexed",
        "chunks": total_chunks,
        "collection": last_collection,
    }


def _direct_ingest_crawl_documents(source_id: uuid.UUID) -> Dict[str, object]:
    """
    Ingest crawled documents directly into vector DB without intermediary CSV/scheduler.

    Uses its own DB session so this can run safely on the ingest thread pool.
    """
    db = SessionLocal()
    try:
        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
        if not source:
            return {"status": "Crawl source not found", "chunks": 0}

        documents = db.query(Document).filter(Document.source_id == source.id).all()
        if not documents:
            return {"status": "No crawled documents found", "chunks": 0}

        return _ingest_crawl_documents_for_source(
            db,
            source,
            documents,
        )
    finally:
        db.close()


def _ingest_crawl_documents_for_source(
    db: Session,
    source: CrawlSource,
    documents: list,
    *,
    embedding_provider: Optional[str] = None,
    embedding_model: Optional[str] = None,
    embedding_api_key: Optional[str] = None,
    project_id: Optional[str] = None,
) -> Dict[str, object]:
    """
    Embed crawl pages into the source's configured ingest collection(s).

    Honors per-source ``ingest_embedding_target`` when no explicit provider/model/api_key
    triple is passed (reindex path). Legacy sources (NULL target) use
    ``EMBEDDING_PREFERRED_SOURCE`` via ``resolve_ingest_for_project``.
    """
    from .rag.embedding_resolver import IngestEmbeddingTarget, resolve_crawl_ingest_targets
    from .rag.utils_rag import chunks_for_crawled_document

    texts: list = []
    chunk_metadata: list = []
    for doc in documents:
        text_content = (doc.text_content or "").strip()
        if not text_content:
            continue
        doc_chunks = chunks_for_crawled_document(doc.url, text_content)
        if not doc_chunks:
            continue
        crawled_at = (doc.meta_data or {}).get("crawled_at")
        og_image = (doc.meta_data or {}).get("og_image", "")
        for chunk_idx, chunk in enumerate(doc_chunks):
            texts.append(chunk)
            chunk_metadata.append(
                {
                    "url": doc.url,
                    "title": doc.title or "",
                    "source_type": "crawl",
                    "crawled_at": crawled_at,
                    "og_image": og_image,
                    "chunk_index": chunk_idx,
                }
            )

    if not texts:
        return {"status": "No text extracted", "chunks": 0}

    explicit_embedding = (
        embedding_provider is not None
        or embedding_model is not None
        or embedding_api_key is not None
    )
    if not explicit_embedding:
        from .crawl_source_embedding import purge_stale_crawl_source_embedding_collections

        purge_stale_crawl_source_embedding_collections(db, source)

    if explicit_embedding:
        targets = [
            IngestEmbeddingTarget(
                source="search",
                provider=embedding_provider or "",
                model=embedding_model or "",
                api_key=embedding_api_key,
                collection="",
            )
        ]
    else:
        ingest_target = getattr(source, "ingest_embedding_target", None)
        targets = resolve_crawl_ingest_targets(db, source.project_id, ingest_target)

    primary_status = "Indexing Failed"
    primary_chunks = 0
    last_collection: Optional[str] = None

    for idx, target in enumerate(targets):
        ingest_kwargs = dict(
            source_file=f"crawl_source_{source.id}",
            document_id=str(source.id),
            user_id=source.created_by_id,
            project_id=project_id or str(source.project_id),
            embedding_provider=target.provider,
            embedding_model=target.model,
            embedding_api_key=target.api_key,
        )
        try:
            result = _write_prepared_ingest_in_batches(texts, chunk_metadata, ingest_kwargs)
        except Exception as exc:
            from .embed_rate_limit import EmbeddingRateLimitError, is_embed_rate_limit_error

            if is_embed_rate_limit_error(exc) or isinstance(exc, EmbeddingRateLimitError):
                raise
            logger.error(
                "Crawl ingest failed for source %s target=%s: %s",
                source.id,
                getattr(target, "source", "?"),
                exc,
            )
            result = {"status": "Indexing Failed", "chunks": 0}

        status = str(result.get("status") or "")
        chunks = int(result.get("chunks", 0) or 0)
        last_collection = result.get("collection") or last_collection

        if idx == 0:
            primary_status = status or primary_status
            primary_chunks = chunks
        elif chunks == 0:
            logger.warning(
                "Secondary crawl ingest produced 0 chunks source=%s target=%s collection=%s",
                source.id,
                getattr(target, "source", "?"),
                getattr(target, "collection", None),
            )
        else:
            logger.info(
                "Secondary crawl ingest ok source=%s target=%s collection=%s chunks=%s",
                source.id,
                getattr(target, "source", "?"),
                getattr(target, "collection", None),
                chunks,
            )

    return {
        "status": primary_status,
        "chunks": primary_chunks,
        "collection": last_collection,
    }


def _direct_ingest_crawl_documents_subset(
    source_id: uuid.UUID, document_ids: list[str]
) -> Dict[str, object]:
    """Like _direct_ingest_crawl_documents but only processes specified document_ids."""
    db = SessionLocal()
    try:
        source = db.query(CrawlSource).filter(CrawlSource.id == source_id).first()
        if not source:
            return {"status": "Source not found", "chunks": 0}

        doc_uuids = [uuid.UUID(d) for d in document_ids]
        documents = (
            db.query(Document)
            .filter(
                Document.source_id == source_id,
                Document.id.in_(doc_uuids),
            )
            .all()
        )

        return _ingest_crawl_documents_for_source(db, source, documents)
    finally:
        db.close()


class CrawlerOrchestrator:

    """Main crawler orchestration class using Scrapy + Playwright"""

    

    def __init__(self, db: Session):

        self.db = db

    

    def create_job(self, source_id) -> uuid.UUID:

        """Create a crawl job and return its ID immediately (non-blocking)"""

        return create_crawl_job(self.db, source_id)

    

    async def start_crawl(self, source_id, user_id: int):

        """Start a crawl job for a source - DEPRECATED: Use create_job + run_crawl instead"""

        # Legacy method - kept for compatibility

        job_id = create_crawl_job(self.db, source_id)

        # Run crawl in background (fire and forget)

        import asyncio

        asyncio.create_task(run_crawl(job_id, source_id))

        return job_id

    

    def get_job_status(self, job_id) -> Optional[Dict]:

        """Get the status of a crawl job"""

        job = self.db.query(CrawlJob).filter(CrawlJob.id == job_id).first()

        if not job:

            return None

        

        return {

            "job_id": job.id,

            "status": job.status.value if hasattr(job.status, 'value') else str(job.status),

            "pages_fetched": job.pages_fetched,

            "errors": job.errors,

            "queued_at": job.queued_at.isoformat(),

            "started_at": job.started_at.isoformat() if job.started_at else None,

            "finished_at": job.finished_at.isoformat() if job.finished_at else None

        }

