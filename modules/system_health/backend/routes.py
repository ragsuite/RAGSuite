"""system_health HTTP routes (Phase 3 Module)."""
import os
import asyncio
import threading
import re
import logging
from pathlib import Path
from typing import Optional, Dict, Any, List
import uuid
from collections import deque
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func, desc, and_, distinct, Integer, cast, not_
from urllib.parse import urlparse
from datetime import datetime, timedelta, timezone

logger = logging.getLogger(__name__)

from app.db import get_db, test_connection
from app.models import (
    QueryLog, AnalyticsDay, CrawlJob, CrawlSource, Document,
    CrawlJobStatus, LLMConfig, ChatMessage, QueryMode,
    ChatbotSettings, SearchSettings, User, Project
)
from app.schemas import (
    AnalyticsOverviewOut, QueryStatisticsOut, PopularTermsOut, HealthCheckOut,
    QueryLogEntry, PopularTerm, CrawlStatusSummary, SystemHealth,
    ServiceHealth, SystemHealthDashboard, TimeRange, AnalyticsDashboardResponse,
    DailyQueryPoint, LatencyDataPoint, SatisfactionDataPoint, SourceCoverageItem,
    PopularQueryItem, HardQueryItem, AnalyticsMetrics, SatisfactionTimeSeriesResponse,
    SourceCoverageResponse, PopularQueriesResponse, HardQueriesResponse
)
from app.auth import get_current_user_required, get_active_project, get_current_user_optional, resolve_scoped_project
from app.settings import settings

try:
    import redis
    REDIS_AVAILABLE = True
except ImportError:
    REDIS_AVAILABLE = False

try:
    import chromadb
    CHROMADB_AVAILABLE = True
except ImportError:
    CHROMADB_AVAILABLE = False

_service_health_history: Dict[str, deque] = {
    "API Gateway": deque(maxlen=100),
    "Redis Cache": deque(maxlen=100),
    "Vector Database": deque(maxlen=100),
    "PostgreSQL": deque(maxlen=100),
}
_service_last_heartbeat: Dict[str, Optional[datetime]] = {
    "API Gateway": None,
    "Redis Cache": None,
    "Vector Database": None,
    "PostgreSQL": None,
}

# Store app start time for API Gateway
_app_start_time: Optional[datetime] = None
_health_lock = threading.Lock()

def init_app_start_time():
    """Initialize app start time (call this on app startup)"""
    global _app_start_time
    if _app_start_time is None:
        _app_start_time = datetime.utcnow()

def _ensure_service_tracking(service_name: str):
    """Ensure a service has tracking initialized (for dynamic LLM providers)"""
    with _health_lock:
        if service_name not in _service_health_history:
            _service_health_history[service_name] = deque(maxlen=100)
        if service_name not in _service_last_heartbeat:
            _service_last_heartbeat[service_name] = None

def _record_health_check(service_name: str, is_healthy: bool, response_time: float):
    """Record a health check result for uptime calculation"""
    _ensure_service_tracking(service_name)
    with _health_lock:
        _service_health_history[service_name].append({
            "timestamp": datetime.utcnow(),
            "healthy": is_healthy,
            "response_time": response_time
        })
        if is_healthy:
            _service_last_heartbeat[service_name] = datetime.utcnow()

def _calculate_uptime_percent(service_name: str) -> float:
    """Calculate uptime percentage based on historical data"""
    _ensure_service_tracking(service_name)
    with _health_lock:
        history = _service_health_history[service_name]
        if not history:
            return 100.0  # No history means service is new, assume healthy
        
        total_checks = len(history)
        healthy_checks = sum(1 for check in history if check["healthy"])
        
        if total_checks == 0:
            return 100.0  # No checks yet, assume healthy
        
        # If service just recovered from being down (last check was healthy after failures),
        # give it a fresh start - this handles API key changes
        if total_checks >= 2:
            last_check = history[-1]
            # If the last check is healthy and there were any failures before, treat as recovery
            if last_check["healthy"]:
                # Check if there were any failures in history
                if any(not check["healthy"] for check in list(history)[:-1]):
                    # Service recovered - reset to 100% (fresh start after API key change)
                    return 100.0
        
        uptime_percent = (healthy_checks / total_checks) * 100.0
        return round(uptime_percent, 1)

def _get_last_heartbeat_seconds(service_name: str) -> Optional[int]:
    """Get seconds since last heartbeat"""
    with _health_lock:
        last_heartbeat = _service_last_heartbeat[service_name]
        if last_heartbeat is None:
            return None
        delta = datetime.utcnow() - last_heartbeat
        return int(delta.total_seconds())

# Health Threshold Constants
THRESHOLD_LATENCY_DEGRADED = 1.0  # seconds
THRESHOLD_LATENCY_AT_RISK = 5.0   # seconds
THRESHOLD_MEMORY_DEGRADED = 80    # percent
THRESHOLD_ERROR_RATE_AT_RISK = 0.05 # 5% error rate

