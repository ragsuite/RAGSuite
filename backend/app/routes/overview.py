from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, desc, or_
from typing import Optional, List, Dict
from datetime import datetime, timedelta
from urllib.parse import urlparse
from ..db import get_db
from ..auth import get_current_user_required, get_active_project
from ..models import (
    QueryLog, ChatMessage, CrawlJob, CrawlSource, Document,
    CrawlJobStatus, User, AnalyticsDay, Project
)
from ..schemas import (
    OverviewDashboardResponse, KPICard, TrendData, QueriesOverTimeData,
    QueriesOverTimeResponse, QueryTimeSeriesPoint, LatestFeedbackResponse,
    FeedbackStats, CrawlErrorsResponse, TopSource, P95LatencyResponse
)

router = APIRouter(prefix="/api/v1/overview", tags=["Overview"])

def _start_of_day(dt: datetime) -> datetime:
    return dt.replace(hour=0, minute=0, second=0, microsecond=0)

def _format_time_ago(ts: datetime) -> str:
    delta = datetime.utcnow() - ts.replace(tzinfo=None)
    seconds = int(delta.total_seconds())
    if seconds < 60:
        return f"{seconds}s ago"
    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"
    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"
    days = hours // 24
    return f"{days}d ago"

@router.get("")
async def get_overview(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # Prevent caching - always return fresh data
    response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
    response.headers["Pragma"] = "no-cache"
    response.headers["Expires"] = "0"
    
    # active_project is now injected via dependency - shows ALL historical data for this project
    
    now = datetime.utcnow()
    today_start = _start_of_day(now)
    yesterday_start = today_start - timedelta(days=1)
    week_start = today_start - timedelta(days=6)

    # Queries today and yesterday for this user's active project
    queries_today = (
        db.query(func.count(QueryLog.id))
        .filter(
            QueryLog.timestamp >= today_start,
            QueryLog.user_id == current_user.id,
            QueryLog.project_id == active_project.id,
        )
        .scalar()
        or 0
    )
    queries_yesterday = (
        db.query(func.count(QueryLog.id))
        .filter(
            QueryLog.timestamp >= yesterday_start,
            QueryLog.timestamp < today_start,
            QueryLog.user_id == current_user.id,
            QueryLog.project_id == active_project.id,
        )
        .scalar()
        or 0
    )
    change_percent = 0.0
    if queries_yesterday > 0:
        change_percent = ((queries_today - queries_yesterday) / queries_yesterday) * 100.0
    trend_today = TrendData(value=abs(change_percent), isPositive=change_percent >= 0)
    queries_today_card = KPICard(value=queries_today, trend=trend_today)

    # P95 latency today (this user's active project only)
    p95_today = (
        db.query(func.avg(QueryLog.p95_latency))
        .filter(
            QueryLog.p95_latency.isnot(None),
            QueryLog.timestamp >= today_start,
            QueryLog.user_id == current_user.id,
            QueryLog.project_id == active_project.id,
        )
        .scalar()
    )
    p95_value = int(p95_today) if p95_today is not None else 0
    p95_card = KPICard(value=p95_value, trend=None)

    # Thumbs-up rate (from ChatMessage feedback) - this user's active project only
    total_feedback = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.feedback.isnot(None),
            ChatMessage.user_id == current_user.id,
            ChatMessage.project_id == active_project.id,
        )
        .scalar()
        or 0
    )
    positive_count = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.feedback.is_(True),
            ChatMessage.user_id == current_user.id,
            ChatMessage.project_id == active_project.id,
        )
        .scalar()
        or 0
    )
    negative_count = (
        db.query(func.count(ChatMessage.id))
        .filter(
            ChatMessage.feedback.is_(False),
            ChatMessage.user_id == current_user.id,
            ChatMessage.project_id == active_project.id,
        )
        .scalar()
        or 0
    )
    rate = (positive_count / total_feedback) if total_feedback > 0 else 0.0
    thumbs_card = KPICard(value=int(rate * 100), trend=None)

    # Crawl errors summary - only jobs for sources owned by this user in active project
    user_source_ids_subq = (
        db.query(CrawlSource.id)
        .filter(
            and_(
                CrawlSource.created_by_id == current_user.id,
                CrawlSource.project_id == active_project.id
            )
        )
        .subquery()
    )

    total_failed_jobs = (
        db.query(func.count(CrawlJob.id))
        .filter(
            CrawlJob.status == CrawlJobStatus.FAILED,
            CrawlJob.source_id.in_(user_source_ids_subq),
        )
        .scalar()
        or 0
    )
    error_rows = (
        db.query(CrawlJob.errors)
        .filter(
            CrawlJob.errors.isnot(None),
            CrawlJob.source_id.in_(user_source_ids_subq),
        )
        .all()
    )
    total_errors = 0
    for row in error_rows:
        errs = row[0] if isinstance(row, tuple) else getattr(row, "errors", None)
        if isinstance(errs, list):
            total_errors += len(errs)
    crawl_errors_card = KPICard(value=int(total_errors or 0), trend=None)

    # Token usage summary (all-time) across all modes/providers/models for this project.
    token_stats = (
        db.query(
            func.coalesce(func.sum(QueryLog.total_tokens), 0),
            func.count(QueryLog.id),
            func.count(QueryLog.total_tokens),
        )
        .filter(
            QueryLog.user_id == current_user.id,
            QueryLog.project_id == active_project.id,
        )
        .first()
    )
    total_token_usage = int((token_stats[0] if token_stats else 0) or 0)
    total_query_logs = int((token_stats[1] if token_stats else 0) or 0)
    rows_with_token_usage = int((token_stats[2] if token_stats else 0) or 0)
    token_usage_incomplete = total_query_logs > rows_with_token_usage

    # Queries over time (last 7 days) - this user's active project queries
    points: List[QueriesOverTimeData] = []
    for i in range(6, -1, -1):
        day = today_start - timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = (
            db.query(func.count(QueryLog.id))
            .filter(
                QueryLog.timestamp >= day,
                QueryLog.timestamp < next_day,
                QueryLog.user_id == current_user.id,
                QueryLog.project_id == active_project.id,
            )
            .scalar()
            or 0
        )
        points.append(QueriesOverTimeData(name=day.strftime("%a"), queries=count))

    # Top sources (by documents indexed) with dynamic last crawl and aggregated errors - active project only
    sources = (
        db.query(CrawlSource)
        .filter(
            and_(
                CrawlSource.created_by_id == current_user.id,
                CrawlSource.project_id == active_project.id
            )
        )
        .all()
    )
    top_sources: List[TopSource] = []
    for s in sources:
        docs_count = db.query(func.count(Document.id)).filter(Document.source_id == s.id).scalar() or 0
        last_crawl = _format_time_ago(s.last_crawl_at) if getattr(s, "last_crawl_at", None) else "Never"
        failed_jobs = db.query(CrawlJob).filter(
            CrawlJob.source_id == s.id,
            CrawlJob.status == CrawlJobStatus.FAILED
        ).all()
        errors_count = sum(len(job.errors) if job.errors else 0 for job in failed_jobs)
        domain = urlparse(s.base_url).netloc or s.base_url
        top_sources.append(TopSource(url=domain, docs=docs_count, lastCrawl=last_crawl, errors=errors_count))
    top_sources = sorted(top_sources, key=lambda x: x.docs, reverse=True)[:5]

    # Latest feedback (last 10) - this user's active project only
    latest = (
        db.query(ChatMessage)
        .filter(
            and_(
                ChatMessage.feedback.isnot(None),
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(10)
        .all()
    )
    latest_items = []
    for msg in latest:
        vote = "up" if msg.feedback else "down"
        latest_items.append({
            "query": msg.user_message,
            "vote": vote,
            "reason": "",
            "time": _format_time_ago(msg.created_at)
        })

    analytics_date = datetime(today_start.year, today_start.month, today_start.day)
    feedback_today_total = (
        db.query(func.count(ChatMessage.id))
        .filter(
            and_(
                ChatMessage.feedback.isnot(None),
                ChatMessage.created_at >= today_start,
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .scalar()
        or 0
    )
    positive_today = (
        db.query(func.count(ChatMessage.id))
        .filter(
            and_(
                ChatMessage.feedback.is_(True),
                ChatMessage.created_at >= today_start,
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .scalar()
        or 0
    )
    thumbs_up_rate_today = (positive_today / feedback_today_total) if feedback_today_total > 0 else None
    error_rows_today = db.query(CrawlJob.errors).filter(CrawlJob.errors.isnot(None), CrawlJob.finished_at >= today_start).all()
    total_errors_today = 0
    for row in error_rows_today:
        errs = row[0] if isinstance(row, tuple) else getattr(row, "errors", None)
        if isinstance(errs, list):
            total_errors_today += len(errs)
    org_id = 1
    existing = None
    top_sources_snapshot = None
    try:
        existing = db.query(AnalyticsDay).filter(
            and_(
                AnalyticsDay.date >= today_start,
                AnalyticsDay.date < today_start + timedelta(days=1),
                or_(AnalyticsDay.org_id == org_id, AnalyticsDay.org_id.is_(None))
            )
        ).order_by(AnalyticsDay.date.desc()).first()
        top_sources_snapshot = [
            {"url": ts.url, "docs": ts.docs, "lastCrawl": ts.lastCrawl, "errors": ts.errors}
            for ts in top_sources
        ]
        if existing:
            existing.queries = queries_today
            existing.avg_latency_ms = float(p95_today) if p95_today else None
            existing.thumbs_up_rate = thumbs_up_rate_today
            existing.errors = total_errors_today
            existing.top_sources = top_sources_snapshot
            print(f"📊 Updating existing analytics entry with {len(top_sources_snapshot)} top sources")
        else:
            entry = AnalyticsDay(
                date=analytics_date,
                org_id=org_id,
                queries=queries_today,
                avg_latency_ms=float(p95_today) if p95_today else None,
                thumbs_up_rate=thumbs_up_rate_today,
                errors=total_errors_today,
                top_sources=top_sources_snapshot
            )
            db.add(entry)
            print(f"📊 Creating new analytics entry with {len(top_sources_snapshot)} top sources")
        db.commit()
        # Refresh the existing object to get the latest data from DB
        if existing:
            db.refresh(existing)
            print(f"✅ Saved top_sources to database: {len(existing.top_sources) if existing.top_sources else 0} sources")
    except Exception as e:
        print(f"Error saving analytics: {e}")
        db.rollback()
        top_sources_snapshot = None  # Reset on error

    p95_numeric = None
    if p95_today is not None:
        p95_numeric = int(p95_today)
    elif existing and existing.avg_latency_ms is not None:
        p95_numeric = int(existing.avg_latency_ms)
    
    # Prioritize top_sources from AnalyticsDay - this is the source of truth
    response_top_sources = None
    
    # First, use the snapshot we just created (most reliable since we just saved it)
    if top_sources_snapshot and len(top_sources_snapshot) > 0:
        response_top_sources = top_sources_snapshot
        print(f"✅ Using snapshot we just created: {len(response_top_sources)} sources")
    
    # If snapshot not available, try to get from today's analytics entry (after refresh)
    if not response_top_sources:
        try:
            if existing and existing.top_sources:
                if isinstance(existing.top_sources, list) and len(existing.top_sources) > 0:
                    response_top_sources = existing.top_sources
                    print(f"✅ Using top_sources from existing entry: {len(response_top_sources)} sources")
        except Exception as e:
            print(f"⚠️ Warning: Error accessing existing.top_sources: {e}")
    
    # If not found in today's entry, try latest snapshot from database
    if not response_top_sources:
        try:
            latest_snapshot = db.query(AnalyticsDay).filter(AnalyticsDay.top_sources.isnot(None)).order_by(AnalyticsDay.date.desc()).first()
            if latest_snapshot and latest_snapshot.top_sources:
                if isinstance(latest_snapshot.top_sources, list) and len(latest_snapshot.top_sources) > 0:
                    response_top_sources = latest_snapshot.top_sources
                    print(f"✅ Using top_sources from latest snapshot: {len(response_top_sources)} sources")
        except Exception as e:
            print(f"⚠️ Warning: Error accessing latest snapshot top_sources: {e}")
    
    # Fallback to calculated top_sources if no stored data found
    if not response_top_sources:
        response_top_sources = [
            {"url": ts.url, "docs": ts.docs, "lastCrawl": ts.lastCrawl, "errors": ts.errors}
            for ts in top_sources
        ]
        print(f"⚠️ Using calculated top_sources (fallback): {len(response_top_sources)} sources")
    return {
        "queriesToday": queries_today,
        "queriesYesterday": queries_yesterday,
        "p95Latency": p95_numeric,
        "thumbsUpRate": int(rate * 100),
        "crawlErrors": int(total_errors or 0),
        "tokenUsageTotal": total_token_usage,
        "tokenUsageIncomplete": token_usage_incomplete,
        "topSources": response_top_sources
    }

@router.get("/queries-over-time")
async def get_queries_over_time(
    days: int = Query(7, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    end = datetime.utcnow()
    start = _start_of_day(end) - timedelta(days=days - 1)
    series: List[Dict[str, int | str]] = []
    for i in range(days):
        day = start + timedelta(days=i)
        next_day = day + timedelta(days=1)
        count = (
            db.query(func.count(QueryLog.id))
            .filter(
                QueryLog.timestamp >= day,
                QueryLog.timestamp < next_day,
                QueryLog.user_id == current_user.id,
                QueryLog.project_id == active_project.id,
            )
            .scalar()
            or 0
        )
        series.append({"date": day.date().isoformat(), "queries": count})
    return series

@router.get("/feedback/latest")
async def get_latest_feedback(
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    messages = (
        db.query(ChatMessage)
        .filter(
            and_(
                ChatMessage.feedback.isnot(None),
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
        .all()
    )
    feedback_items = []
    for m in messages:
        feedback_items.append({
            "query": m.user_message,
            "vote": "up" if m.feedback else "down",
            "reason": None,
            "time": _format_time_ago(m.created_at)
        })
    return feedback_items

@router.get("/feedback/thumbs-up-rate")
async def get_thumbs_up_rate(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    total = (
        db.query(func.count(ChatMessage.id))
        .filter(
            and_(
                ChatMessage.feedback.isnot(None),
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .scalar()
        or 0
    )
    positive = (
        db.query(func.count(ChatMessage.id))
        .filter(
            and_(
                ChatMessage.feedback.is_(True),
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .scalar()
        or 0
    )
    negative = (
        db.query(func.count(ChatMessage.id))
        .filter(
            and_(
                ChatMessage.feedback.is_(False),
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        .scalar()
        or 0
    )
    rate = (positive / total) if total > 0 else 0.0
    percent = rate * 100.0
    return {"rate": percent, "total": total, "positive": positive, "negative": negative}

@router.get("/latency/p95-latency")
async def get_p95_latency(
    days: int = Query(1, ge=1, le=30),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    end = datetime.utcnow()
    start = _start_of_day(end) - timedelta(days=days - 1)
    avg_today = (
        db.query(func.avg(QueryLog.p95_latency))
        .filter(
            and_(
                QueryLog.p95_latency.isnot(None),
                QueryLog.timestamp >= start,
                QueryLog.user_id == current_user.id,
                QueryLog.project_id == active_project.id,
            )
        )
        .scalar()
    )
    avg_all_time = (
        db.query(func.avg(QueryLog.p95_latency))
        .filter(
            and_(
                QueryLog.p95_latency.isnot(None),
                QueryLog.user_id == current_user.id,
                QueryLog.project_id == active_project.id,
            )
        )
        .scalar()
    )
    change_percent = None
    if avg_all_time and avg_today:
        change_percent = ((float(avg_today) - float(avg_all_time)) / float(avg_all_time)) * 100.0
    series: List[QueryTimeSeriesPoint] = []
    for i in range(days):
        day = start + timedelta(days=i)
        next_day = day + timedelta(days=1)
        lat = (
            db.query(func.avg(QueryLog.p95_latency))
            .filter(
                and_(
                    QueryLog.p95_latency.isnot(None),
                    QueryLog.timestamp >= day,
                    QueryLog.timestamp < next_day,
                    QueryLog.user_id == current_user.id,
                    QueryLog.project_id == active_project.id,
                )
            )
            .scalar()
        )
        count = (
            db.query(func.count(QueryLog.id))
            .filter(
                and_(
                    QueryLog.timestamp >= day,
                    QueryLog.timestamp < next_day,
                    QueryLog.user_id == current_user.id,
                    QueryLog.project_id == active_project.id,
                )
            )
            .scalar()
            or 0
        )
        series.append(QueryTimeSeriesPoint(date=day.date().isoformat(), count=count, module=None))
    return {
        "latency": float(avg_today) if avg_today else None,
        "averageResponseTimeAllTime": float(avg_all_time) if avg_all_time else None,
        "responseTimeChangePercent": change_percent,
        "dateRange": {"start": start.isoformat(), "end": end.isoformat(), "days": days},
        "module": None,
        "timeSeries": [{"date": p.date, "queries": p.count} for p in series] if series else None
    }

@router.get("/crawl-errors")
async def get_crawl_errors(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    # Only include jobs for crawl sources owned by this user in active project
    user_source_ids_subq = (
        db.query(CrawlSource.id)
        .filter(
            and_(
                CrawlSource.created_by_id == current_user.id,
                CrawlSource.project_id == active_project.id
            )
        )
        .subquery()
    )
    jobs = (
        db.query(CrawlJob)
        .filter(CrawlJob.source_id.in_(user_source_ids_subq))
        .order_by(CrawlJob.finished_at.desc())
        .all()
    )
    errors = []
    total_errors = 0
    failed_jobs = 0
    sources_with_errors = set()
    for job in jobs:
        if job.status == CrawlJobStatus.FAILED:
            failed_jobs += 1
        if job.errors:
            err_count = len(job.errors)
            total_errors += err_count
            sources_with_errors.add(job.source_id)
            source = db.query(CrawlSource).filter(CrawlSource.id == job.source_id).first()
            errors.append({
                "source": source.name if source else "Unknown",
                "url": source.base_url if source else "",
                "errors": err_count,
                "status": job.status.value if hasattr(job.status, "value") else str(job.status),
                "time": _format_time_ago(job.finished_at or datetime.utcnow())
            })
    return errors

@router.get("/top-sources")
async def get_top_sources(
    limit: int = Query(5, ge=1, le=50),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    # active_project is injected via dependency - shows ALL historical data for this project
    
    # Prioritize top_sources from AnalyticsDay - this is the source of truth (filtered by project)
    try:
        latest = db.query(AnalyticsDay).filter(
            and_(
                AnalyticsDay.top_sources.isnot(None),
                AnalyticsDay.project_id == active_project.id
            )
        ).order_by(AnalyticsDay.date.desc()).first()
        if latest and hasattr(latest, 'top_sources') and latest.top_sources:
            if isinstance(latest.top_sources, list) and len(latest.top_sources) > 0:
                return latest.top_sources[:limit]
    except Exception as e:
        print(f"Warning: Error accessing AnalyticsDay.top_sources: {e}")
    
    # Fallback to calculating from crawl sources in active project
    sources = (
        db.query(CrawlSource)
        .filter(
            and_(
                CrawlSource.created_by_id == current_user.id,
                CrawlSource.project_id == active_project.id
            )
        )
        .all()
    )
    top_sources: List[TopSource] = []
    for s in sources:
        docs_count = db.query(func.count(Document.id)).filter(Document.source_id == s.id).scalar() or 0
        last_crawl = _format_time_ago(s.last_crawl_at) if getattr(s, "last_crawl_at", None) else "Never"
        failed_jobs = db.query(CrawlJob).filter(
            CrawlJob.source_id == s.id,
            CrawlJob.status == CrawlJobStatus.FAILED
        ).all()
        errors_count = sum(len(job.errors) if job.errors else 0 for job in failed_jobs)
        domain = urlparse(s.base_url).netloc or s.base_url
        top_sources.append(TopSource(url=domain, docs=docs_count, lastCrawl=last_crawl, errors=errors_count))
    top_sources = sorted(top_sources, key=lambda x: x.docs, reverse=True)[:limit]
    return [
        {"url": ts.url, "docs": ts.docs, "lastCrawl": ts.lastCrawl, "errors": ts.errors}
        for ts in top_sources
    ]