def _calculate_health_score(availability: float, latency_score: float, consistency: float) -> float:
    """
    Calculate 0-100 health score based on metrics.
    Weights: Availability (50%), Latency (30%), Consistency (20%)
    """
    score = (availability * 0.5) + (latency_score * 0.3) + (consistency * 0.2)
    return round(max(0.0, min(100.0, score)), 1)

def _evaluate_service_health(service_name: str, response_time: float, is_up: bool, extra_metrics: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Predictive evaluation of service health.
    Returns: status, score, reason, predicted_failure
    """
    if extra_metrics is None:
        extra_metrics = {}
        
    reason = []
    predicted_failure_minutes = None
    
    # 1. Base Status Checking
    if not is_up:
        return {
            "status": "down",
            "score": 0.0,
            "reason": "Service unreachable",
            "predicted_failure_minutes": 0
        }
    
    # 2. Metric Analysis
    latency_score = 100.0
    if response_time > THRESHOLD_LATENCY_AT_RISK:
        latency_score = 40.0
        reason.append(f"High latency ({response_time:.2f}s)")
    elif response_time > THRESHOLD_LATENCY_DEGRADED:
        latency_score = 70.0
        reason.append(f"Elevated latency ({response_time:.2f}s)")
        
    # Get historical stats
    # For LLM providers, check for recovery BEFORE calculating uptime
    recovery_detected = False
    if " API" in service_name or service_name.endswith(" API"):
        _ensure_service_tracking(service_name)
        with _health_lock:
             history = _service_health_history[service_name]
             # Check if current check is healthy AND there were failures before (recovery pattern)
             # Note: Current check is already recorded in history, so history[-1] is the current check
             if is_up and len(history) >= 2:
                 # Current check is healthy - check if previous checks had failures
                 previous_checks = list(history)[:-1]  # All checks except the current one
                 if previous_checks and any(not check['healthy'] for check in previous_checks):
                     # Just recovered - treat as healthy (likely API key was updated)
                     recovery_detected = True
    
    uptime = _calculate_uptime_percent(service_name)
    
    # If recovery detected, force uptime to 100% for accurate health score
    if recovery_detected:
        uptime = 100.0
    
    # 3. Service-Specific Rules
    status = "healthy"
    
    # API Gateway Rules
    if service_name == "API Gateway":
        if response_time > 5.0:
            status = "degraded"
        # Check trend (simulated for now as we don't store long-term trend in memory yet)
        if response_time > 2.0 and uptime < 99.0:
            status = "at_risk"
            reason.append("Unstable performance trend")
            
    # Redis Rules
    elif service_name == "Redis Cache":
        # Placeholder for memory check (requires extra lib or connection command)
        pass
        
    # Vector DB Rules
    elif service_name == "Vector Database":
        last_beat = _get_last_heartbeat_seconds(service_name)
        if last_beat and last_beat > 30:
            status = "down"
            reason.append("Heartbeat missing")
        elif response_time > 3.0: # Rising latency
             status = "at_risk"
             reason.append("Ingestion latency rising")
             predicted_failure_minutes = 15.0
             
    # PostgreSQL Rules
    elif service_name == "PostgreSQL":
         # Placeholder for connection usage
         pass
         
    # LLM Provider Rules (OpenAI, Mistral, Gemini, Anthropic, etc.)
    if " API" in service_name or service_name.endswith(" API"):
        _ensure_service_tracking(service_name)
        with _health_lock:
             history = _service_health_history[service_name]
             # Check if current check is healthy AND there were failures before (recovery pattern)
             # Note: Current check is already recorded in history, so history[-1] is the current check
             if is_up and len(history) >= 2:
                 # Current check is healthy - check if previous checks had failures
                 previous_checks = list(history)[:-1]  # All checks except the current one
                 if previous_checks and any(not check['healthy'] for check in previous_checks):
                     # Just recovered - treat as healthy (likely API key was updated)
                     recovery_detected = True
                     status = "healthy"
                     if "Repeated connection failures" in reason:
                         reason.remove("Repeated connection failures")
             # Only check for failures if we have enough history AND no recovery was detected
             if not recovery_detected and len(history) >= 3:
                 # Check for repeated failures in recent window
                 recent_failures = sum(1 for x in list(history)[-5:] if not x['healthy'])
                 # But if the last check was successful, don't mark as at_risk (might be new API key)
                 if recent_failures >= 3 and not is_up:
                     status = "at_risk"
                     reason.append("Repeated connection failures")
                     predicted_failure_minutes = 5.0
    
    # 4. Final Score & Status Calculation
    health_score = _calculate_health_score(uptime, latency_score, 100.0)
    
    # Override status based on score if metrics are bad
    # BUT: Don't override if recovery was just detected (API key was changed)
    if not recovery_detected:
        if health_score < 50:
            status = "down"
        elif health_score < 70 and status == "healthy":
            status = "at_risk" 
        elif health_score < 90 and status == "healthy":
            status = "degraded"
    else:
        # Recovery detected - ensure health score reflects recovery (should be 100% if uptime is 100%)
        # If uptime was reset to 100%, health_score should also be 100%
        if uptime >= 100.0:
            health_score = 100.0
        
    if not reason:
        reason.append("Service operating normally")
        
    return {
        "status": status,
        "score": health_score,
        "reason": "; ".join(reason),
        "predicted_failure_minutes": predicted_failure_minutes
    }

health_router = APIRouter()

@health_router.get("/api/v1/health", response_model=HealthCheckOut, tags=["health"])
async def health_check():
    """System health check endpoint"""
    # Test database connection
    db_healthy = test_connection()
    
    # Get system info
    status = "healthy" if db_healthy else "unhealthy"
    
    # Calculate uptime (simple version - could be enhanced with process start time)
    uptime_seconds = None  # Could track process start time
    
    return HealthCheckOut(
        status=status,
        database=db_healthy,
        cache=None,  # Redis not implemented yet
        version=settings.app_version,
        uptime_seconds=uptime_seconds,
        timestamp=datetime.utcnow()
    )


@health_router.get("/api/v1/health/concurrency-metrics", tags=["health"])
async def concurrency_metrics():
    """In-process pool, Chroma lock, and executor metrics for load debugging."""
    from app.services.observability import snapshot_metrics

    return snapshot_metrics()


@health_router.get("/api/v1/health/ready", tags=["health"])
async def health_ready():
    """
    Readiness probe: Postgres + Chroma required; Redis if configured;
    background job worker when durable jobs are enabled.
    """
    from fastapi.responses import JSONResponse

    from app.schemas import HealthReadyChecks, HealthReadyOut
    from app.settings import settings

    db_ok = test_connection()
    vdb_res = await check_vector_db_health()
    vdb_ok = vdb_res.get("status") not in ("down",)

    from app.services.infra_env import redis_host, redis_url_or_none

    redis_configured = bool(redis_url_or_none() or redis_host())
    redis_ok: Optional[bool] = None
    if redis_configured:
        redis_res = await check_redis_health()
        redis_ok = redis_res.get("status") not in ("down",)

    job_worker_ok: Optional[bool] = None
    if settings.enable_durable_jobs:
        if not settings.run_inline_worker:
            # External worker process — in-process thread check is meaningless here.
            # The separate `app.worker` process manages its own threads; treat as N/A.
            job_worker_ok = None
        else:
            try:
                from app.services.job_queue import worker_is_running

                job_worker_ok = worker_is_running()
            except Exception:
                job_worker_ok = False

    checks = HealthReadyChecks(
        database=db_ok,
        vector_db=vdb_ok,
        redis=redis_ok,
        job_worker=job_worker_ok,
    )
    ready = db_ok and vdb_ok and (redis_ok is not False) and (job_worker_ok is not False)
    if not ready:
        logger.warning(
            "health_ready not_ready database=%s vector_db=%s redis=%s job_worker=%s",
            db_ok,
            vdb_ok,
            redis_ok,
            job_worker_ok,
        )

    body = HealthReadyOut(
        ready=ready,
        status="ready" if ready else "not_ready",
        checks=checks,
        version=settings.app_version,
        timestamp=datetime.utcnow(),
    )
    status_code = 200 if ready else 503
    return JSONResponse(status_code=status_code, content=body.model_dump(mode="json"))


@health_router.get("/api/v1/health/jobs", tags=["health"])
async def health_jobs():
    """
    Worker and session store health for operations monitoring.
    Reports job queue depth, alive worker threads, Redis status, and session store type.
    No authentication required (same as /health/ready).
    """
    from app.db import SessionLocal
    from app.models import BackgroundJob, BackgroundJobStatus

    now = datetime.utcnow()
    pending = running = failed_24h = -1
    try:
        db = SessionLocal()
        try:
            pending = db.query(BackgroundJob).filter(
                BackgroundJob.status == BackgroundJobStatus.PENDING.value
            ).count()
            running = db.query(BackgroundJob).filter(
                BackgroundJob.status == BackgroundJobStatus.RUNNING.value
            ).count()
            cutoff = now - timedelta(hours=24)
            failed_24h = db.query(BackgroundJob).filter(
                BackgroundJob.status == BackgroundJobStatus.FAILED.value,
                BackgroundJob.finished_at >= cutoff,
            ).count()
        finally:
            db.close()
    except Exception as _exc:
        logger.warning("health/jobs DB query failed: %s", _exc)

    redis_ok = False
    try:
        from app.services.redis_client import is_redis_available
        redis_ok = is_redis_available()
    except Exception:
        pass

    session_store_type = "unknown"
    try:
        from app.services.session_store import get_session_store
        session_store_type = get_session_store().store_type()
    except Exception:
        pass

    thread_count = 0
    try:
        from app.services.job_queue import worker_thread_count
        thread_count = worker_thread_count()
    except Exception:
        pass

    return {
        "pending_jobs": pending,
        "running_jobs": running,
        "failed_last_24h": failed_24h,
        "worker_thread_count": thread_count,
        "redis_connected": redis_ok,
        "session_store_type": session_store_type,
        "timestamp": now.isoformat() + "Z",
    }


# Health check helper functions
async def check_redis_health() -> Dict[str, Any]:
    """Check Redis Cache health with real-time monitoring"""
    service_name = "Redis Cache"
    
    if not REDIS_AVAILABLE:
        _record_health_check(service_name, False, 0.0)
        return {
            "status": "down",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }
    
    start_time = datetime.utcnow()
    try:
        from app.services.infra_env import redis_host, redis_port

        rh = redis_host() or "localhost"
        rp = redis_port()
        client = redis.StrictRedis(
            host=rh,
            port=rp,
            db=0,
            decode_responses=True,
            socket_timeout=2,
            socket_connect_timeout=2
        )
        client.ping()
        response_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Determine status based on response time
        if response_time < 0.1:
            status = "healthy"
        elif response_time < 1.0:
            status = "degraded"
        else:
            status = "degraded"
        
        _record_health_check(service_name, True, response_time)
        
        return {
            "status": status,
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }
    except (redis.ConnectionError, ConnectionError, OSError) as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "down",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "degraded",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }

async def check_vector_db_health() -> Dict[str, Any]:
    """Check Vector Database (ChromaDB) health with real-time monitoring"""
    service_name = "Vector Database"
    start_time = datetime.utcnow()
    
    if not CHROMADB_AVAILABLE:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "down",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }
    
    try:
        from app.services.infra_env import (
            chroma_host,
            chroma_http_enabled,
            chroma_port,
            chroma_ssl,
        )

        if chroma_http_enabled():
            from chromadb.config import Settings as _ChromaSettings
            _host = chroma_host()
            _port = chroma_port()
            _ssl = chroma_ssl()
            _settings = _ChromaSettings(chroma_server_host=_host, chroma_server_http_port=_port)
            client = chromadb.HttpClient(host=_host, port=_port, ssl=_ssl, settings=_settings)
        else:
            PROJECT_ROOT = Path(os.getcwd())
            VDB_PATH = PROJECT_ROOT / "rag_db_local"
            if not VDB_PATH.exists():
                response_time = (datetime.utcnow() - start_time).total_seconds()
                _record_health_check(service_name, False, response_time)
                return {
                    "status": "down",
                    "uptime_percent": _calculate_uptime_percent(service_name),
                    "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
                }
            client = chromadb.PersistentClient(path=str(VDB_PATH))

        # Try to get or create collection to verify connection
        collection = client.get_or_create_collection(
            name="rag_collection",
            metadata={"hnsw:space": "cosine"}
        )
        response_time = (datetime.utcnow() - start_time).total_seconds()
        
        # Check if collection is accessible
        try:
            collection.count()
            is_healthy = response_time < 2.0
            status = "healthy" if response_time < 3.0 else ("degraded" if response_time < 5.0 else "degraded")
            
            _record_health_check(service_name, is_healthy, response_time)
            
            return {
                "status": status,
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
        except Exception:
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "down",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }

async def check_postgresql_health() -> Dict[str, Any]:
    """Check PostgreSQL health with real-time monitoring"""
    service_name = "PostgreSQL"
    start_time = datetime.utcnow()
    
    try:
        db_healthy = test_connection()
        response_time = (datetime.utcnow() - start_time).total_seconds()
        
        if db_healthy:
            status = "healthy" if response_time < 0.5 else "degraded"
            _record_health_check(service_name, True, response_time)
            return {
                "status": status,
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
        else:
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "down",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }

async def check_openai_health(db: Session, user_id: int = None) -> Dict[str, Any]:
    """Check OpenAI API health with real-time monitoring"""
    service_name = "OpenAI API"
    start_time = datetime.utcnow()
    
    try:
        api_key = None
        model_provider = None
        
        # If user_id is provided, get THEIR config
        if user_id:
            # Get active project for the user
            active_project = db.query(Project).filter(
                and_(
                    Project.owner_id == user_id,
                    Project.is_active == True,
                    not_(Project.name.like("__TEMP_ONBOARDING_%"))
                )
            ).first()
            
            if active_project:
                # Check ChatbotSettings first (new model)
                chatbot_settings = db.query(ChatbotSettings).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == active_project.id
                    )
                ).first()
                
                if chatbot_settings and chatbot_settings.model_provider == "openai" and chatbot_settings.api_key:
                    api_key = chatbot_settings.api_key
                    model_provider = chatbot_settings.model_provider
                else:
                    # Check SearchSettings
                    search_settings = db.query(SearchSettings).filter(
                        and_(
                            SearchSettings.user_id == user_id,
                            SearchSettings.project_id == active_project.id
                        )
                    ).first()
                    
                    if search_settings and search_settings.model_provider == "openai" and search_settings.api_key:
                        api_key = search_settings.api_key
                        model_provider = search_settings.model_provider
            
            # Fallback to LLMConfig (legacy) if no API key found in new models
            if not api_key:
                llm_config = db.query(LLMConfig).filter(
                    LLMConfig.user_id == user_id
                ).first()
                
                if llm_config:
                    if llm_config.model_provider != "openai":
                        response_time = (datetime.utcnow() - start_time).total_seconds()
                        _record_health_check(service_name, False, response_time)
                        return {
                            "status": "down",
                            "uptime_percent": 0.0,
                            "last_heartbeat_seconds": None,
                            "reason": f"Provider '{llm_config.model_provider}' selected"
                        }
                    if llm_config.api_key and llm_config.api_key != "None":
                        api_key = llm_config.api_key
                        model_provider = llm_config.model_provider
        else:
            # Fallback for unauthenticated/system checks: find ANY openai config
            # Check ChatbotSettings first
            chatbot_settings = db.query(ChatbotSettings).filter(
                and_(
                    ChatbotSettings.model_provider == "openai",
                    ChatbotSettings.api_key.isnot(None),
                    ChatbotSettings.api_key != ""
                )
            ).first()
            
            if chatbot_settings and chatbot_settings.api_key:
                api_key = chatbot_settings.api_key
                model_provider = chatbot_settings.model_provider
            else:
                # Check SearchSettings
                search_settings = db.query(SearchSettings).filter(
                    and_(
                        SearchSettings.model_provider == "openai",
                        SearchSettings.api_key.isnot(None),
                        SearchSettings.api_key != ""
                    )
                ).first()
                
                if search_settings and search_settings.api_key:
                    api_key = search_settings.api_key
                    model_provider = search_settings.model_provider
                else:
                    # Fallback to LLMConfig (legacy behavior)
                    llm_config = db.query(LLMConfig).filter(
                        LLMConfig.model_provider == "openai"
                    ).first()
                    if llm_config and llm_config.api_key and llm_config.api_key != "None":
                        api_key = llm_config.api_key
                        model_provider = llm_config.model_provider
        
        if not api_key or api_key == "None" or not api_key.strip():
            # No OpenAI API key found
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": 0.0,
                "last_heartbeat_seconds": None,
                "reason": "No API Key configured"
            }
        
        if model_provider != "openai":
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": 0.0,
                "last_heartbeat_seconds": None,
                "reason": f"Provider '{model_provider}' selected (not OpenAI)"
            }
        
        # Try a simple API call to verify connectivity
        try:
            from openai import OpenAI as OpenAIClient, AuthenticationError, APITimeoutError
            client = OpenAIClient(api_key=api_key, timeout=5.0)
            # Simple test - list models (lightweight call)
            client.models.list()
            response_time = (datetime.utcnow() - start_time).total_seconds()
            
            # Relaxed threshold for external API
            status = "healthy" if response_time < 3.0 else "degraded"
            _record_health_check(service_name, True, response_time)
            
            return {
                "status": status,
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
        except AuthenticationError:
             response_time = (datetime.utcnow() - start_time).total_seconds()
             _record_health_check(service_name, False, response_time)
             return {
                 "status": "down",
                 "uptime_percent": _calculate_uptime_percent(service_name),
                 "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
                 "reason": "Invalid API Key"
             }
        except APITimeoutError:
             response_time = (datetime.utcnow() - start_time).total_seconds()
             _record_health_check(service_name, False, response_time)
             return {
                 "status": "down",
                 "uptime_percent": _calculate_uptime_percent(service_name),
                 "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
                 "reason": "Connection Timeout (5s)"
             }
        except Exception as api_error:
            # API key might be invalid or service down
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
                "reason": str(api_error)
            }
    except ImportError:
        # OpenAI package not installed
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "down", # Treat as inactive if lib missing
            "uptime_percent": 0.0,
            "last_heartbeat_seconds": None,
            "reason": "OpenAI library missing"
        }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "degraded",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }

async def check_llm_provider_health(
    db: Session,
    provider: str,
    user_id: int = None,
    api_key: str = None,
    model_name: str = None,
    source: str = None  # "chatbot" or "search" to indicate where API key comes from
) -> Dict[str, Any]:
    """
    Generic LLM provider health check (OpenAI, Mistral, Gemini, Anthropic, etc.)
    
    Args:
        db: Database session
        provider: Provider name (openai, mistral, gemini, anthropic, etc.)
        user_id: Optional user ID to get user-specific config
        api_key: Optional API key (if not provided, will fetch from config)
        model_name: Optional model name (if not provided, will use default)
        source: Optional source indicator ("chatbot" or "search") to include in service name
    
    Returns:
        Health status dictionary
    """
    # Normalize provider name
    provider_lower = provider.lower()
    if "google" in provider_lower or "gemini" in provider_lower:
        provider_normalized = "gemini"
        base_service_name = "Gemini API"
    elif "mistral" in provider_lower:
        provider_normalized = "mistral"
        base_service_name = "Mistral API"
    elif "anthropic" in provider_lower or "claude" in provider_lower:
        provider_normalized = "anthropic"
        base_service_name = "Anthropic API"
    elif "openai" in provider_lower:
        provider_normalized = "openai"
        base_service_name = "OpenAI API"
    else:
        provider_normalized = provider_lower
        base_service_name = f"{provider.capitalize()} API"
    
    # Add source to service name if provided
    if source:
        service_name = f"{base_service_name} ({source.capitalize()})"
    else:
        service_name = base_service_name
    
    start_time = datetime.utcnow()
    _ensure_service_tracking(service_name)
    
    try:
        # If api_key not provided, fetch from config
        if not api_key:
            if user_id:
                # Get active project for the user
                active_project = db.query(Project).filter(
                    and_(
                        Project.owner_id == user_id,
                        Project.is_active == True,
                        not_(Project.name.like("__TEMP_ONBOARDING_%"))
                    )
                ).first()
                
                if active_project:
                    # Check ChatbotSettings first
                    chatbot_settings = db.query(ChatbotSettings).filter(
                        and_(
                            ChatbotSettings.user_id == user_id,
                            ChatbotSettings.project_id == active_project.id
                        )
                    ).first()
                    
                    if chatbot_settings and chatbot_settings.model_provider == provider_normalized and chatbot_settings.api_key:
                        api_key = chatbot_settings.api_key
                        model_name = model_name or chatbot_settings.model_name
                        if not source:  # Only set source if not already provided
                            source = "chatbot"
                    else:
                        # Check SearchSettings
                        search_settings = db.query(SearchSettings).filter(
                            and_(
                                SearchSettings.user_id == user_id,
                                SearchSettings.project_id == active_project.id
                            )
                        ).first()
                        
                        if search_settings and search_settings.model_provider == provider_normalized and search_settings.api_key:
                            api_key = search_settings.api_key
                            model_name = model_name or search_settings.model_name
                            if not source:  # Only set source if not already provided
                                source = "search"
                
                # Fallback to LLMConfig (legacy)
                if not api_key:
                    llm_config = db.query(LLMConfig).filter(
                        and_(
                            LLMConfig.user_id == user_id,
                            LLMConfig.model_provider == provider_normalized
                        )
                    ).first()
                    if llm_config and llm_config.api_key and llm_config.api_key != "None":
                        api_key = llm_config.api_key
            else:
                # Fallback for unauthenticated/system checks
                chatbot_settings = db.query(ChatbotSettings).filter(
                    and_(
                        ChatbotSettings.model_provider == provider_normalized,
                        ChatbotSettings.api_key.isnot(None),
                        ChatbotSettings.api_key != ""
                    )
                ).first()
                
                if chatbot_settings and chatbot_settings.api_key:
                    api_key = chatbot_settings.api_key
                    if not source:  # Only set source if not already provided
                        source = "chatbot"
                else:
                    search_settings = db.query(SearchSettings).filter(
                        and_(
                            SearchSettings.model_provider == provider_normalized,
                            SearchSettings.api_key.isnot(None),
                            SearchSettings.api_key != ""
                        )
                    ).first()
                    
                    if search_settings and search_settings.api_key:
                        api_key = search_settings.api_key
                        if not source:  # Only set source if not already provided
                            source = "search"
                    else:
                        llm_config = db.query(LLMConfig).filter(
                            LLMConfig.model_provider == provider_normalized
                        ).first()
                        if llm_config and llm_config.api_key and llm_config.api_key != "None":
                            api_key = llm_config.api_key
                
                # Update service name with source if we found it
                if source:
                    service_name = f"{base_service_name} ({source.capitalize()})"
                    _ensure_service_tracking(service_name)
        
        if not api_key or api_key == "None" or not api_key.strip():
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": 0.0,
                "last_heartbeat_seconds": None,
                "reason": "No API Key configured"
            }
        
        # Use LLMFactory to test the provider
        try:
            from app.services.llmconn import LLMFactory
            
            # Get default model if not provided
            if not model_name:
                if provider_normalized == "openai":
                    model_name = "gpt-3.5-turbo"
                elif provider_normalized == "anthropic":
                    model_name = "claude-3-haiku-20240307"
                elif provider_normalized == "mistral":
                    model_name = "mistral-small"
                elif provider_normalized == "gemini":
                    model_name = "gemini-pro"
                else:
                    model_name = "default"
            
            # Get LLM instance (this will test connectivity)
            llm = LLMFactory.get_llm(provider_normalized, model_name, api_key)
            
            # For Ollama/custom providers, skip API test (they're local)
            if provider_normalized == "ollama":
                response_time = (datetime.utcnow() - start_time).total_seconds()
                status = "healthy" if response_time < 1.0 else "degraded"
                _record_health_check(service_name, True, response_time)
                return {
                    "status": status,
                    "uptime_percent": _calculate_uptime_percent(service_name),
                    "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
                }
            
            # For cloud providers, test with a simple completion call
            # Use a very short prompt to minimize cost
            test_prompt = "Hi"
            try:
                response = llm.complete(test_prompt)
                response_time = (datetime.utcnow() - start_time).total_seconds()
                status = "healthy" if response_time < 3.0 else "degraded"
                _record_health_check(service_name, True, response_time)
                return {
                    "status": status,
                    "uptime_percent": _calculate_uptime_percent(service_name),
                    "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
                }
            except Exception as api_error:
                response_time = (datetime.utcnow() - start_time).total_seconds()
                _record_health_check(service_name, False, response_time)
                error_str = str(api_error).lower()
                if "auth" in error_str or "invalid" in error_str or "key" in error_str:
                    reason = "Invalid API Key"
                elif "timeout" in error_str:
                    reason = "Connection Timeout"
                else:
                    reason = f"API Error: {str(api_error)[:100]}"
                return {
                    "status": "down",
                    "uptime_percent": _calculate_uptime_percent(service_name),
                    "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
                    "reason": reason
                }
        except ImportError as import_err:
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": 0.0,
                "last_heartbeat_seconds": None,
                "reason": f"Provider library missing: {str(import_err)}"
            }
        except Exception as e:
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, False, response_time)
            return {
                "status": "down",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
                "reason": str(e)[:200]
            }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "degraded",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name),
            "reason": str(e)[:200]
        }

async def check_api_gateway_health() -> Dict[str, Any]:
    """Check API Gateway (FastAPI app) health with real-time monitoring"""
    service_name = "API Gateway"
    start_time = datetime.utcnow()
    
    # Initialize app start time if not set
    init_app_start_time()
    
    # API Gateway is healthy if this endpoint responds
    # Calculate uptime based on app start time
    try:
        if _app_start_time:
            uptime_delta = datetime.utcnow() - _app_start_time
            uptime_seconds = uptime_delta.total_seconds()
            # Assume healthy if app is running (this endpoint is responding)
            is_healthy = True
            response_time = (datetime.utcnow() - start_time).total_seconds()
            
            _record_health_check(service_name, is_healthy, response_time)
            
            return {
                "status": "healthy",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
        else:
            response_time = (datetime.utcnow() - start_time).total_seconds()
            _record_health_check(service_name, True, response_time)
            return {
                "status": "healthy",
                "uptime_percent": _calculate_uptime_percent(service_name),
                "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
            }
    except Exception as e:
        response_time = (datetime.utcnow() - start_time).total_seconds()
        _record_health_check(service_name, False, response_time)
        return {
            "status": "degraded",
            "uptime_percent": _calculate_uptime_percent(service_name),
            "last_heartbeat_seconds": _get_last_heartbeat_seconds(service_name)
        }

@health_router.get("/api/v1/health/ping", tags=["health"])
async def health_ping():
    """Unauthenticated liveness probe for uptime monitors."""
    return {"status": "ok"}


@health_router.get("/api/v1/system-health", response_model=SystemHealthDashboard, tags=["health"])
async def system_health_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Comprehensive system health dashboard with all services.
    
    Returns health status for:
    - API Gateway (FastAPI app)
    - Redis Cache
    - Vector Database (ChromaDB)
    - PostgreSQL
    - OpenAI API
    """
    # Prepare service checks
    check_results = []
    
    # 1. API Gateway
    gateway_start = datetime.utcnow()
    try:
        if _app_start_time:
             # Logic from previous check_api_gateway_health
             uptime_delta = datetime.utcnow() - _app_start_time
             uptime_seconds = uptime_delta.total_seconds()
             gateway_latency = (datetime.utcnow() - gateway_start).total_seconds()
             _record_health_check("API Gateway", True, gateway_latency)
             
             check_results.append(("API Gateway", gateway_latency, True, {}))
        else:
             init_app_start_time()
             check_results.append(("API Gateway", 0.05, True, {}))
    except:
        check_results.append(("API Gateway", 0.0, False, {}))
        
    # 2. Redis
    redis_res = await check_redis_health()
    check_results.append(("Redis Cache", 0.1 if redis_res["status"] != "down" else 0.0, redis_res["status"] != "down", {}))
    
    # 3. Vector DB
    vdb_res = await check_vector_db_health()
    check_results.append(("Vector Database", 0.1 if vdb_res["status"] != "down" else 0.0, vdb_res["status"] != "down", {}))
    
    # 4. Postgres
    pg_res = await check_postgresql_health()
    check_results.append(("PostgreSQL", 0.1 if pg_res["status"] != "down" else 0.0, pg_res["status"] != "down", {}))
    
    # 5. LLM Providers (OpenAI, Mistral, Gemini, Anthropic, etc.)
    # Auth is required — current_user always present; only probe this user's own configs.
    user_id = current_user.id

    # Find all configured LLM providers with their sources (chatbot/search)
    configured_providers_with_source = []  # List of (provider, source) tuples

    # Get active project for the user
    active_project = db.query(Project).filter(
        and_(
            Project.owner_id == user_id,
            Project.is_active == True,
            not_(Project.name.like("__TEMP_ONBOARDING_%"))
        )
    ).first()

    if active_project:
        # Check ChatbotSettings
        chatbot_settings = db.query(ChatbotSettings).filter(
            and_(
                ChatbotSettings.user_id == user_id,
                ChatbotSettings.project_id == active_project.id,
                ChatbotSettings.api_key.isnot(None),
                ChatbotSettings.api_key != "",
                ChatbotSettings.api_key != "None"
            )
        ).first()
        if chatbot_settings and chatbot_settings.model_provider:
            configured_providers_with_source.append((chatbot_settings.model_provider, "chatbot"))

        # Check SearchSettings
        search_settings = db.query(SearchSettings).filter(
            and_(
                SearchSettings.user_id == user_id,
                SearchSettings.project_id == active_project.id,
                SearchSettings.api_key.isnot(None),
                SearchSettings.api_key != "",
                SearchSettings.api_key != "None"
            )
        ).first()
        if search_settings and search_settings.model_provider:
            configured_providers_with_source.append((search_settings.model_provider, "search"))

    # Fallback to LLMConfig (legacy) - no source specified
    llm_config = db.query(LLMConfig).filter(
        and_(
            LLMConfig.user_id == user_id,
            LLMConfig.api_key.isnot(None),
            LLMConfig.api_key != "",
            LLMConfig.api_key != "None"
        )
    ).first()
    if llm_config and llm_config.model_provider:
        configured_providers_with_source.append((llm_config.model_provider, None))
    
    # Check health for each configured provider with its source
    for provider, source in configured_providers_with_source:
        if provider and provider.lower() not in ["ollama", "custom"]:  # Skip local providers
            try:
                provider_res = await check_llm_provider_health(db, provider, user_id=user_id, source=source)
                # Service name is now determined inside check_llm_provider_health with source
                # Extract it from the response or determine it here
                provider_lower = provider.lower()
                if "google" in provider_lower or "gemini" in provider_lower:
                    base_name = "Gemini API"
                elif "mistral" in provider_lower:
                    base_name = "Mistral API"
                elif "anthropic" in provider_lower or "claude" in provider_lower:
                    base_name = "Anthropic API"
                elif "openai" in provider_lower:
                    base_name = "OpenAI API"
                else:
                    base_name = f"{provider.capitalize()} API"
                
                service_name = f"{base_name} ({source.capitalize()})" if source else base_name
                
                check_results.append((
                    service_name,
                    0.5 if provider_res["status"] != "down" else 0.0,
                    provider_res["status"] != "down",
                    provider_res
                ))
            except Exception as e:
                logger.error(f"Error checking health for provider {provider} (source: {source}): {e}")
                # Still add it as down
                provider_lower = provider.lower()
                if "google" in provider_lower or "gemini" in provider_lower:
                    base_name = "Gemini API"
                elif "mistral" in provider_lower:
                    base_name = "Mistral API"
                elif "anthropic" in provider_lower or "claude" in provider_lower:
                    base_name = "Anthropic API"
                elif "openai" in provider_lower:
                    base_name = "OpenAI API"
                else:
                    base_name = f"{provider.capitalize()} API"
                
                service_name = f"{base_name} ({source.capitalize()})" if source else base_name
                check_results.append((service_name, 0.0, False, {"status": "down", "reason": str(e)}))
    
    # Process results with predictive evaluation
    final_services = {}
    total_score = 0.0
    worst_status_priority = 0 # 0=healthy, 1=degraded, 2=at_risk, 3=down
    status_map = {"healthy": 0, "degraded": 1, "at_risk": 2, "down": 3}
    rev_status_map = {0: "healthy", 1: "degraded", 2: "at_risk", 3: "down"}
    
    for name, lat, is_up, metrics in check_results:
        # Use existing uptime stats
        uptime_pct = _calculate_uptime_percent(name)
        last_beat = _get_last_heartbeat_seconds(name)
        
        # Override latency from previous simple checks if available in res
        if name == "API Gateway":
             # Latency is passed correctly
             pass
        elif name == "Redis Cache":
             # We rely on the internal recording done by check_redis_health, so just use last recorded latency
             if _service_health_history[name]:
                 lat = _service_health_history[name][-1]["response_time"]
        elif name == "Vector Database":
             if _service_health_history[name]:
                 lat = _service_health_history[name][-1]["response_time"]
        elif name == "PostgreSQL":
             if _service_health_history[name]:
                 lat = _service_health_history[name][-1]["response_time"]
        elif " API" in name or name.endswith(" API"):
             # LLM Provider (OpenAI, Mistral, Gemini, Anthropic, etc.)
             _ensure_service_tracking(name)
             if _service_health_history[name]:
                 lat = _service_health_history[name][-1]["response_time"]

             
        evaluation = _evaluate_service_health(name, lat, is_up, metrics)
        
        # Update overall status tracker
        priority = status_map.get(evaluation["status"], 3)
        worst_status_priority = max(worst_status_priority, priority)
        total_score += evaluation["score"]
        
        final_services[name] = ServiceHealth(
            status=evaluation["status"],
            uptime_percent=uptime_pct,
            last_heartbeat_seconds=last_beat,
            health_score=evaluation["score"],
            reason=evaluation["reason"],
            predicted_failure_minutes=evaluation["predicted_failure_minutes"]
        )
        
    overall_score = round(total_score / len(final_services), 1) if final_services else 0.0
    
    return SystemHealthDashboard(
        services=final_services,
        timestamp=datetime.utcnow(),
        overall_health_score=overall_score,
        overall_status=rev_status_map[worst_status_priority]
    )

