"""
RAG API routes - Search and Chat endpoints
"""
import os
import time
import uuid
import asyncio
import hashlib
from pathlib import Path
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, HTTPException, UploadFile, File, status, Depends, Query, Body, Request, BackgroundTasks
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Tuple, Set
from sqlalchemy.orm import Session
from sqlalchemy import and_, not_, or_, inspect as sa_inspect, text, func
import functools
import logging
import json
import re
import csv
import io

from app.schemas import (
    RagQuery, ChatMessageRequest, ChatMessageOut, ChatMessageHistoryListOut,
    RagDefaultsResponse, FeedbackRequest, PromptRequest, PromptUpdateRequest,
    ResponseConfigOut, ResponseConfigUpdate, ResponseType
)
from ..settings import settings

# Workaround for OpenTelemetry ReadableLogRecord import error
# Disable OpenTelemetry SDK proactively to prevent import errors
# Set multiple environment variables to ensure OpenTelemetry is disabled
os.environ["OTEL_SDK_DISABLED"] = "true"
os.environ["OTEL_PYTHON_DISABLED_INSTRUMENTATIONS"] = "all"
os.environ["MISTRAL_TELEMETRY_ENABLED"] = "false"

# Patch OpenTelemetry imports to prevent errors
import sys
try:
    from opentelemetry.sdk._logs import ReadableLogRecord
except ImportError:
    # Create a dummy class to prevent import errors
    class ReadableLogRecord:
        pass
    # Inject into sys.modules to prevent future import attempts
    try:
        import opentelemetry.sdk._logs as otel_logs_module
        if not hasattr(otel_logs_module, 'ReadableLogRecord'):
            otel_logs_module.ReadableLogRecord = ReadableLogRecord
    except Exception:
        pass  # If module doesn't exist, that's fine

from ..db import get_db
from ..auth import get_current_user_required, get_current_user_or_api_key, get_active_project, get_project_id_or_user
from ..limiter import limiter
from ..services.audit_service import emit_audit
from ..services.llm_error_messages import format_llm_error_for_user
from ..utils.csv_export import sanitize_csv_cell
from ..services.chat_token_budget import apply_dense_language_chat_budget
from ..services.llmconn import LLMFactory
from ..services.rag.source_display_config import (
    display_sources_min_chunk_similarity_pct,
)
from ..services.source_display_titles import clean_doc_title
from ..services.document_content_urls import document_content_api_path
from ..services.source_display_policy import (
    chunk_passes_source_relevance,
    chunk_source_haystack,
    effective_source_similarity_floor,
    query_anchor_hit_count,
)
from ..models import (
    User,
    ChatMessage,
    APIKey,
    QueryMode,
    QueryLog,
    Project,
    ChatbotSettings,
    SearchSettings,
    ModelConfigProfile,
)

# ---------------- Configuration ----------------
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

_SOURCE_FILE_UUID_PREFIX_RE = re.compile(
    r"([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})_",
    re.IGNORECASE,
)


def _clean_doc_title(title: str) -> str:
    return clean_doc_title(title, strip_extension=False)


def _is_chat_feedback_enabled(db: Session, project_id: uuid.UUID) -> bool:
    row = db.query(ChatbotSettings).filter(ChatbotSettings.project_id == project_id).first()
    if row is None:
        return True
    return bool(getattr(row, "feedback_enabled", True))


def _is_search_feedback_enabled(db: Session, project_id: uuid.UUID) -> bool:
    row = db.query(SearchSettings).filter(SearchSettings.project_id == project_id).first()
    if row is None:
        return True
    return bool(getattr(row, "feedback_enabled", True))


def _chat_message_history_list_out(msg: ChatMessage) -> ChatMessageHistoryListOut:
    snap = msg.execution_snapshot if isinstance(msg.execution_snapshot, dict) else {}
    tm = snap.get("timings_ms") if isinstance(snap.get("timings_ms"), dict) else {}

    def _si(v) -> Optional[int]:
        try:
            return int(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    base = ChatMessageHistoryListOut.model_validate(msg)
    return base.model_copy(
        update={
            "history_status": snap.get("status") if isinstance(snap.get("status"), str) else None,
            "history_confidence": _si(snap.get("confidence_score")),
            "history_total_ms": _si(tm.get("total_ms")),
        }
    )

# Proxy — delegates all attribute access to the singleton (no module-level instantiation)
try:
    from ..services.rag.rag import RAGPipeline
    RAG_AVAILABLE = True
except ImportError as e:
    logger.error(f"Failed to import RAGPipeline: {e}")
    RAG_AVAILABLE = False

class _PipelineProxy:
    def __getattr__(self, name):
        from ..services.rag.singleton import get_pipeline
        p = get_pipeline()
        if p is None:
            raise RuntimeError("RAGPipeline not initialized")
        return getattr(p, name)
    def __bool__(self):
        from ..services.rag.singleton import get_pipeline
        return get_pipeline() is not None

rag_pipeline = _PipelineProxy()

from ..services.session_store import get_session_store as _get_session_store


def _sessions():
    """Lazy accessor — avoids import failure if store not yet initialized at module load."""
    return _get_session_store()


def _build_session_scope(auth: dict) -> str:
    """
    Return the Redis namespace for a given auth context.
    All session-touching code MUST call this function — never inline the scope string.
      u:{user_id}     — authenticated user (JWT)
      w:{project_id}  — widget embed (UUID-entropy isolation within project)
      k:{api_key_id}  — API key auth
    """
    auth_type = auth.get("type")
    if auth_type == "widget":
        return f"w:{str(auth.get('project_id', ''))}"
    if auth_type == "api_key" and "api_key" in auth:
        return f"k:{auth['api_key'].id}"
    return f"u:{auth.get('user_id', '')}"


def _resolve_widget_chat_session_id(
    db: Session,
    project_id: uuid.UUID,
    incoming_session_id: Optional[str],
) -> str:
    """
    Resolve widget chat session ID with strict project isolation.
    - Missing/blank -> generate new UUID
    - Existing in same project chat rows -> keep
    - Otherwise -> generate new UUID (prevents cross-project/session reuse)
    """
    cleaned = (incoming_session_id or "").strip()
    if not cleaned:
        return str(uuid.uuid4())

    existing = db.query(ChatMessage.id).filter(
        and_(
            ChatMessage.project_id == project_id,
            ChatMessage.session_id == cleaned,
            ChatMessage.message_type == "chat",
        )
    ).first()
    if existing:
        return cleaned
    return str(uuid.uuid4())


def _require_project_embedded_content(
    db: Session,
    project_id: str,
    user_id: Optional[int],
    *,
    source: str = "chat",
) -> None:
    from ..services.knowledge_base_status import (
        no_embedded_content_detail,
        project_has_retrievable_content,
    )

    if project_has_retrievable_content(
        rag_pipeline.vdb, db, project_id, user_id, source=source  # type: ignore[arg-type]
    ):
        return
    raise HTTPException(
        status_code=503,
        detail=no_embedded_content_detail(db, project_id, source=source),  # type: ignore[arg-type]
    )


def _live_coverage_item_ids(db: Session, project_uuid: Optional[uuid.UUID]) -> Optional[Set[str]]:
    """Uploaded document + crawl source ids that still exist in the DB for this project."""
    if db is None or project_uuid is None:
        return None
    from ..services.reindex_service import expected_coverage_item_ids

    all_ids, _, _, _ = expected_coverage_item_ids(db, project_uuid)
    return all_ids


def _chunk_references_live_item(meta: Any, live_item_ids: Optional[Set[str]]) -> bool:
    """True when chunk metadata points at a document/crawl source that still exists."""
    if live_item_ids is None:
        return True
    if not isinstance(meta, dict):
        return False
    for key in ("document_id", "crawl_source_id", "source_id"):
        val = meta.get(key)
        if val and str(val).strip() and str(val) in live_item_ids:
            return True
    source_file = str(meta.get("source_file") or "")
    if source_file.startswith("crawl_source_"):
        crawl_id = source_file[len("crawl_source_"):]
        if crawl_id in live_item_ids:
            return True
    return False


# Create RAG router
router = APIRouter(prefix="/api/v1")

# ---------------- API Models ----------------
# ---------------- API Models ----------------
class ApiResponse(BaseModel):
    success: bool
    data: Optional[Dict[str, Any]] = None
    message: str = ""
    timestamp: str = ""
    request_id: str = ""

    model_config = {"arbitrary_types_allowed": True}

class ActivationRequest(BaseModel):
    """Request model for activation endpoints"""
    is_active: bool

class ActivationRequest(BaseModel):
    """Request model for activation endpoints"""
    is_active: bool

# ---------------- Helper Functions ----------------
def create_success_response(data: Optional[Dict[str, Any]] = None, message: str = "Operation completed successfully") -> Dict[str, Any]:
    """Create a standardized success response."""
    return {
        "success": True,
        "data": data or {},
        "message": message,
        "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "request_id": str(uuid.uuid4())
    }


def _add_dynamic_emojis(answer: str) -> str:
    """Add dynamic emojis to answer based on content and context."""
    import re
    
    if not answer or len(answer.strip()) < 10:
        return answer
    
    answer_lower = answer.lower()
    
    # Define emoji categories based on content
    emoji_map = {
        # Technical/Code related
        'code': ['💻', '⚙️', '🔧', '📝'],
        'error': ['❌', '⚠️', '🚫'],
        'success': ['✅', '🎉', '✨', '🌟'],
        'question': ['❓', '🤔', '💭'],
        'information': ['ℹ️', '📚', '📖', '📘'],
        'warning': ['⚠️', '🔔', '📢'],
        'tip': ['💡', '🎯', '🔍'],
        'data': ['📊', '📈', '📉', '📋'],
        'link': ['🔗', '🌐', '🔍'],
        'time': ['⏰', '🕐', '📅'],
        'number': ['🔢', '📊'],
        'list': ['📋', '📝', '✔️'],
    }
    
    # Detect content type and add appropriate emojis
    lines = answer.split('\n')
    enhanced_lines = []
    
    for line in lines:
        if not line.strip():
            enhanced_lines.append(line)
            continue
        
        line_lower = line.lower()
        emoji_added = False
        
        # Check for code blocks
        if '```' in line or 'code' in line_lower or 'function' in line_lower or 'class' in line_lower:
            if not line.strip().startswith('```') and not line.strip().endswith('```'):
                line = '💻 ' + line
                emoji_added = True
        
        # Check for errors
        elif any(word in line_lower for word in ['error', 'failed', 'cannot', "can't", 'unable', 'invalid']):
            if not line.strip().startswith(('❌', '⚠️', '🚫')):
                line = '❌ ' + line
                emoji_added = True
        
        # Check for success/completion
        elif any(word in line_lower for word in ['success', 'completed', 'done', 'finished', 'ready']):
            if not line.strip().startswith(('✅', '🎉', '✨')):
                line = '✅ ' + line
                emoji_added = True
        
        # Check for questions
        elif line.strip().endswith('?') or any(word in line_lower for word in ['how', 'what', 'why', 'when', 'where', 'which']):
            if not line.strip().startswith(('❓', '🤔')):
                line = '❓ ' + line
                emoji_added = True
        
        # Check for tips/important info
        elif any(word in line_lower for word in ['tip', 'note', 'important', 'remember', 'hint']):
            if not line.strip().startswith(('💡', '📌', '⚠️')):
                line = '💡 ' + line
                emoji_added = True
        
        # Check for lists/bullet points
        elif line.strip().startswith(('-', '*', '•', '1.', '2.', '3.')):
            if not line.strip().startswith(('📋', '✔️', '📝')):
                line = '📋 ' + line
                emoji_added = True
        
        # Check for URLs/links
        elif 'http' in line_lower or 'www.' in line_lower or '.com' in line_lower:
            if not line.strip().startswith(('🔗', '🌐')):
                line = '🔗 ' + line
                emoji_added = True
        
        # Check for numbers/data
        elif re.search(r'\d+', line) and ('percent' in line_lower or '%' in line or 'count' in line_lower):
            if not line.strip().startswith(('📊', '🔢')):
                line = '📊 ' + line
                emoji_added = True
        
        # Default: Add info emoji for regular content lines (but not too many)
        elif not emoji_added and len(enhanced_lines) < 3:  # Only add to first few lines
            if not any(line.strip().startswith(emoji) for emoji in ['💻', '❌', '✅', '❓', '💡', '📋', '🔗', '📊', 'ℹ️', '📚']):
                line = 'ℹ️ ' + line
                emoji_added = True
        
        enhanced_lines.append(line)
    
    result = '\n'.join(enhanced_lines)
    
    # Add a contextual emoji at the start if the answer doesn't have one
    if result and not result.strip().startswith(('💻', '❌', '✅', '❓', '💡', '📋', '🔗', '📊', 'ℹ️', '📚', '🎉', '⚠️')):
        # Choose opening emoji based on overall content
        if any(word in answer_lower for word in ['error', 'failed', 'problem', 'issue']):
            result = '⚠️ ' + result
        elif any(word in answer_lower for word in ['success', 'completed', 'done']):
            result = '✨ ' + result
        elif any(word in answer_lower for word in ['help', 'guide', 'how to']):
            result = '📚 ' + result
        else:
            result = '💬 ' + result
    
    return result

def _refine_answer(answer: str) -> str:
    """Refine answer by removing raw context markers, citations, and document references.
    Preserves Markdown formatting for beautiful frontend display."""
    import re
    
    if not answer:
        return answer
    
    # Remove document citations
    answer = re.sub(r'\[Document\s+\d+.*?\]', '', answer)
    answer = re.sub(r'CITE:\d+', '', answer)
    answer = re.sub(r'【\d+[†*]?CITE】', '', answer)
    answer = re.sub(r'\[CITE:\d+\]', '', answer)
    answer = re.sub(r'【.*?CITE.*?】', '', answer)
    answer = re.sub(r'【\d+†CITE】', '', answer)
    
    # Remove numbered citations [1], [2]
    answer = re.sub(r'\[\d+\]', '', answer)
    answer = re.sub(r'【.*?】', '', answer)

    # Remove inline parenthetical source markers the model copies from context headers
    # e.g. (Source 4), (Sources 3, 4), **(Source 1)**, [Sources 1, 2]
    answer = re.sub(
        r'(?:\*\*)?\s*[(\[]\s*sources?\s*[:#]?\s*\d+(?:\s*[,;&/]\s*\d+)*\s*[)\]](?:\*\*)?',
        '',
        answer,
        flags=re.IGNORECASE,
    )
    answer = re.sub(
        r'(?:\*\*)?\s*[(\[]\s*(?:passage|document|excerpt|chunk)\s*[:#]?\s*\d+'
        r'(?:\s*[,;&/]\s*\d+)*\s*[)\]](?:\*\*)?',
        '',
        answer,
        flags=re.IGNORECASE,
    )
    
    # Remove context markers and metadata
    answer = re.sub(r'\[.*?Relevance:.*?\]', '', answer)
    answer = re.sub(r'\[.*?ID:.*?\]', '', answer)
    
    # Remove structured URL listing sections (search-mode LLM output), not inline markdown links.
    answer = re.sub(
        r'^RELEVANT_URLS\s*:.*?(?=\n\n|\Z)',
        '',
        answer,
        flags=re.IGNORECASE | re.DOTALL | re.MULTILINE,
    )
    answer = re.sub(
        r'^URLS?\s*:\s*\n.*?(?=\n\n|\Z)',
        '',
        answer,
        flags=re.IGNORECASE | re.DOTALL | re.MULTILINE,
    )
    
    # Remove "No specific URLs were provided" messages
    answer = re.sub(r'\(No specific URLs? were provided in the context\.\)', '', answer, flags=re.IGNORECASE)
    answer = re.sub(r'No specific URLs? were provided in the context\.?', '', answer, flags=re.IGNORECASE)
    
    # Remove REFINED_ANSWERS markers
    answer = re.sub(r'REFINED_ANSWERS\s*:?\s*', '', answer, flags=re.IGNORECASE)
    answer = re.sub(r'Top Searches Found \d+:\s*', '', answer, flags=re.IGNORECASE)
    
    # Clean up empty lines but preserve Markdown structure
    lines = answer.split('\n')
    cleaned_lines = [line.rstrip() for line in lines]
    answer = '\n'.join(cleaned_lines)
    answer = re.sub(r'\n{3,}', '\n\n', answer)
    # Tidy spaces left after stripping citation markers
    answer = re.sub(r'[ \t]{2,}', ' ', answer)
    answer = re.sub(r' +([.,;:!?])', r'\1', answer)
    answer = re.sub(r'\(\s*\)', '', answer)
    
    # Remove "Answer" or "Answer:" prefix from the beginning of the text
    answer = re.sub(r'^[\s]*Answer[:.]?\s*', '', answer, flags=re.IGNORECASE | re.MULTILINE)
    # Also handle if "Answer" appears on its own line at the start
    answer = re.sub(r'^[\s]*Answer[\s]*\n', '', answer, flags=re.IGNORECASE | re.MULTILINE)
    
    return answer.strip()


# Canonical out-of-context copy (must stay aligned with /search handling).
RAG_OUT_OF_CONTEXT_MSG = (
    "I am sorry, this query is out of the context of the provided documents."
)
RAG_OUT_OF_CONTEXT_PHRASE = "out of the context of the provided documents"
# Keep in sync with RAG.OUT_OF_CONTEXT_SENTINEL / RAG.query out-of-context detection.
RAG_OOC_SENTINEL = "QUERY_OUT_OF_CONTEXT"
# Keep in sync with RAG.PRIVACY_BLOCK_MSG
RAG_PRIVACY_BLOCK_MSG = (
    "I cannot share sensitive personal or financial details from uploaded documents."
)
# Answer wording that means the topic is absent from indexed docs (hide misleading sources).
_CHAT_SOURCES_NOT_IN_DOCS_PHRASES = (
    "do not mention",
    "does not mention",
    "don't mention",
    "not mentioned in",
    "not referenced in",
    "is not referenced",
    "not in the provided",
    "not in my documents",
    "not in your documents",
    "not found in the provided",
    "no mention of",
)
# Refusals where the model declines without citing docs (hide misleading sources).
_CHAT_INSUFFICIENT_INFO_PHRASES = (
    "don't have enough information",
    "do not have enough information",
    "not have enough information",
    "cannot provide an answer",
    "can't provide an answer",
    "unable to provide an answer",
    "cannot answer based on",
    "can't answer based on",
    "unable to answer based on",
    "no relevant information",
    "information is not available",
    "keine antwort geben",
    "auf der grundlage der verfügbaren informationen keine",
    "nicht genug informationen",
    "nicht über genügend informationen",
)


def _chat_answer_denies_document_coverage(answer_for_policy: Optional[str]) -> bool:
    """True when the assistant says the topic is not covered by uploaded materials."""
    text = (answer_for_policy or "").lower()
    if not text.strip():
        return False
    from ..services.source_display_policy import NOT_IN_DOCS_PHRASES

    return any(phrase in text for phrase in NOT_IN_DOCS_PHRASES)


def _chat_answer_refuses_insufficient_info(answer_for_policy: Optional[str]) -> bool:
    """True when the assistant explicitly says it lacks information to answer."""
    text = (answer_for_policy or "").lower()
    if not text.strip():
        return False
    from ..services.source_display_policy import INSUFFICIENT_INFO_PHRASES

    return any(phrase in text for phrase in INSUFFICIENT_INFO_PHRASES)


def _chat_rag_max_contexts(top_k: Optional[int] = None) -> int:
    """Same cap as chat context assembly in RAG (follows saved top_k)."""
    try:
        from ..services.rag.context_limit_config import llm_context_chunk_limit

        return llm_context_chunk_limit(top_k)
    except Exception:
        return max(1, int(top_k)) if top_k is not None else 5


def _chat_sources_suppressed_by_answer(answer_for_policy: Optional[str]) -> bool:
    """True when answer text is a refusal/error we should not attach URL sources to."""
    text = answer_for_policy or ""
    if not text.strip():
        return False
    from ..services.source_display_policy import should_omit_sources_for_answer

    return should_omit_sources_for_answer(text, treat_empty_as_omit=False)


def _chat_omit_sources_by_policy(
    answer_raw: Optional[str],
    answer_refined: Optional[str] = None,
) -> bool:
    """Omit URL sources when there is no substantive answer or a refusal/error message."""
    raw = (answer_raw or "").strip()
    ref = (answer_refined or "").strip()
    if not raw and not ref:
        return True
    if raw and _chat_sources_suppressed_by_answer(answer_raw or ""):
        return True
    if answer_refined is not None and ref and _chat_sources_suppressed_by_answer(answer_refined):
        return True
    return False


def _slice_chat_retrieval_for_sources(
    raw_contexts: Any,
    raw_contexts_metadatas: Any,
    chunk_similarity_pct: Any,
    *,
    top_k: Optional[int] = None,
) -> tuple:
    """
    Only surface sources for chunks that could appear in the chat LLM prompt
    (first top_k non-empty retrievals, capped by RAG_MAX_CONTEXTS), aligned with RAG.query.
    """
    limit = _chat_rag_max_contexts(top_k)
    if not raw_contexts:
        ctx_list: List[Any] = []
    elif isinstance(raw_contexts, list):
        ctx_list = raw_contexts
    else:
        ctx_list = list(raw_contexts)

    if not raw_contexts_metadatas:
        meta_list: List[Any] = []
    elif isinstance(raw_contexts_metadatas, list):
        meta_list = raw_contexts_metadatas
    else:
        meta_list = list(raw_contexts_metadatas)

    ctx_s = ctx_list[:limit]
    meta_s = meta_list[:limit]
    sim_s: Any = chunk_similarity_pct
    if isinstance(chunk_similarity_pct, list):
        sim_s = chunk_similarity_pct[:limit]
    return ctx_s, meta_s, sim_s


def _chunk_similarity_meets_display_floor(
    idx: int,
    chunk_similarity_pct: Any,
    floor_pct: int,
) -> bool:
    if floor_pct <= 0:
        return True
    # Explicit numeric score for this index — enforce the floor.
    if isinstance(chunk_similarity_pct, list) and 0 <= idx < len(chunk_similarity_pct):
        val = chunk_similarity_pct[idx]
        try:
            vi = int(val)
        except (TypeError, ValueError):
            return False
        return vi >= floor_pct
    # Scores missing (common on some retrieval paths): do NOT fail closed.
    # Query/answer overlap remains the accuracy gate; hiding every source while
    # still answering from those chunks left the UI with empty Sources.
    return True


def _chat_sources_for_response(
    answer_for_policy: Optional[str],
    raw_contexts: Any,
    raw_contexts_metadatas: Any,
    retrieval_meta: Any,
    *,
    chunk_similarity_pct: Any = None,
    max_urls: Optional[int] = None,
    answer_refined_for_policy: Optional[str] = None,
    user_query_for_overlap: Optional[str] = None,
    live_item_ids: Optional[Set[str]] = None,
    top_k: Optional[int] = None,
) -> Optional[List[Dict[str, str]]]:
    """
    Build chat sources from retrieval, unless the answer is a canonical refusal
    (same signals as /search).

    Source count varies by relevance: cap at top_k (or max_urls), include only
    chunks that pass relevance/similarity floors, and stop when scores drop.
    When the similarity floor would wipe every card for a grounded answer,
    recover with overlap-only gating so Sources stay visible without hurting accuracy.
    """
    if _chat_omit_sources_by_policy(answer_for_policy, answer_refined_for_policy):
        return None

    ctx_s, meta_s, sim_s = _slice_chat_retrieval_for_sources(
        raw_contexts, raw_contexts_metadatas, chunk_similarity_pct, top_k=top_k
    )
    overlap_text = (answer_refined_for_policy or "").strip() or (answer_for_policy or "").strip() or None
    effective_cap = max_urls if max_urls is not None else (top_k if top_k is not None else 5)
    try:
        effective_cap = max(1, int(effective_cap))
    except (TypeError, ValueError):
        effective_cap = 5

    build_kwargs = dict(
        chunk_similarity_pct=sim_s,
        max_urls=effective_cap,
        answer_for_overlap=overlap_text,
        user_query_for_overlap=user_query_for_overlap,
        live_item_ids=live_item_ids,
    )
    sources = _build_chat_sources_from_raw_contexts(ctx_s, meta_s, **build_kwargs)

    # Recovery: high DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT can wipe every card
    # even when the LLM answered from those chunks. Re-run with similarity floor
    # disabled while keeping query/answer overlap (accuracy gate).
    if not sources and ctx_s and meta_s:
        sources = _build_chat_sources_from_raw_contexts(
            ctx_s,
            meta_s,
            **{**build_kwargs, "chunk_similarity_pct": sim_s, "ignore_similarity_floor": True},
        )

    if not sources:
        return None
    return sources


_HTTP_URL_IN_TEXT_RE = re.compile(
    r"https?://[^\s<>\"')\]]+|www\.[^\s<>\"')\]]+",
    re.IGNORECASE,
)


def _query_text_for_source_matching(
    user_message: Optional[str],
    request: Optional[Request] = None,
) -> Optional[str]:
    """User message plus optional page URL header for source URL matching."""
    parts: List[str] = []
    if (user_message or "").strip():
        parts.append((user_message or "").strip())
    if request is not None:
        page_url = (request.headers.get("x-request-url") or "").strip()
        if page_url:
            parts.append(page_url)
    combined = " ".join(parts).strip()
    return combined or None


def _extract_http_urls_from_text(text: Optional[str]) -> List[str]:
    """Distinct HTTP(S) URLs mentioned in the user query (for source matching)."""
    if not (text or "").strip():
        return []
    from ..services.rag.utils_rag import normalize_url

    urls: List[str] = []
    seen: set = set()
    for match in _HTTP_URL_IN_TEXT_RE.findall(text or ""):
        raw = match if match.lower().startswith(("http://", "https://")) else f"https://{match}"
        normalized = normalize_url(raw)
        key = _normalize_url_for_source_match(normalized)
        if key and key not in seen:
            seen.add(key)
            urls.append(normalized)
    return urls


def _normalize_url_for_source_match(url: str) -> str:
    """Lowercase URL key for comparing crawl/page citations to query URLs."""
    from ..services.rag.utils_rag import normalize_url

    u = normalize_url((url or "").strip()).rstrip("/").lower()
    if u.startswith("https://www."):
        return "https://" + u[12:]
    if u.startswith("http://www."):
        return "http://" + u[11:]
    return u


def _urls_match_for_source(a: str, b: str) -> bool:
    na = _normalize_url_for_source_match(a)
    nb = _normalize_url_for_source_match(b)
    return bool(na and nb and na == nb)


def _chunk_similarity_score(idx: int, chunk_similarity_pct: Any) -> int:
    if isinstance(chunk_similarity_pct, list) and 0 <= idx < len(chunk_similarity_pct):
        try:
            return int(chunk_similarity_pct[idx])
        except (TypeError, ValueError):
            pass
    return max(0, 100 - idx)


def _citation_from_chunk_meta(meta: Dict[str, Any], idx: int) -> Optional[Dict[str, str]]:
    url = (meta.get("url") or "").strip()
    title = _clean_doc_title((meta.get("title") or f"Source {idx + 1}").strip())
    source_file = (meta.get("source_file") or "")
    source_file_name = os.path.basename(str(source_file))
    source_type = str(meta.get("source_type") or "").strip().lower()
    is_pdf = str(source_file).lower().endswith(".pdf")

    # Crawl chunks often store crawl_source_id in document_id — not an UploadedDocument id.
    is_crawl_chunk = source_type == "crawl" or source_file_name.lower().startswith("crawl_source_")

    citation_url = ""
    trusted_document_id: Optional[str] = None
    if not is_crawl_chunk:
        doc_id = str(meta.get("document_id") or "").strip()
        if doc_id:
            try:
                normalized_doc_id = str(uuid.UUID(doc_id)).lower()
                source_match = _SOURCE_FILE_UUID_PREFIX_RE.match(source_file_name)
                # Preserve strict trust for PDFs: only accept metadata doc_id when
                # it matches the UUID-prefixed source filename.
                if source_match:
                    if source_match.group(1).lower() == normalized_doc_id:
                        trusted_document_id = normalized_doc_id
                elif not is_pdf:
                    # For non-PDF office uploads (docx, etc.) source_file may not carry
                    # the UUID prefix, so metadata UUID is the trusted source.
                    trusted_document_id = normalized_doc_id
            except (ValueError, TypeError):
                trusted_document_id = None
        if not trusted_document_id and source_file_name:
            source_match = _SOURCE_FILE_UUID_PREFIX_RE.match(source_file_name)
            if source_match:
                try:
                    trusted_document_id = str(uuid.UUID(source_match.group(1))).lower()
                except (ValueError, TypeError):
                    trusted_document_id = None

    if trusted_document_id:
        citation_url = (document_content_api_path(trusted_document_id) or "").strip()

    if not citation_url and url.startswith(("http://", "https://")):
        citation_url = url
    elif not citation_url and url:
        # Some ingest paths store the uploaded document UUID in `url`.
        try:
            citation_url = (document_content_api_path(str(uuid.UUID(url)).lower()) or "").strip()
        except (ValueError, TypeError):
            citation_url = url

    if not citation_url:
        return None
    display_title = title or os.path.basename(source_file) or f"Source {idx + 1}"
    return {"title": display_title, "url": citation_url}


def _build_chat_sources_from_raw_contexts(
    raw_contexts: Any,
    raw_contexts_metadatas: Any,
    *,
    chunk_similarity_pct: Any = None,
    max_urls: int = 5,
    answer_for_overlap: Optional[str] = None,
    user_query_for_overlap: Optional[str] = None,
    live_item_ids: Optional[Set[str]] = None,
    ignore_similarity_floor: bool = False,
) -> Optional[List[Dict[str, str]]]:
    """
    Unique sources for chat: HTTP(S) page URLs, and uploaded documents (pdf, docx, …) via
    ``/api/v1/documents/{document_id}/content`` when ``document_id`` is a UUID in metadata.
    Optional chunk_similarity_pct (aligned with raw_contexts) gates weak chunks when
    DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT is set.
    When CHAT_SOURCES_REQUIRE_ANSWER_OVERLAP is on (default), each chunk must match the
    user query (entity tokens like "nitsan" required) in chunk text or metadata URL/title.
    Candidates are ranked by query-URL match, query anchor hits, then chunk similarity.
    """
    floor = 0 if ignore_similarity_floor else display_sources_min_chunk_similarity_pct()
    if not raw_contexts:
        raw_contexts_list: List[Any] = []
    elif isinstance(raw_contexts, list):
        raw_contexts_list = raw_contexts
    else:
        raw_contexts_list = list(raw_contexts)

    if not raw_contexts_metadatas:
        meta_list: List[Any] = []
    elif isinstance(raw_contexts_metadatas, list):
        meta_list = raw_contexts_metadatas
    else:
        meta_list = list(raw_contexts_metadatas)

    query_urls = _extract_http_urls_from_text(user_query_for_overlap)
    candidates: List[Dict[str, Any]] = []

    for idx, _ctx in enumerate(raw_contexts_list):
        meta = meta_list[idx] if idx < len(meta_list) else {}
        if not isinstance(meta, dict):
            meta = {}
        if not chunk_passes_source_relevance(
            _ctx,
            meta,
            answer=answer_for_overlap,
            user_query=user_query_for_overlap,
        ):
            continue
        haystack = chunk_source_haystack(_ctx, meta)
        chunk_floor = effective_source_similarity_floor(
            floor,
            user_query=user_query_for_overlap,
            haystack=haystack,
        )
        if not _chunk_similarity_meets_display_floor(idx, chunk_similarity_pct, chunk_floor):
            continue
        if not _chunk_references_live_item(meta, live_item_ids):
            continue

        citation = _citation_from_chunk_meta(meta, idx)
        if not citation:
            continue

        meta_url = (meta.get("url") or "").strip()
        url_match = (
            any(_urls_match_for_source(meta_url, query_url) for query_url in query_urls)
            if query_urls
            else False
        )
        is_crawl_http = meta_url.startswith(("http://", "https://")) and not str(
            meta.get("source_file") or ""
        ).lower().endswith(".pdf")
        anchor_hits = query_anchor_hit_count(user_query_for_overlap, haystack)

        candidates.append(
            {
                "source": citation,
                "score": _chunk_similarity_score(idx, chunk_similarity_pct),
                "idx": idx,
                "url_match": url_match,
                "is_crawl_http": is_crawl_http,
                "anchor_hits": anchor_hits,
            }
        )

    candidates.sort(
        key=lambda c: (
            0 if c["url_match"] else 1,
            -int(c["anchor_hits"]),
            0 if (query_urls and c["is_crawl_http"]) else 1,
            -int(c["score"]),
            int(c["idx"]),
        )
    )

    sources: List[Dict[str, str]] = []
    seen_urls: set = set()
    top_score: Optional[int] = None
    for candidate in candidates:
        citation_url = candidate["source"]["url"]
        if citation_url in seen_urls:
            continue
        score = int(candidate["score"] or 0)
        if top_score is None:
            top_score = score
        # Stop when remaining candidates are far weaker than the best hit —
        # avoids padding every answer to a fixed source count.
        elif sources and top_score > 0 and score < max(15, int(top_score * 0.55)):
            break
        seen_urls.add(citation_url)
        sources.append(candidate["source"])
        if len(sources) >= max_urls:
            break

    return sources if sources else None


CHAT_NO_SOURCES_DISCLAIMER = (
    "\n\n---\n*This answer is not backed by a cited document. "
    "Re-index files that show an embedding warning, or ask about content "
    "that is embedded with your current chat model.*"
)


def _normalize_ooc_answer_text(answer: Optional[str], raw_llm: Optional[str] = None) -> Optional[str]:
    """Replace raw QUERY_OUT_OF_CONTEXT sentinel with user-facing copy.

    Do not overwrite a resolved extractive/friendly answer just because the raw
    LLM stream contained the sentinel — that is expected after OOC fallback.
    """
    ans = (answer or "").strip()
    if ans and RAG_OOC_SENTINEL not in ans:
        return answer
    raw = (raw_llm or answer or "").strip()
    if not ans:
        if raw == RAG_OOC_SENTINEL or RAG_OOC_SENTINEL in raw:
            return RAG_OUT_OF_CONTEXT_MSG
        return answer
    if ans == RAG_OOC_SENTINEL or RAG_OOC_SENTINEL in ans:
        return RAG_OUT_OF_CONTEXT_MSG
    return answer


def _chat_has_citable_sources(sources: Any) -> bool:
    if not sources:
        return False
    if isinstance(sources, list):
        return len(sources) > 0
    return True


def _finalize_chat_answer_for_user(
    answer: Optional[str],
    sources: Any,
    *,
    raw_llm: Optional[str] = None,
    user_query: Optional[str] = None,
    context_metadatas: Any = None,
    db: Any = None,
    project_id: Any = None,
) -> Optional[str]:
    """
    Honest chat responses: friendly OOC when ungrounded; never keep
    outside-knowledge answers with only a disclaimer.
    """
    text = _normalize_ooc_answer_text(answer, raw_llm=raw_llm)
    if not text or not str(text).strip():
        return text
    if _chat_omit_sources_by_policy(text, text):
        return text
    from ..services.chat_answer_links import (
        citations_from_context_metadatas,
        enrich_chat_answer_with_verified_links,
    )

    has_sources = _chat_has_citable_sources(sources) or bool(
        citations_from_context_metadatas(context_metadatas)
    )
    if not has_sources:
        # Refuse general-knowledge answers that are not backed by retrieved docs.
        return RAG_OUT_OF_CONTEXT_MSG

    enriched = enrich_chat_answer_with_verified_links(
        text,
        sources,
        user_query=user_query,
        context_metadatas=context_metadatas,
        db=db,
        project_id=project_id,
    )
    result = enriched if enriched is not None else text
    from ..services.chat_answer_links import strip_rag_boilerplate_openers

    return strip_rag_boilerplate_openers(result)


# ---------------- Endpoints ----------------

@router.get("/config/rag-defaults")
async def get_rag_defaults():
    """Get default RAG and reranker configuration values."""
    defaults = RagDefaultsResponse(
        topK=5,
        useReranker=False,
        similarityThreshold=0.2,
        maxTokens=None
    )
    return create_success_response(
        data={"defaults": defaults.model_dump()},
        message="RAG defaults retrieved successfully"
    )

# DISABLED: legacy POST /api/v1/upload — not used by app (see check below).
# Active upload: POST /api/v1/documents/upload (documents.py, queued ingest).
#
# @router.post("/upload")
# async def upload_file(
#     request: Request,
#     files: List[UploadFile] = File(...),
#     current_user: User = Depends(get_current_user_required),
#     db: Session = Depends(get_db)
# ):
#     """Upload and embed files"""
#     logger.warning(
#         "DEPRECATED: /api/v1/upload called — use /api/v1/documents/upload instead. "
#         "This endpoint will be removed. Caller IP: %s",
#         getattr(request, "client", None) and request.client.host,
#     )
#     if not RAG_AVAILABLE or not rag_pipeline:
#         raise HTTPException(
#             status_code=503,
#             detail="RAG pipeline is not available. Please check server logs for details."
#         )
#
#     active_project = get_active_project(db, current_user.id)
#     project_id = str(active_project.id)
#     logger.info(f"📤 Uploading files for user {current_user.id} to project {project_id}")
#
#     os.makedirs("../data", exist_ok=True)
#     results = []
#
#     for file in files:
#         content = await file.read()
#         max_file_size = 50 * 1024 * 1024
#         if len(content) > max_file_size:
#             raise HTTPException(status_code=400, detail=f"File size ({len(content)} bytes) exceeds the maximum allowed limit of 50MB.")
#
#         os.makedirs("data/tmp", exist_ok=True)
#         _safe_fn = Path(file.filename or "upload").name.replace("\x00", "") or "upload"
#         save_path = f"data/tmp/{_safe_fn}"
#         with open(save_path, "wb") as f:
#             f.write(content)
#
#         from ..services.ingest_runtime import run_ingest_async
#         from ..services.rag.singleton import locked_ingest
#         from ..services.rag.embedding_resolver import resolve_for_project as _resolve_emb_for_project
#         _emb_provider, _emb_model, _emb_api_key = _resolve_emb_for_project(db, project_id, source="search")
#         ingest_timeout = max(60, settings.document_ingest_timeout_seconds)
#         result = await asyncio.wait_for(
#             run_ingest_async(
#                 locked_ingest,
#                 save_path,
#                 user_id=current_user.id,
#                 project_id=project_id,
#                 embedding_provider=_emb_provider,
#                 embedding_model=_emb_model,
#                 embedding_api_key=_emb_api_key,
#             ),
#             timeout=ingest_timeout,
#         )
#         results.append(result)
#
#     return create_success_response(
#         data={"results": results, "count": len(results)},
#         message=f"{len(results)} file(s) embedded successfully"
#     )

def _column_exists_in_table(db: Session, table_name: str, column_name: str) -> bool:
    """
    Check if a column exists in a database table.
    Returns True if column exists, False otherwise.
    """
    try:
        inspector = sa_inspect(db.bind)
        columns = [col['name'] for col in inspector.get_columns(table_name)]
        return column_name in columns
    except Exception as e:
        logger.warning(f"Could not inspect {table_name} table: {e}")
        return False  # Default to False (column doesn't exist) on error


def _load_conversation_history(
    db: Session,
    *,
    session_id: str,
    project_id: uuid.UUID,
    message_type: str,
    include_hidden_from_widget: bool = True,
    max_messages: int = 12,
) -> List[Dict[str, str]]:
    """
    Load recent conversation turns from ChatMessage rows and return in prompt format.
    Returns ordered turns as: [{"type": "user|assistant", "content": "..."}].
    """
    if not session_id or not project_id:
        return []

    try:
        query = db.query(ChatMessage).filter(
            and_(
                ChatMessage.session_id == session_id,
                ChatMessage.project_id == project_id,
                ChatMessage.message_type == message_type,
            )
        )
        if not include_hidden_from_widget and _column_exists_in_table(db, "chat_messages", "hidden_from_widget"):
            query = query.filter(ChatMessage.hidden_from_widget == False)

        # Fetch newest first for efficiency, then restore chronological order.
        existing = query.order_by(ChatMessage.created_at.desc()).limit(max_messages).all()
        existing = list(reversed(existing))

        turns: List[Dict[str, str]] = []
        for msg in existing:
            if msg.user_message and msg.user_message.strip():
                turns.append({"type": "user", "content": msg.user_message.strip()})
            if msg.assistant_response and msg.assistant_response.strip():
                turns.append({"type": "assistant", "content": msg.assistant_response.strip()})
        return turns
    except Exception as e:
        logger.warning(f"Failed to load conversation history for session {session_id}: {e}")
        return []

# Plural collective references — user means ALL recently discussed entities, not one.
_PLURAL_COLLECTIVE_RE = re.compile(
    r'\b(?:them|these|those|both)\b',
    re.IGNORECASE,
)

# Anaphoric references that may need clarification when referent is unclear.
_AMBIGUOUS_REF_RE = re.compile(
    r'\b(?:'
    r'he|she|they|them|him|her|his|hers|their|theirs|'
    r'it|its|itself|'
    r'one|ones|other|others|another|'
    r'this|that|these|those'
    r')\b',
    re.IGNORECASE,
)

# Distinct named entities / topics in recent history (proper nouns, multi-word names, phases).
_ENTITY_TOKEN_RE = re.compile(
    r'\b(?:'
    r'[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]+(?:\s+[A-ZÄÖÜ][A-Za-zäöüßÄÖÜ-]+)*'
    r'|Phase\s+\d+'
    r')\b',
    re.UNICODE,
)

_AMBIGUITY_ENTITY_STOPWORDS = frozenset({
    "I", "The", "This", "That", "These", "Those", "What", "Who", "When", "Where",
    "Why", "How", "Which", "You", "Your", "We", "They", "It", "He", "She", "If",
    "In", "On", "At", "As", "Or", "And", "But", "For", "Not", "Are", "Was", "Were",
    "Is", "Be", "Can", "Could", "Would", "Should", "May", "Might", "Will", "Do",
    "Does", "Did", "Have", "Has", "Had", "Please", "Thanks", "Thank", "Hello", "Hi",
    "Der", "Die", "Das", "Den", "Dem", "Des", "Ein", "Eine", "Einer", "Einem",
    "Sie", "Ihr", "Ihre", "Wir", "Was", "Wer", "Wie", "Wo", "Wann", "Warum",
    "Ich", "Du", "Er", "Es", "Und", "Oder", "Aber", "Für", "Mit", "Von", "Zu",
    "Bei", "Nach", "Aus", "Auf", "Als", "Auch", "Nicht", "Nur", "Noch", "Sehr",
    "Here", "There", "Yes", "No", "Ok", "Okay",
})

# Content tokens for topic-shift / same-utterance antecedent (lowercase-safe).
_CONTENT_TOKEN_RE = re.compile(r"[A-Za-zÄÖÜäöüß]{3,}", re.UNICODE)
_CONTENT_STOPWORDS = frozenset({
    "the", "and", "for", "are", "was", "were", "been", "being", "have", "has", "had",
    "does", "did", "doing", "will", "would", "could", "should", "shall", "may", "might",
    "must", "can", "need", "also", "just", "about", "from", "with", "into", "onto",
    "over", "under", "than", "then", "that", "this", "these", "those", "them", "they",
    "their", "there", "here", "what", "when", "where", "which", "who", "whom", "why",
    "how", "you", "your", "yours", "our", "ours", "its", "his", "her", "hers",
    "please", "tell", "more", "some", "any", "all", "each", "every", "both", "few",
    "many", "much", "such", "only", "own", "same", "other", "another", "very",
    "really", "explain", "describe", "give", "show", "say", "said", "know", "think",
    "like", "want", "need", "use", "used", "using", "make", "made", "get", "got",
    "let", "yes", "yeah", "yep", "no", "not", "nor", "but", "yet", "too", "out",
    "off", "up", "down", "again", "further", "once", "because", "while", "during",
    "before", "after", "above", "below", "between", "through", "against", "without",
    "within", "along", "across", "behind", "beyond", "plus", "via", "per", "etc",
    "hello", "thanks", "thank", "okay", "ok", "well", "still", "already", "even",
    "something", "anything", "everything", "someone", "anyone", "everyone",
    "question", "answer", "information", "detail", "details", "thing", "things",
})


def _extract_entities_from_text(text: str) -> List[str]:
    """Named entities / topics explicitly mentioned in a single text."""
    entities: Dict[str, str] = {}
    for match in _ENTITY_TOKEN_RE.finditer(text or ""):
        token = match.group(0).strip()
        if token in _AMBIGUITY_ENTITY_STOPWORDS:
            continue
        if " " not in token and len(token) < 5 and not token.isupper():
            continue
        key = token.lower()
        if key not in entities:
            entities[key] = token
    return list(entities.values())


def _content_tokens(text: str) -> Set[str]:
    """Lowercased content tokens for topic overlap (ignores stopwords/pronouns)."""
    out: Set[str] = set()
    for match in _CONTENT_TOKEN_RE.finditer(text or ""):
        token = match.group(0).lower()
        if token in _CONTENT_STOPWORDS:
            continue
        if len(token) < 3:
            continue
        out.add(token)
    return out


def _message_names_explicit_entity(user_message: str) -> bool:
    """True when the user names a concrete entity/topic in the message itself."""
    return bool(_extract_entities_from_text(user_message))


def _message_has_same_utterance_antecedent(user_message: str) -> bool:
    """True when a pronoun is bound to a topical noun phrase earlier in THIS message.

    Example: "is online voting system futuristic? also explain how it can be used?"
    — "it" refers to "online voting system", not prior chat turns.

    Requires at least two content tokens before the pronoun so bare follow-ups like
    "Who is responsible for it?" / "Who operates them?" still need history.
    """
    if not user_message:
        return False
    for match in _AMBIGUOUS_REF_RE.finditer(user_message):
        prefix_tokens = _content_tokens(user_message[: match.start()])
        if len(prefix_tokens) >= 2:
            return True
    return False


def _message_has_ambiguous_reference(user_message: str) -> bool:
    """True for anaphoric refs (it/they/this/…) but not explicit entity questions."""
    if not _AMBIGUOUS_REF_RE.search(user_message):
        return False
    if _message_names_explicit_entity(user_message):
        return False
    # Same-message antecedent: query is already self-contained.
    if _message_has_same_utterance_antecedent(user_message):
        return False
    return True


def _message_has_plural_collective_reference(user_message: str) -> bool:
    """True when the message uses a plural pronoun that refers to a group of entities."""
    return bool(_PLURAL_COLLECTIVE_RE.search(user_message))


def _is_topic_shift(user_message: str, history: List[Dict[str, str]]) -> bool:
    """True when the new user turn introduces a topic largely absent from recent history.

    Prevents grafting prior-turn entities (e.g. NITSAN) onto an unrelated question
    (e.g. online voting system) via contextualization or answer-history prompting.
    """
    if not history:
        return False
    msg_tokens = _content_tokens(user_message)
    if len(msg_tokens) < 2:
        return False
    hist_tokens: Set[str] = set()
    for turn in history[-6:]:
        hist_tokens |= _content_tokens(turn.get("content") or "")
    if not hist_tokens:
        return False
    overlap = msg_tokens & hist_tokens
    if not overlap:
        return True
    return (len(overlap) / len(msg_tokens)) < 0.25


def _history_for_chat_answer(
    user_message: str,
    history: List[Dict[str, str]],
) -> Optional[List[Dict[str, str]]]:
    """Conversation history for answer generation — omitted on clear topic shifts."""
    if not history:
        return None
    if _is_topic_shift(user_message, history):
        logger.info(
            "Topic shift detected — omitting conversation history for answer grounding"
        )
        return None
    return history


def _extract_salient_entities(
    history: List[Dict[str, str]],
    *,
    max_turns: int = 6,
) -> List[str]:
    """Distinct salient entities/topics mentioned in recent conversation turns."""
    if not history:
        return []
    entities: Dict[str, str] = {}
    for turn in history[-max_turns:]:
        content = (turn.get("content") or "").strip()
        if not content:
            continue
        for token in _extract_entities_from_text(content):
            key = token.lower()
            if key not in entities:
                entities[key] = token
    return list(entities.values())


def _has_multiple_referent_candidates(history: List[Dict[str, str]]) -> bool:
    """True when the user has introduced two or more distinct salient referents."""
    user_turns = [t for t in history if t.get("type") == "user"]
    return len(_extract_salient_entities(user_turns)) >= 2


def _llm_marked_ambiguous(result_text: str) -> bool:
    """True when contextualization LLM signals unresolved reference."""
    stripped = (result_text or "").strip()
    if not stripped:
        return False
    first_token = stripped.split()[0].upper().rstrip(".,;:!?\"'")
    return first_token == "AMBIGUOUS"


def _get_low_confidence_threshold() -> int:
    """Read threshold at call time so env var changes take effect without restart."""
    return int(os.environ.get("RAG_LOW_CONFIDENCE_THRESHOLD", "25"))


async def _contextualize_query(
    user_message: str,
    history: List[Dict[str, str]],
    llm_config: Optional[Dict[str, Any]],
) -> Tuple[str, bool]:
    """Rewrite user_message as a standalone question using conversation history.

    Fast path (no referential language or empty history): returns original query unchanged.
    Returns (standalone_query, is_ambiguous).
    """
    if not history or not _message_has_ambiguous_reference(user_message):
        return user_message, False

    # New topical question with little overlap to prior turns — do not graft old entities.
    if _is_topic_shift(user_message, history):
        logger.info(
            "Contextualize skipped (topic shift): keeping original query %r",
            user_message[:120],
        )
        return user_message, False

    if _has_multiple_referent_candidates(history):
        if _message_has_plural_collective_reference(user_message):
            # "them/these/those/both" with multiple entities = collective reference.
            # Let the LLM rewrite e.g. "Who operates them?" → "Who operates Konrad and Morsleben?"
            pass
        else:
            logger.info(
                "Referent ambiguity precheck: %d salient entities in recent history",
                len(_extract_salient_entities(history)),
            )
            return user_message, True

    history_text = "\n".join(
        f"{'User' if t['type'] == 'user' else 'Assistant'}: {t['content']}"
        for t in history[-6:]
    )
    prompt = (
        f"Conversation history:\n{history_text}\n\n"
        f"Rewrite the following question as a complete, self-contained question by resolving "
        f"ALL references — including pronouns (it/he/she/they) AND vague noun phrases "
        f"(e.g. 'the report', 'the law', 'Phase 2', 'that process') — using their actual "
        f"referents from the conversation history.\n"
        f"Rules:\n"
        f"- If the question introduces a NEW topic/subject that is not clearly the same as "
        f"what was just discussed, return the question UNCHANGED. Never merge unrelated "
        f"prior entities into a new topic (e.g. do not turn an 'online voting' question into "
        f"a question about a previously discussed company).\n"
        f"- If the pronoun is PLURAL (them/these/those/both) and multiple entities were "
        f"recently discussed, include ALL of those entities in the rewritten question. "
        f"Example: 'Who operates them?' with Konrad and Morsleben in history → "
        f"'Who operates Konrad and Morsleben?'\n"
        f"- For singular pronouns (it/its/this/that): identify the ACTIVE ENTITY — the "
        f"specific named thing most recently named as the SUBJECT in the assistant's last "
        f"response — and rewrite using that entity.\n"
        f"- If the user's most recently asked question itself explicitly names a specific "
        f"entity, prefer that as the referent.\n"
        f"- Only respond with exactly one word AMBIGUOUS if no active entity or group can "
        f"be clearly identified from the recent exchange.\n"
        f"- If the question is already fully self-contained, return it unchanged.\n"
        f"- Return only the rewritten question or AMBIGUOUS. No explanations.\n\n"
        f"Question: {user_message}\n"
        f"Standalone question:"
    )
    try:
        provider = (llm_config or {}).get("provider", "openai")
        model = (llm_config or {}).get("chat_model", "gpt-4")
        api_key = (llm_config or {}).get("api_key")
        llm = LLMFactory.get_llm(provider, model, api_key)
        loop = asyncio.get_running_loop()
        result = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: llm.complete(prompt)),
            timeout=10.0,
        )
        result_text = (result.text if hasattr(result, "text") else str(result)).strip()
        if _llm_marked_ambiguous(result_text):
            return user_message, True
        if not result_text or len(result_text) > max(len(user_message) * 6, 120):
            return user_message, False
        # Reject rewrites that only graft prior-turn entities onto a self-contained
        # topical question (defense in depth if early topic-shift checks are missed).
        msg_tokens = _content_tokens(user_message)
        history_tokens: Set[str] = set()
        for turn in history[-6:]:
            history_tokens |= _content_tokens(turn.get("content") or "")
        rewritten_extra = _content_tokens(result_text) - msg_tokens
        if (
            len(msg_tokens) >= 2
            and rewritten_extra
            and rewritten_extra.issubset(history_tokens)
            and not (msg_tokens & history_tokens)
        ):
            logger.info(
                "Contextualize rejected history graft onto new topic: %r -> %r",
                user_message[:80],
                result_text[:80],
            )
            return user_message, False
        logger.info(f"Query contextualized: '{user_message}' -> '{result_text}'")
        return result_text, False
    except asyncio.TimeoutError:
        logger.warning("Query contextualization timed out, using original query")
        return user_message, False
    except Exception as exc:
        logger.warning(f"Query contextualization failed, using original query: {exc}")
        return user_message, False


def _build_ambiguity_clarification(user_message: str, history: List[Dict[str, str]]) -> str:
    """Build a clarification question when a pronoun or vague reference is ambiguous."""
    return "Could you clarify who or what you're referring to? I want to make sure I give you the right answer."


_CONVERSATIONAL_REF_RE = re.compile(
    r'\b(he|she|they|them|his|her|their|hers|theirs'
    r'|this|that|these|those|it|its'
    r'|earlier|before|previously|above|mentioned|said|told|discussed)\b',
    re.IGNORECASE,
)


def _is_conversational_followup(user_message: str, history: List[Dict[str, str]]) -> bool:
    """True when message looks like a follow-up referencing prior conversation."""
    if not history:
        return False
    # Standalone topical questions (incl. same-utterance "it") are not follow-ups.
    if _message_has_same_utterance_antecedent(user_message):
        return False
    if _is_topic_shift(user_message, history):
        return False
    return bool(_CONVERSATIONAL_REF_RE.search(user_message))


def _graceful_context_loss_response() -> str:
    return (
        "I may have covered this earlier in our conversation, but it's outside my current "
        "memory window. Could you restate the specific detail you're looking for?"
    )


def _wrap_low_confidence_answer(answer: str) -> str:
    """Prepend an uncertainty caveat when retrieval confidence is low."""
    uncertainty_markers = (
        "i'm not", "i am not", "uncertain", "not sure", "don't know",
        "cannot confirm", "unclear", "limited information", "couldn't find",
    )
    if any(m in answer.lower() for m in uncertainty_markers):
        return answer
    return (
        "**Note:** The available information on this topic is limited, so this answer may be incomplete.\n\n"
        + answer
    )


def _get_chatbot_settings_query(db: Session):
    """
    Helper function to get ChatbotSettings query with proper column handling.
    Excludes columns that don't exist in the database yet.
    Note: Search-related settings (is_search_active, search_response_config, citation_formatting)
    are now stored in SearchSettings table, not ChatbotSettings.
    """
    query = db.query(ChatbotSettings)
    
    # Note: is_search_active, search_response_config, and citation_formatting for search
    # are now in SearchSettings table, not ChatbotSettings
    # Only chat-related settings remain in ChatbotSettings
    
    return query

def _column_exists_in_table(db: Session, table_name: str, column_name: str) -> bool:
    """
    Check if a column exists in a database table.
    Returns True if column exists, False otherwise.
    """
    try:
        inspector = sa_inspect(db.bind)
        columns = [col['name'] for col in inspector.get_columns(table_name)]
        return column_name in columns
    except Exception as e:
        logger.warning(f"Could not inspect {table_name} table: {e}")
        return False  # Default to False (column doesn't exist) on error

@router.post("/chat/message", response_model=Dict[str, Any])
@limiter.limit("30/minute")
async def chat_message(
    request: Request,
    req: ChatMessageRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """
    Send a message to the chatbot.
    Works for both authenticated users AND widgets (via projectId).
    """
    if not RAG_AVAILABLE or not rag_pipeline:
        logger.error("RAG pipeline is not available - chat message request failed")
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline is not available. Please check server logs for details."
        )
    
    loop = asyncio.get_event_loop()
    start_time = time.time()  # Track start time for latency calculation

    user_message = req.message.strip()
    user_message_lower = user_message.lower()

    GREETING_KEYWORDS = ["hi", "hello", "hey", "greetings"]

    is_unambiguous_greeting = (
        len(user_message.split()) <= 2 and
        any(keyword in user_message_lower for keyword in GREETING_KEYWORDS)
    )
    logger.info(f"Received chat message: {req.message}, session_id: {req.session_id}")
    
    # Extract User ID and Project ID from auth result
    user_id = auth["user_id"] # Both user and widget auth provide an associated user_id (owner)
    
    # Check Auth Type
    auth_type = auth["type"]
    api_key_id = None
    
    # If using API key, get ID
    if auth_type == "api_key":
        api_key_id = auth["api_key"].id
        
    # LOGIC CHANGE: Widget auth provides explicit project_id
    widget_project_id = None
    if auth_type == "widget":
         widget_project_id = auth["project_id"]
         req.session_id = _resolve_widget_chat_session_id(db, widget_project_id, req.session_id)

    # Basic input cleaning
    req.message = req.message.strip()
    if not req.message:
        raise HTTPException(status_code=400, detail="Empty message")

    # Generate or validate session ID
    session_id = req.session_id
    if not session_id:
        session_id = str(uuid.uuid4())

    # Build Redis scope — must be done once here and passed to all _sessions() calls.
    _scope = _build_session_scope(auth)

    # Initialize chat session if needed
    _sessions().init_if_missing(session_id, _scope)

    # Add user message to session
    user_message_id = uuid.uuid4()
    _sessions().append(session_id, _scope, {
        "id": str(user_message_id),
        "type": "user",
        "content": req.message,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # --- Project resolution logic ---
    project_id: Optional[str] = None
    active_project = None
    project_uuid = None
    
    # CASE 1: Widget Auth - Project is explicitly determined
    if widget_project_id:
        project_uuid = widget_project_id
        project_id = str(widget_project_id)
        # Verify active (already done in auth dep, but good to have object)
        if "project" in auth:
            active_project = auth["project"]
        else:
            active_project = db.query(Project).filter(Project.id == project_uuid).first()
            
    # CASE 2: API Key Auth - Use project from API key if present
    elif auth_type == "api_key" and "api_key" in auth:
         api_key = auth["api_key"]
         if hasattr(api_key, "project_id") and api_key.project_id:
            project_id = str(api_key.project_id)
            project_uuid = api_key.project_id
    
    # CASE 3: User Auth - Use active project logic (org ACL; no orphan Main Project)
    elif auth_type == "user" and user_id:
        active_project = _get_active_project(db, user_id)
        if active_project:
            project_id = str(active_project.id)
            project_uuid = active_project.id
    
    # Check if we have a custom system prompt FIRST - if so, use RAG pipeline even for greetings
    has_custom_prompt = False
    system_prompt = None
    if user_id and project_id and project_uuid:
        try:
            chatbot_settings = _get_chatbot_settings_query(db).filter(
                and_(
                    ChatbotSettings.user_id == user_id,
                    ChatbotSettings.project_id == project_uuid
                )
            ).first()
            if chatbot_settings:
                logger.info(f"Found chatbot_settings for user {user_id}, project {project_uuid}. short_description: {chatbot_settings.short_description[:100] if chatbot_settings.short_description else 'None'}...")
                # Get saved system prompt
                if hasattr(chatbot_settings, 'system_prompt') and chatbot_settings.system_prompt:
                    system_prompt = chatbot_settings.system_prompt
                    has_custom_prompt = True
                    logger.info(f"Found custom system prompt from system_prompt field for user {user_id}, project {project_uuid}")
                elif chatbot_settings.short_description and chatbot_settings.short_description.startswith("__PROMPT__"):
                    # Extract prompt from temporary storage
                    system_prompt = chatbot_settings.short_description.replace("__PROMPT__", "", 1)
                    has_custom_prompt = True
                    logger.info(f"Found custom system prompt from short_description for user {user_id}, project {project_uuid}: {system_prompt[:100]}...")
                else:
                    logger.info(f"ChatbotSettings exists but no prompt found. short_description: {chatbot_settings.short_description}")
            else:
                logger.info(f"No chatbot_settings found for user {user_id}, project {project_uuid}")
        except Exception as e:
            logger.error(f"Error retrieving chatbot_settings: {e}", exc_info=True)
    else:
        logger.info(f"Missing required IDs for prompt check: user_id={user_id}, project_id={project_id}, project_uuid={project_uuid}")
    
    # Check document count for this specific project (not all documents)
    # Skip document check for greetings with custom prompts (prompt might not need documents)
    # For regular queries or greetings without custom prompts, check documents normally
    if not is_unambiguous_greeting or not has_custom_prompt:
        # Only check if we have a project_id - if None, we can't filter properly
        if project_id:
            try:
                _require_project_embedded_content(db, project_id, user_id, source="chat")
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error checking document count for project {project_id}: {e}", exc_info=True)
                raise HTTPException(
                    status_code=503,
                    detail=f"Error checking documents: {str(e)}. Please try again later.",
                )
        else:
            logger.warning(f"No project_id available for chat message. user_id={user_id}, auth_type={auth_type}")
            raise HTTPException(
                status_code=503,
                detail="No active project found. Please create or activate a project first."
            )

    # Check if chatbot is activated (skip check for greetings only if no custom prompt)
    if not is_unambiguous_greeting or has_custom_prompt:
        is_activated = True  # Default to True
        if user_id and project_id and project_uuid:
            try:
                chatbot_settings = _get_chatbot_settings_query(db).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == project_uuid
                    )
                ).first()
                if chatbot_settings:
                    is_activated = getattr(chatbot_settings, 'is_active', True)
            except Exception as e:
                logger.warning(f"Error checking chatbot activation: {e}")
                is_activated = True  # Default to active on error
        
        if not is_activated:
            raise HTTPException(
                status_code=403,
                detail="Chatbot is currently deactivated. Please activate it to use chat features."
            )

    resp: Dict[str, Any] = {}
    llm_config_dict: Optional[Dict[str, Any]] = None
    chatbot_language: Optional[str] = None
    _chat_emb_provider: Optional[str] = None
    _chat_emb_model: Optional[str] = None
    chat_max_tokens = 800

    # If it's a greeting and we have a custom prompt, use RAG pipeline
    # Otherwise, use default greeting response (only if no custom prompt)
    if is_unambiguous_greeting and not has_custom_prompt:
        logger.info(f"Using default greeting response (is_unambiguous_greeting={is_unambiguous_greeting}, has_custom_prompt={has_custom_prompt})")
        answer = "Hello! I am an AI assistant here to help you with your documents. How can I assist you today?"
        sources = None
    else:
        if is_unambiguous_greeting and has_custom_prompt:
            logger.info(f"Greeting detected but custom prompt exists, using RAG pipeline with custom prompt: {system_prompt[:100] if system_prompt else 'None'}...")
        
        # Default chat settings
        CHAT_TOP_K = 5
        # Adaptive default: short/simple queries → 500 tokens; longer/complex → 1000 tokens.
        _query_len = len((req.message or "").strip().split())
        chat_max_tokens = 500 if _query_len <= 6 else 1000
        # Lowered from 0.5 → 0.3: 0.5 was too strict and cut many valid chunks
        chat_similarity_threshold = 0.3
        chat_use_reranker = False

        # Fetch LLM Configuration from ChatbotSettings (project-scoped)
        llm_config_dict = None
        if user_id and project_id and project_uuid:
            chatbot_settings = db.query(ChatbotSettings).filter(
                and_(
                    ChatbotSettings.user_id == user_id,
                    ChatbotSettings.project_id == project_uuid
                )
            ).first()
            if chatbot_settings:
                # Normalize provider name to ensure consistency
                provider = chatbot_settings.model_provider or ""
                provider_lower = provider.lower()
                if "custom" in provider_lower or "ollama" in provider_lower:
                    provider_normalized = "ollama"
                else:
                    provider_normalized = provider_lower

                llm_config_dict = {
                    "provider": provider_normalized,
                    "chat_model": chatbot_settings.chat_model,
                    "api_key": chatbot_settings.api_key,
                    # Chat-specific generation parameters
                    "temperature": chatbot_settings.chat_temperature,
                    "top_p": chatbot_settings.chat_top_p,
                    "best_of": chatbot_settings.chat_best_of,
                    "frequency_penalty": chatbot_settings.chat_frequency_penalty,
                    "presence_penalty": chatbot_settings.chat_presence_penalty,
                }

                # Override defaults with chat-specific RAG settings if available.
                if chatbot_settings.chat_top_k is not None:
                    CHAT_TOP_K = max(chatbot_settings.chat_top_k, 3)
                else:
                    CHAT_TOP_K = 5

                if chatbot_settings.chat_max_tokens is not None:
                    user_max_tokens = (
                        chatbot_settings.chat_max_tokens
                        if chatbot_settings.chat_max_tokens > 0
                        else None
                    )
                    if user_max_tokens is not None:
                        chat_max_tokens = max(user_max_tokens, 500)
                    else:
                        chat_max_tokens = 800
                else:
                    chat_max_tokens = 800

                # Keep chat threshold in a practical band while honoring admin defaults.
                # Cap at 0.45 max — anything higher (e.g. 0.5) filters out too many valid chunks.
                if chatbot_settings.chat_similarity_threshold is not None:
                    configured_threshold = chatbot_settings.chat_similarity_threshold
                    chat_similarity_threshold = max(0.2, min(configured_threshold, 0.45))
                    if chat_similarity_threshold != configured_threshold:
                        logger.info(
                            f"Adjusted chat similarity threshold from {configured_threshold} to "
                            f"{chat_similarity_threshold} for stable chat retrieval"
                        )
                else:
                    chat_similarity_threshold = 0.3

                if chatbot_settings.chat_use_reranker is not None:
                    chat_use_reranker = chatbot_settings.chat_use_reranker
                else:
                    chat_use_reranker = False

                logger.info(f"Using dynamic LLM config for user {user_id}: {llm_config_dict.get('provider')} / {llm_config_dict.get('chat_model')}")
                logger.info(f"Chat settings: top_k={CHAT_TOP_K}, max_tokens={chat_max_tokens}, similarity_threshold={chat_similarity_threshold}, use_reranker={chat_use_reranker}")
                # Log user-configured generation parameters
                logger.info(f"📊 User-configured Chat Generation Parameters:")
                logger.info(f"   • Temperature: {chatbot_settings.chat_temperature}")
                logger.info(f"   • Top P: {chatbot_settings.chat_top_p}")
                logger.info(f"   • Best Of: {chatbot_settings.chat_best_of}")
                logger.info(f"   • Frequency Penalty: {chatbot_settings.chat_frequency_penalty}")
                logger.info(f"   • Presence Penalty: {chatbot_settings.chat_presence_penalty}")

        # Check if chatbot is activated
        is_activated = True  # Default to True
        if user_id and project_id and project_uuid:
            try:
                chatbot_settings = _get_chatbot_settings_query(db).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == project_uuid
                    )
                ).first()
                if chatbot_settings:
                    is_activated = getattr(chatbot_settings, 'is_active', True)
            except Exception as e:
                logger.warning(f"Error checking chatbot activation: {e}")
                is_activated = True  # Default to active on error
        
        if not is_activated:
            raise HTTPException(
                status_code=403,
                detail="Chatbot is currently deactivated. Please activate it to use chat features."
            )
        
        # Fetch Chatbot Settings for project to get language preference
        # (system_prompt already retrieved above if needed)
        chatbot_language = None
        if user_id and project_id:
            chatbot_settings = _get_chatbot_settings_query(db).filter(
                and_(
                    ChatbotSettings.user_id == user_id,
                    ChatbotSettings.project_id == project_uuid
                )
            ).first()
            if chatbot_settings:
                if chatbot_settings.chatbot_language:
                    chatbot_language = chatbot_settings.chatbot_language
                    logger.info(f"Using language preference for user {user_id}, project {project_id}: {chatbot_language}")
                
                # system_prompt already retrieved above, just log if using it
                if system_prompt:
                    logger.info(f"Using saved system prompt for user {user_id}, project {project_id}")

        chat_max_tokens = apply_dense_language_chat_budget(chat_max_tokens, chatbot_language)
        
        # Build response-style instruction based on configured setting (no hard char clamp)
        response_style = "concise"
        if user_id and project_id and project_uuid:
            try:
                _cs = _get_chatbot_settings_query(db).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == project_uuid
                    )
                ).first()
                if _cs and hasattr(_cs, "response_style") and _cs.response_style:
                    response_style = _cs.response_style
            except Exception:
                pass

        if response_style == "detailed":
            style_instruction = "\nRESPONSE STYLE: Provide a thorough, well-structured answer. Use headers and lists where helpful.\n"
        else:
            style_instruction = "\nRESPONSE STYLE: Be concise and focused. Answer the question directly without unnecessary padding.\n"

        if system_prompt:
            system_prompt = system_prompt + style_instruction
        else:
            system_prompt = (
                "You are a helpful AI assistant. Answer questions accurately based on the provided documents.\n"
                "- Answer DIRECTLY from what the documents say — do not hedge with 'the documents don't mention' "
                "if they DO contain relevant content.\n"
                "- If documents only partially answer the question, provide what you CAN find and note what is missing.\n"
                "- Never fabricate facts not present in the documents.\n"
                "- Always finish your final sentence completely; never stop mid-word or mid-sentence.\n"
                "Format your response using clean Markdown: ### headers, - bullet lists, **bold** for key terms."
            ) + style_instruction

        # Hydrate session from DB when needed so follow-up answers include
        # prior turns even after process restarts or Redis eviction.
        _current_msgs = _sessions().get(session_id, _scope) or []
        if not _current_msgs[:-1] and project_uuid:
            hydrated_history = _load_conversation_history(
                db,
                session_id=session_id,
                project_id=project_uuid,
                message_type="chat",
                include_hidden_from_widget=(auth_type != "widget"),
                max_messages=20,
            )
            if hydrated_history:
                restored_turns = []
                for turn in hydrated_history:
                    restored_turns.append(
                        {
                            "id": str(uuid.uuid4()),
                            "type": turn["type"],
                            "content": turn["content"],
                            "timestamp": datetime.now(timezone.utc).isoformat(),
                        }
                    )
                # Keep restored turns before current user message (last item).
                _sessions().set_session(
                    session_id, _scope, restored_turns + [_current_msgs[-1]]
                )

        # Build bounded recent history (last 6 turns = 3 Q+A exchanges)
        CHAT_HISTORY_TURNS = 10
        recent_history: List[Dict[str, str]] = []
        session_msgs = _sessions().get(session_id, _scope) or []
        # Exclude the current user message (last item, just appended above)
        prior_msgs = session_msgs[:-1] if session_msgs else []
        if prior_msgs:
            recent_history = [
                {"type": m["type"], "content": m["content"]}
                for m in prior_msgs[-CHAT_HISTORY_TURNS:]
                if m.get("content", "").strip()
            ]

        # Layer 1: Resolve pronouns/references before retrieval
        rag_query = req.message
        _query_is_ambiguous = False
        _last_assistant_msg = next(
            (m["content"] for m in reversed(recent_history) if m["type"] == "assistant"), None
        )
        if _last_assistant_msg and _last_assistant_msg.strip() == _build_ambiguity_clarification("", []).strip():
            # User is answering our clarification — combine original question + their reply
            _original_question = next(
                (m["content"] for m in reversed(recent_history) if m["type"] == "user"), req.message
            )
            rag_query = f"{_original_question} regarding {req.message}"
        elif recent_history:
            rag_query, _query_is_ambiguous = await _contextualize_query(
                req.message, recent_history, llm_config_dict
            )

        if _query_is_ambiguous:
            answer = _build_ambiguity_clarification(req.message, recent_history)
            sources = []
            resp = {}
        else:
            # Resolve the embedding model the project has chosen (chat path → ChatbotSettings).
            from ..services.rag.embedding_resolver import resolve_for_project as _resolve_embedding_for_project
            _chat_emb_provider, _chat_emb_model, _chat_emb_api_key = _resolve_embedding_for_project(
                db, project_id, source="chat"
            )

            _answer_history = _history_for_chat_answer(req.message, recent_history)

            query_fn = functools.partial(
                rag_pipeline.query,
                query=rag_query,
                top_k=CHAT_TOP_K,
                max_tokens=chat_max_tokens,
                generate_topk=False,
                user_id=user_id,
                project_id=project_id,
                llm_config=llm_config_dict,
                system_prompt=system_prompt,
                language_code=chatbot_language,
                similarity_threshold=chat_similarity_threshold,
                use_reranker=chat_use_reranker,
                mode="chat",
                format_type="markdown",
                chat_history=_answer_history,
                embedding_provider=_chat_emb_provider,
                embedding_model=_chat_emb_model,
                embedding_api_key=_chat_emb_api_key,
            )

            try:
                from ..services.query_runtime import run_query_async

                resp = await run_query_async(query_fn)
            except Exception as e:
                logger.error(f"RAG query failed in thread executor: {e}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=format_llm_error_for_user(e),
                )
            summary_raw = resp.get("summary")
            # Refine answer: Remove raw context markers and citations
            answer = _refine_answer(summary_raw) if summary_raw else summary_raw

            # Build sources from RAG metadata (suppress when OOC / LLM error — parity with /search)
            sources = _chat_sources_for_response(
                summary_raw,
                resp.get("raw_contexts"),
                resp.get("raw_contexts_metadatas"),
                resp.get("retrieval_meta") if isinstance(resp, dict) else None,
                chunk_similarity_pct=resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None,
                answer_refined_for_policy=answer,
                user_query_for_overlap=_query_text_for_source_matching(rag_query, request),
                live_item_ids=_live_coverage_item_ids(db, project_uuid),
                top_k=CHAT_TOP_K,
            )

            # Layer 2: Confidence-based caveat for weak retrieval
            _retrieval_meta = resp.get("retrieval_meta", {}) if isinstance(resp, dict) else {}
            _confidence = _retrieval_meta.get("confidence_score", 100)
            if isinstance(_confidence, (int, float)) and _confidence < _get_low_confidence_threshold() and answer:
                answer = _wrap_low_confidence_answer(answer)

            # Fix 2: Graceful context-loss — replace flat OOC denial with honest
            # memory-window message when query looks like a conversational follow-up.
            if (
                answer
                and (RAG_OOC_SENTINEL in (summary_raw or "") or RAG_OUT_OF_CONTEXT_PHRASE in answer.lower())
                and _is_conversational_followup(req.message, recent_history)
            ):
                answer = _graceful_context_loss_response()

            answer = _finalize_chat_answer_for_user(
                answer,
                sources,
                raw_llm=summary_raw,
                user_query=rag_query,
                context_metadatas=resp.get("raw_contexts_metadatas")
                if isinstance(resp, dict)
                else None,
                db=db,
                project_id=project_uuid,
            )

    assistant_message_id = uuid.uuid4()
    _sessions().append(session_id, _scope, {
        "id": str(assistant_message_id),
        "type": "assistant",
        "content": answer,
        "timestamp": datetime.now(timezone.utc).isoformat()
    })

    # project_uuid should already be set above, but ensure it's set for database operations
    if not project_uuid and project_id:
        # Convert string project_id back to UUID for database
        try:
            project_uuid = uuid.UUID(project_id)
        except (ValueError, TypeError):
            project_uuid = None

    # Schedule DB writes as background tasks so response returns immediately
    elapsed_ms = int((time.time() - start_time) * 1000)
    token_usage = resp.get("token_usage") if isinstance(resp, dict) else {}

    def _save_chat_message():
        from ..db import SessionLocal
        from ..services.chat_execution_snapshot import build_execution_snapshot

        _db = SessionLocal()
        try:
            snap = build_execution_snapshot(
                answer=answer or "",
                session_id=session_id,
                assistant_message_id=assistant_message_id,
                chatbot_language=chatbot_language,
                retrieval_meta=resp.get("retrieval_meta") if isinstance(resp, dict) else {},
                token_usage=token_usage,
                raw_contexts=resp.get("raw_contexts") if isinstance(resp, dict) else None,
                raw_contexts_metadatas=resp.get("raw_contexts_metadatas") if isinstance(resp, dict) else None,
                raw_chunk_similarity_pct=resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None,
                llm_config_dict=llm_config_dict,
                effective_rag_params={
                    "top_k": CHAT_TOP_K,
                    "similarity_threshold": chat_similarity_threshold,
                    "use_reranker": chat_use_reranker,
                    "max_tokens": chat_max_tokens,
                },
                embedding_provider=_chat_emb_provider,
                embedding_model=_chat_emb_model,
                project_id=project_id,
                total_ms=elapsed_ms,
                stage_timings_ms=resp.get("stage_timings_ms") if isinstance(resp, dict) else None,
                is_default_greeting=bool(is_unambiguous_greeting and not has_custom_prompt),
            )
            if project_uuid:
                chat_msg = ChatMessage(
                    id=uuid.uuid4(),
                    user_id=user_id,
                    project_id=project_uuid,
                    session_id=session_id,
                    message_id=assistant_message_id,
                    user_message=req.message,
                    assistant_response=answer,
                    message_type="chat",
                    sources=sources,
                    execution_snapshot=snap,
                )
                _db.add(chat_msg)
                _db.commit()
            query_log = QueryLog(
                user_id=user_id,
                apikey_id=api_key_id if api_key_id else None,
                project_id=project_uuid if project_uuid else None,
                llm_provider=(llm_config_dict or {}).get("provider"),
                llm_model=(llm_config_dict or {}).get("chat_model"),
                query=req.message,
                mode="CHAT",
                result_count=1 if answer else 0,
                p95_latency=elapsed_ms,
                prompt_tokens=token_usage.get("prompt_tokens") if token_usage else None,
                completion_tokens=token_usage.get("completion_tokens") if token_usage else None,
                total_tokens=token_usage.get("total_tokens") if token_usage else None,
                chat_message_id=assistant_message_id if project_uuid else None,
            )
            _db.add(query_log)
            _db.commit()
        except Exception as e:
            logger.error(f"Background chat DB save failed: {e}")
            _db.rollback()
        finally:
            _db.close()

    background_tasks.add_task(_save_chat_message)

    return create_success_response(
        data={
            "answer": answer,
            "sources": sources,
            "session_id": session_id,
            "message_id": str(assistant_message_id),
            "retrieval_meta": resp.get("retrieval_meta") if isinstance(resp, dict) else None,
        },
        message="Chat completed"
    )


@router.post("/chat/message/stream")
@limiter.limit("30/minute")
async def chat_message_stream(
    request: Request,
    req: ChatMessageRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """
    Streaming chat endpoint. Returns Server-Sent Events.
    Each event: data: {"token": "...", "done": false}
    Final event: data: {"token": "", "done": true, "message_id": "...", "session_id": "...",
        "sources": [...], "retrieval_meta": ..., "token_usage": ...}
    """
    _sse_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline not available")

    start_time = time.time()
    user_message = req.message.strip()
    user_message_lower = user_message.lower()
    GREETING_KEYWORDS = ["hi", "hello", "hey", "greetings"]
    is_unambiguous_greeting = (
        len(user_message.split()) <= 2
        and any(keyword in user_message_lower for keyword in GREETING_KEYWORDS)
    )

    if not user_message:
        raise HTTPException(status_code=400, detail="Empty message")

    user_id = auth["user_id"]
    auth_type = auth["type"]
    api_key_id = None
    if auth_type == "api_key" and "api_key" in auth:
        api_key_id = auth["api_key"].id

    widget_project_id = None
    if auth_type == "widget":
        widget_project_id = auth["project_id"]
        req.session_id = _resolve_widget_chat_session_id(db, widget_project_id, req.session_id)

    req.message = user_message

    session_id = req.session_id or str(uuid.uuid4())

    # Build Redis scope — must be done once here and passed to all _sessions() calls.
    _scope = _build_session_scope(auth)

    _sessions().init_if_missing(session_id, _scope)
    user_message_id = uuid.uuid4()
    _sessions().append(session_id, _scope, {
        "id": str(user_message_id),
        "type": "user",
        "content": req.message,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })

    project_id: Optional[str] = None
    active_project = None
    project_uuid = None

    if widget_project_id:
        project_uuid = widget_project_id
        project_id = str(widget_project_id)
        if "project" in auth:
            active_project = auth["project"]
        else:
            active_project = db.query(Project).filter(Project.id == project_uuid).first()
    elif auth_type == "api_key" and "api_key" in auth:
        api_key = auth["api_key"]
        if hasattr(api_key, "project_id") and api_key.project_id:
            project_id = str(api_key.project_id)
            project_uuid = api_key.project_id
    elif auth_type == "user" and user_id:
        active_project = _get_active_project(db, user_id)
        if active_project:
            project_id = str(active_project.id)
            project_uuid = active_project.id

    has_custom_prompt = False
    system_prompt = None
    _greeting_welcome_message: Optional[str] = None
    chatbot_settings = None
    _settings_load_ms: Optional[int] = None
    _kb_ready_ms: Optional[int] = None
    if user_id and project_id and project_uuid:
        try:
            _settings_t0 = time.perf_counter()
            chatbot_settings = _get_chatbot_settings_query(db).filter(
                and_(
                    ChatbotSettings.user_id == user_id,
                    ChatbotSettings.project_id == project_uuid,
                )
            ).first()
            _settings_load_ms = max(0, int((time.perf_counter() - _settings_t0) * 1000))
            if chatbot_settings:
                if hasattr(chatbot_settings, "welcome_message") and chatbot_settings.welcome_message:
                    _greeting_welcome_message = chatbot_settings.welcome_message
                if hasattr(chatbot_settings, "system_prompt") and chatbot_settings.system_prompt:
                    system_prompt = chatbot_settings.system_prompt
                    has_custom_prompt = True
                elif chatbot_settings.short_description and chatbot_settings.short_description.startswith("__PROMPT__"):
                    system_prompt = chatbot_settings.short_description.replace("__PROMPT__", "", 1)
                    has_custom_prompt = True
        except Exception as e:
            logger.error(f"Error retrieving chatbot_settings (stream): {e}", exc_info=True)

    if not is_unambiguous_greeting or not has_custom_prompt:
        if project_id:
            try:
                _kb_t0 = time.perf_counter()
                _require_project_embedded_content(db, project_id, user_id, source="chat")
                _kb_ready_ms = max(0, int((time.perf_counter() - _kb_t0) * 1000))
            except HTTPException:
                raise
            except Exception as e:
                logger.error(f"Error checking document count for project {project_id}: {e}", exc_info=True)
                raise HTTPException(
                    status_code=503,
                    detail=f"Error checking documents: {str(e)}. Please try again later.",
                )
        else:
            logger.warning(f"No project_id available for chat stream. user_id={user_id}, auth_type={auth_type}")
            raise HTTPException(
                status_code=503,
                detail="No active project found. Please create or activate a project first.",
            )

    if not is_unambiguous_greeting or has_custom_prompt:
        is_activated = True
        if chatbot_settings is not None:
            is_activated = getattr(chatbot_settings, "is_active", True)
        if not is_activated:
            raise HTTPException(
                status_code=403,
                detail="Chatbot is currently deactivated. Please activate it to use chat features.",
            )

    llm_config_dict: Optional[Dict[str, Any]] = None

    if is_unambiguous_greeting:
        answer = (
            _greeting_welcome_message
            or "Hello! I am an AI assistant here to help you with your documents. "
            "How can I assist you today?"
        )
        sources = None
        assistant_message_id = uuid.uuid4()

        async def _greeting_stream():
            yield f"data: {json.dumps({'token': answer, 'done': False})}\n\n"
            _sessions().append(session_id, _scope, {
                "id": str(assistant_message_id),
                "type": "assistant",
                "content": answer,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })
            elapsed_ms = int((time.time() - start_time) * 1000)

            def _save_greeting():
                from ..db import SessionLocal
                from ..services.chat_execution_snapshot import build_execution_snapshot

                _db = SessionLocal()
                try:
                    snap = build_execution_snapshot(
                        answer=answer or "",
                        session_id=session_id,
                        assistant_message_id=assistant_message_id,
                        chatbot_language=None,
                        retrieval_meta={},
                        token_usage={},
                        raw_contexts=None,
                        raw_contexts_metadatas=None,
                        raw_chunk_similarity_pct=None,
                        llm_config_dict=llm_config_dict,
                        effective_rag_params={
                            "top_k": 5,
                            "similarity_threshold": 0.5,
                            "use_reranker": False,
                            "max_tokens": 800,
                        },
                        embedding_provider=None,
                        embedding_model=None,
                        project_id=project_id,
                        total_ms=elapsed_ms,
                        is_default_greeting=True,
                    )
                    if project_uuid:
                        _db.add(
                            ChatMessage(
                                id=uuid.uuid4(),
                                user_id=user_id,
                                project_id=project_uuid,
                                session_id=session_id,
                                message_id=assistant_message_id,
                                user_message=req.message,
                                assistant_response=answer,
                                message_type="chat",
                                sources=sources,
                                execution_snapshot=snap,
                            )
                        )
                        _db.commit()
                    _db.add(
                        QueryLog(
                            user_id=user_id,
                            apikey_id=api_key_id if api_key_id else None,
                            project_id=project_uuid if project_uuid else None,
                            llm_provider=(llm_config_dict or {}).get("provider"),
                            llm_model=(llm_config_dict or {}).get("chat_model"),
                            query=req.message,
                            mode="CHAT",
                            result_count=1 if answer else 0,
                            p95_latency=elapsed_ms,
                            prompt_tokens=None,
                            completion_tokens=None,
                            total_tokens=None,
                            chat_message_id=assistant_message_id if project_uuid else None,
                        )
                    )
                    _db.commit()
                except Exception as e:
                    logger.error(f"Stream greeting DB save failed: {e}")
                    _db.rollback()
                finally:
                    _db.close()

            _save_greeting()
            done_payload: Dict[str, Any] = {
                "token": "",
                "done": True,
                "message_id": str(assistant_message_id),
                "session_id": session_id,
                "retrieval_meta": None,
                "sources": [],
                "token_usage": {},
                "final_answer": answer,
                "answer_updated": False,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"

        return StreamingResponse(
            _greeting_stream(),
            media_type="text/event-stream; charset=utf-8",
            headers=_sse_headers,
        )

    CHAT_TOP_K = 5
    # Adaptive default: short/simple queries → 500 tokens; longer/complex → 1000 tokens.
    _stream_query_len = len((req.message or "").strip().split())
    chat_max_tokens = 500 if _stream_query_len <= 6 else 1000
    # Lowered from 0.5 → 0.3: 0.5 was too strict and cut many valid chunks
    chat_similarity_threshold = 0.3
    chat_use_reranker = False

    if chatbot_settings is not None:
        provider = chatbot_settings.model_provider or ""
        provider_lower = provider.lower()
        if "custom" in provider_lower or "ollama" in provider_lower:
            provider_normalized = "ollama"
        else:
            provider_normalized = provider_lower
        llm_config_dict = {
            "provider": provider_normalized,
            "chat_model": chatbot_settings.chat_model,
            "api_key": chatbot_settings.api_key,
            "temperature": chatbot_settings.chat_temperature,
            "top_p": chatbot_settings.chat_top_p,
            "best_of": chatbot_settings.chat_best_of,
            "frequency_penalty": chatbot_settings.chat_frequency_penalty,
            "presence_penalty": chatbot_settings.chat_presence_penalty,
        }
        if chatbot_settings.chat_top_k is not None:
            CHAT_TOP_K = max(chatbot_settings.chat_top_k, 3)
        else:
            CHAT_TOP_K = 5
        if chatbot_settings.chat_max_tokens is not None:
            user_max_tokens = (
                chatbot_settings.chat_max_tokens
                if chatbot_settings.chat_max_tokens > 0
                else None
            )
            if user_max_tokens is not None:
                chat_max_tokens = max(user_max_tokens, 500)
            else:
                chat_max_tokens = 500 if _stream_query_len <= 6 else 1000
        else:
            chat_max_tokens = 500 if _stream_query_len <= 6 else 1000
        if chatbot_settings.chat_similarity_threshold is not None:
            configured_threshold = chatbot_settings.chat_similarity_threshold
            chat_similarity_threshold = max(0.2, min(configured_threshold, 0.45))
        else:
            chat_similarity_threshold = 0.3
        if chatbot_settings.chat_use_reranker is not None:
            chat_use_reranker = chatbot_settings.chat_use_reranker
        else:
            chat_use_reranker = False

    is_activated = True
    if chatbot_settings is not None:
        is_activated = getattr(chatbot_settings, "is_active", True)
    if not is_activated:
        raise HTTPException(
            status_code=403,
            detail="Chatbot is currently deactivated. Please activate it to use chat features.",
        )

    chatbot_language = None
    if chatbot_settings is not None and chatbot_settings.chatbot_language:
        chatbot_language = chatbot_settings.chatbot_language

    chat_max_tokens = apply_dense_language_chat_budget(chat_max_tokens, chatbot_language)

    response_style = "concise"
    if chatbot_settings is not None and hasattr(chatbot_settings, "response_style") and chatbot_settings.response_style:
        response_style = chatbot_settings.response_style

    if response_style == "detailed":
        style_instruction = "\nRESPONSE STYLE: Provide a thorough, well-structured answer. Use headers and lists where helpful.\n"
    else:
        style_instruction = "\nRESPONSE STYLE: Be concise and focused. Answer the question directly without unnecessary padding.\n"

    if system_prompt:
        system_prompt = system_prompt + style_instruction
    else:
        system_prompt = (
            "You are a helpful AI assistant. Answer questions based on the provided context.\n"
            "- If the user's question is unclear or refers to something not in the context, "
            "ask a clarifying question instead of guessing.\n"
            "- If information is insufficient, acknowledge uncertainty explicitly.\n"
            "- Never fabricate facts not present in the context.\n"
            "Format your response using clean Markdown headers (###), lists (-), and bold text (**) for readability."
        ) + style_instruction

    _stream_msgs = _sessions().get(session_id, _scope) or []
    if not _stream_msgs[:-1] and project_uuid:
        hydrated_history = _load_conversation_history(
            db,
            session_id=session_id,
            project_id=project_uuid,
            message_type="chat",
            include_hidden_from_widget=(auth_type != "widget"),
            max_messages=12,
        )
        if hydrated_history:
            restored_turns = []
            for turn in hydrated_history:
                restored_turns.append({
                    "id": str(uuid.uuid4()),
                    "type": turn["type"],
                    "content": turn["content"],
                    "timestamp": datetime.now(timezone.utc).isoformat(),
                })
            _sessions().set_session(
                session_id, _scope, restored_turns + [_stream_msgs[-1]]
            )

    CHAT_HISTORY_TURNS = 6
    recent_history: List[Dict[str, str]] = []
    session_msgs = _sessions().get(session_id, _scope) or []
    prior_msgs = session_msgs[:-1] if session_msgs else []
    if prior_msgs:
        recent_history = [
            {"type": m["type"], "content": m["content"]}
            for m in prior_msgs[-CHAT_HISTORY_TURNS:]
            if m.get("content", "").strip()
        ]

    assistant_message_id = uuid.uuid4()

    async def _event_stream():
        import threading

        # Start SSE immediately so the client is not blocked on contextualize TTFT.
        yield ": keepalive\n\n"

        # Layer 1: Query contextualization (resolve pronouns before retrieval)
        rag_query = req.message
        _stream_is_ambiguous = False
        _contextualize_ms: Optional[int] = None
        _last_assistant_msg_stream = next(
            (m["content"] for m in reversed(recent_history) if m["type"] == "assistant"), None
        )
        if _last_assistant_msg_stream and _last_assistant_msg_stream.strip() == _build_ambiguity_clarification("", []).strip():
            # User is answering our clarification — combine original question + their reply
            _original_question_stream = next(
                (m["content"] for m in reversed(recent_history) if m["type"] == "user"), req.message
            )
            rag_query = f"{_original_question_stream} regarding {req.message}"
        elif recent_history:
            _ctx_t0 = time.perf_counter()
            rag_query, _stream_is_ambiguous = await _contextualize_query(
                req.message, recent_history, llm_config_dict
            )
            _contextualize_ms = max(0, int((time.perf_counter() - _ctx_t0) * 1000))

        if _stream_is_ambiguous:
            _clarification_text = _build_ambiguity_clarification(req.message, recent_history)
            _ambig_msg_id = uuid.uuid4()
            yield f"data: {json.dumps({'token': _clarification_text, 'done': False})}\n\n"
            _sessions().append(session_id, _scope, {
                "id": str(_ambig_msg_id),
                "type": "assistant",
                "content": _clarification_text,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            })

            def _save_clarification():
                from ..db import SessionLocal
                _db = SessionLocal()
                _elapsed_ms = int((time.time() - start_time) * 1000)
                try:
                    if project_uuid:
                        _db.add(ChatMessage(
                            id=uuid.uuid4(),
                            user_id=user_id,
                            project_id=project_uuid,
                            session_id=session_id,
                            message_id=_ambig_msg_id,
                            user_message=req.message,
                            assistant_response=_clarification_text,
                            message_type="chat",
                            sources=None,
                        ))
                        _db.commit()
                    _db.add(QueryLog(
                        user_id=user_id,
                        apikey_id=api_key_id if api_key_id else None,
                        project_id=project_uuid if project_uuid else None,
                        llm_provider=(llm_config_dict or {}).get("provider"),
                        llm_model=(llm_config_dict or {}).get("chat_model"),
                        query=req.message,
                        mode="CHAT",
                        result_count=0,
                        p95_latency=_elapsed_ms,
                        prompt_tokens=None,
                        completion_tokens=None,
                        total_tokens=None,
                        chat_message_id=_ambig_msg_id if project_uuid else None,
                    ))
                    _db.commit()
                except Exception as _e:
                    logger.error(f"Clarification DB save failed: {_e}")
                    _db.rollback()
                finally:
                    _db.close()

            done_payload: Dict[str, Any] = {
                "token": "",
                "done": True,
                "message_id": str(_ambig_msg_id),
                "session_id": session_id,
                "retrieval_meta": None,
                "sources": [],
                "token_usage": {},
                "final_answer": _clarification_text,
                "answer_updated": False,
            }
            yield f"data: {json.dumps(done_payload)}\n\n"
            try:
                _save_clarification()
            except Exception as persist_err:
                logger.warning("chat clarification persist failed after done: %s", persist_err)
            return

        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()
        full_text_parts: List[str] = []
        meta_result: Dict[str, Any] = {}

        # Resolve embedding model for this project (chat path → ChatbotSettings).
        from ..services.rag.embedding_resolver import resolve_for_project as _resolve_emb_for_project
        _stream_emb_provider, _stream_emb_model, _stream_emb_api_key = _resolve_emb_for_project(
            db, project_id, source="chat"
        )

        def _run_stream():
            try:
                for delta, meta in rag_pipeline.stream_query(
                    user_query=rag_query,
                    top_k=CHAT_TOP_K,
                    max_tokens=chat_max_tokens,
                    user_id=user_id,
                    project_id=project_id,
                    llm_config=llm_config_dict,
                    system_prompt=system_prompt,
                    language_code=chatbot_language,
                    similarity_threshold=chat_similarity_threshold,
                    use_reranker=chat_use_reranker,
                    chat_history=_history_for_chat_answer(req.message, recent_history),
                    embedding_provider=_stream_emb_provider,
                    embedding_model=_stream_emb_model,
                    embedding_api_key=_stream_emb_api_key,
                ):
                    loop.call_soon_threadsafe(q.put_nowait, (delta, meta))
            except Exception as e:
                loop.call_soon_threadsafe(q.put_nowait, (None, {"error": str(e)}))
            finally:
                loop.call_soon_threadsafe(q.put_nowait, None)

        thread = threading.Thread(target=_run_stream, daemon=True)
        thread.start()

        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if item is None:
                    break
                delta, meta = item
                if delta is None and meta and "error" in meta:
                    friendly = format_llm_error_for_user(meta["error"])
                    err_payload = json.dumps({
                        "token": friendly,
                        "done": True,
                        "message_id": str(assistant_message_id),
                        "session_id": session_id,
                    })
                    yield f"data: {err_payload}\n\n"
                    return
                if delta and meta is None:
                    full_text_parts.append(delta)
                    yield f"data: {json.dumps({'token': delta, 'done': False})}\n\n"
                elif meta is not None:
                    if delta:
                        is_terminal_error = bool(meta.get("done")) and (
                            str(delta).strip().lower().startswith("error:")
                            or meta.get("token_usage") is None
                            and not (meta.get("full_text") or "").strip()
                        )
                        if is_terminal_error:
                            friendly = format_llm_error_for_user(delta)
                            yield f"data: {json.dumps({'token': friendly, 'done': True, 'message_id': str(assistant_message_id), 'session_id': session_id})}\n\n"
                            return
                        full_text_parts.append(delta)
                        yield f"data: {json.dumps({'token': delta, 'done': False})}\n\n"
                    meta_result = meta
        except asyncio.CancelledError:
            return

        joined_raw = "".join(full_text_parts)
        full_answer = _refine_answer(joined_raw)
        streamed_answer = full_answer
        streamed_answer = full_answer

        # Layer 2: Confidence-based caveat for weak retrieval (mirrors non-streaming path)
        _s_conf = (meta_result.get("retrieval_meta") or {}).get("confidence_score", 100) if isinstance(meta_result, dict) else 100
        if isinstance(_s_conf, (int, float)) and _s_conf < _get_low_confidence_threshold() and full_answer:
            full_answer = _wrap_low_confidence_answer(full_answer)

        # Fix 2: Graceful context-loss in streaming path
        if (
            full_answer
            and (RAG_OOC_SENTINEL in joined_raw or RAG_OUT_OF_CONTEXT_PHRASE in full_answer.lower())
            and _is_conversational_followup(req.message, recent_history)
        ):
            full_answer = _graceful_context_loss_response()

        elapsed_ms = int((time.time() - start_time) * 1000)
        stream_token_usage = meta_result.get("token_usage") or {}
        raw_for_sources_policy = (
            (meta_result.get("full_text") or "").strip()
            if isinstance(meta_result, dict)
            else ""
        )
        if not raw_for_sources_policy:
            raw_for_sources_policy = joined_raw
        _source_t0 = time.perf_counter()
        stream_sources = _chat_sources_for_response(
            raw_for_sources_policy,
            meta_result.get("raw_contexts") if isinstance(meta_result, dict) else None,
            meta_result.get("raw_contexts_metadatas") if isinstance(meta_result, dict) else None,
            meta_result.get("retrieval_meta") if isinstance(meta_result, dict) else None,
            chunk_similarity_pct=meta_result.get("raw_chunk_similarity_pct") if isinstance(meta_result, dict) else None,
            answer_refined_for_policy=full_answer,
            user_query_for_overlap=_query_text_for_source_matching(rag_query, request),
            live_item_ids=_live_coverage_item_ids(db, project_uuid),
            top_k=CHAT_TOP_K,
        )
        _source_build_ms = max(0, int((time.perf_counter() - _source_t0) * 1000))
        _finalize_t0 = time.perf_counter()
        full_answer = _finalize_chat_answer_for_user(
            full_answer,
            stream_sources,
            raw_llm=joined_raw,
            user_query=rag_query,
            context_metadatas=meta_result.get("raw_contexts_metadatas")
            if isinstance(meta_result, dict)
            else None,
            db=db,
            project_id=project_uuid,
        )
        _finalize_ms = max(0, int((time.perf_counter() - _finalize_t0) * 1000))

        _pipeline_stages = (
            meta_result.get("stage_timings_ms") if isinstance(meta_result, dict) else None
        ) or {}
        _merged_stage_timings = {
            **_pipeline_stages,
            "total_ms": elapsed_ms,
            "contextualize_ms": _contextualize_ms,
            "source_build_ms": _source_build_ms,
            "finalize_ms": _finalize_ms,
            "settings_load_ms": _settings_load_ms,
            "kb_ready_ms": _kb_ready_ms,
        }

        _sessions().append(session_id, _scope, {
            "id": str(assistant_message_id),
            "type": "assistant",
            "content": full_answer,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        })

        def _save():
            from ..db import SessionLocal
            from ..services.chat_execution_snapshot import build_execution_snapshot

            _db = SessionLocal()
            try:
                mr = meta_result if isinstance(meta_result, dict) else {}
                snap = build_execution_snapshot(
                    answer=full_answer or "",
                    session_id=session_id,
                    assistant_message_id=assistant_message_id,
                    chatbot_language=chatbot_language,
                    retrieval_meta=mr.get("retrieval_meta"),
                    token_usage=stream_token_usage,
                    raw_contexts=mr.get("raw_contexts"),
                    raw_contexts_metadatas=mr.get("raw_contexts_metadatas"),
                    raw_chunk_similarity_pct=mr.get("raw_chunk_similarity_pct"),
                    llm_config_dict=llm_config_dict,
                    effective_rag_params={
                        "top_k": CHAT_TOP_K,
                        "similarity_threshold": chat_similarity_threshold,
                        "use_reranker": chat_use_reranker,
                        "max_tokens": chat_max_tokens,
                    },
                    embedding_provider=_stream_emb_provider,
                    embedding_model=_stream_emb_model,
                    project_id=project_id,
                    total_ms=elapsed_ms,
                    stage_timings_ms=_merged_stage_timings,
                    is_default_greeting=False,
                )
                if project_uuid:
                    _db.add(ChatMessage(
                        id=uuid.uuid4(),
                        user_id=user_id,
                        project_id=project_uuid,
                        session_id=session_id,
                        message_id=assistant_message_id,
                        user_message=req.message,
                        assistant_response=full_answer,
                        message_type="chat",
                        sources=stream_sources,
                        execution_snapshot=snap,
                    ))
                    _db.commit()
                _db.add(QueryLog(
                    user_id=user_id,
                    apikey_id=api_key_id if api_key_id else None,
                    project_id=project_uuid,
                    llm_provider=(llm_config_dict or {}).get("provider"),
                    llm_model=(llm_config_dict or {}).get("chat_model"),
                    query=req.message,
                    mode="CHAT",
                    result_count=1 if full_answer else 0,
                    p95_latency=elapsed_ms,
                    prompt_tokens=stream_token_usage.get("prompt_tokens"),
                    completion_tokens=stream_token_usage.get("completion_tokens"),
                    total_tokens=stream_token_usage.get("total_tokens"),
                    chat_message_id=assistant_message_id if project_uuid else None,
                ))
                _db.commit()
            except Exception as e:
                logger.error(f"Stream DB save failed: {e}")
                _db.rollback()
            finally:
                _db.close()

        # Yield done first (parity with search stream); then persist.
        # Disconnect/worker recycle may drop rare persists — same tradeoff as search.
        done_payload: Dict[str, Any] = {
            "token": "",
            "done": True,
            "message_id": str(assistant_message_id),
            "session_id": session_id,
            "retrieval_meta": meta_result.get("retrieval_meta") if isinstance(meta_result, dict) else None,
            "sources": stream_sources if stream_sources else [],
            "token_usage": stream_token_usage,
            "final_answer": full_answer,
            "answer_updated": (full_answer or "").strip() != (streamed_answer or "").strip(),
        }
        yield f"data: {json.dumps(done_payload)}\n\n"
        try:
            _save()
        except Exception as persist_err:
            logger.warning("chat stream persist failed after done: %s", persist_err)

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers=_sse_headers,
    )



@router.get("/chat/sessions")
async def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """List chat sessions - CHAT ONLY (excludes search sessions)"""
    sessions = (
        db.query(ChatMessage.session_id)
        .filter(
            and_(
                ChatMessage.user_id == current_user.id,
                ChatMessage.message_type == "chat"  # CRITICAL: Only chat sessions
            )
        )
        .distinct()
        .all()
    )
    session_list = [session[0] for session in sessions]
    
    return create_success_response(
        data={"sessions": session_list, "count": len(session_list)},
        message="Chat sessions retrieved"
    )

@router.get("/chat/history", response_model=List[ChatMessageHistoryListOut])
async def get_chat_history(
    session_id: Optional[str] = Query(None, description="Filter messages by session_id. If provided, only returns messages from that session."),
    q: Optional[str] = Query(None, description="Search substring in user or assistant message"),
    project_id: Optional[str] = Query(None, description="Project to scope history (defaults to active project)"),
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Get chat history for the authenticated user or widget project.
    If session_id is provided, only returns messages from that specific session.
    """
    try:
        # CASE 1: Widget Auth - strict project+session isolation
        if auth["type"] == "widget":
            project_id = auth["project_id"]
            if isinstance(project_id, str):
                try:
                    project_id = uuid.UUID(project_id)
                except ValueError:
                    pass 

            if not session_id or not session_id.strip():
                return []

            base = (
                db.query(ChatMessage)
                .filter(
                    ChatMessage.project_id == project_id,
                    ChatMessage.message_type == "chat",
                    ChatMessage.session_id == session_id.strip(),
                )
                .filter(ChatMessage.hidden_from_widget == False)
            )
            if q and q.strip():
                pat = f"%{q.strip()}%"
                base = base.filter(
                    or_(
                        ChatMessage.user_message.ilike(pat),
                        ChatMessage.assistant_response.ilike(pat),
                    )
                )
            
            messages = (
                base
                .order_by(ChatMessage.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_chat_message_history_list_out(m) for m in messages]

        # CASE 2: API Key Auth
        if auth["type"] == "api_key":
            ak = auth["api_key"]
            user_id = getattr(ak, "created_by_id", None)
            if not user_id:
                raise HTTPException(status_code=401, detail="User authentication required")
            api_key_project_id = getattr(ak, "project_id", None)
            if api_key_project_id:
                active_project = db.query(Project).filter(
                    Project.id == api_key_project_id,
                    Project.owner_id == user_id
                ).first()
            else:
                raise HTTPException(
                    status_code=403,
                    detail="API key must be project-scoped"
                )
            if not active_project:
                return []
            base = (
                db.query(ChatMessage)
                .filter(
                    and_(
                        ChatMessage.user_id == user_id,
                        ChatMessage.project_id == active_project.id,
                        ChatMessage.message_type == "chat"
                    )
                )
            )
            if session_id:
                base = base.filter(ChatMessage.session_id == session_id)
            if q and q.strip():
                pat = f"%{q.strip()}%"
                base = base.filter(
                    or_(
                        ChatMessage.user_message.ilike(pat),
                        ChatMessage.assistant_response.ilike(pat),
                    )
                )
            messages = (
                base
                .order_by(ChatMessage.created_at.desc())
                .offset(offset)
                .limit(limit)
                .all()
            )
            return [_chat_message_history_list_out(m) for m in messages]

        # CASE 3: User Auth - Get messages for requested or active project
        user = auth["user"]
        user_id = user.id

        active_project = _resolve_history_project(db, user, project_id)
        
        if not active_project:
            return []

        base = (
            db.query(ChatMessage)
            .filter(
                and_(
                    ChatMessage.user_id == user_id,
                    ChatMessage.project_id == active_project.id,
                    ChatMessage.message_type == "chat"
                )
            )
        )
        
        # Filter by session_id if provided
        if session_id:
            base = base.filter(ChatMessage.session_id == session_id)
            if _column_exists_in_table(db, "chat_messages", "hidden_from_widget"):
                base = base.filter(ChatMessage.hidden_from_widget == False)
        if q and q.strip():
            pat = f"%{q.strip()}%"
            base = base.filter(
                or_(
                    ChatMessage.user_message.ilike(pat),
                    ChatMessage.assistant_response.ilike(pat),
                )
            )
        
        messages = (
            base
            .order_by(ChatMessage.created_at.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        
        return [_chat_message_history_list_out(m) for m in messages]
    except Exception as e:
        logger.error(f"Error retrieving chat history: {e}", exc_info=True)
        return []


@router.get("/chat/history/export")
async def export_chat_history(
    request: Request,
    session_id: Optional[str] = Query(None, description="Filter messages by session_id"),
    q: Optional[str] = Query(None, description="Search substring in user or assistant message"),
    fmt: str = Query("csv", description="Export format (csv or json)"),
    message_type: str = Query("chat", description="all, chat, or search"),
    max_rows: int = Query(10_000, ge=1, le=50_000),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """Export chat/search history for the logged-in user's active project (dashboard only)."""
    if fmt not in ("csv", "json"):
        raise HTTPException(status_code=400, detail="fmt must be csv or json")
    if message_type not in ("all", "chat", "search"):
        raise HTTPException(status_code=400, detail="message_type must be all, chat, or search")

    filter_summary = {
        k: v
        for k, v in {
            "q": q,
            "session_id": session_id,
            "message_type": message_type,
            "max_rows": max_rows,
        }.items()
        if v is not None and v != ""
    }

    try:
        active_project = _get_active_project(db, current_user.id)
        if not active_project:
            raise HTTPException(status_code=404, detail="No active project")

        base = db.query(ChatMessage).filter(
            and_(
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
            )
        )
        if message_type != "all":
            base = base.filter(ChatMessage.message_type == message_type)
        if session_id:
            base = base.filter(ChatMessage.session_id == session_id)
        if q and q.strip():
            pat = f"%{q.strip()}%"
            base = base.filter(
                or_(
                    ChatMessage.user_message.ilike(pat),
                    ChatMessage.assistant_response.ilike(pat),
                )
            )

        messages = base.order_by(ChatMessage.created_at.desc()).limit(max_rows).all()

        export_rows: list[dict[str, Any]] = []
        for m in messages:
            out = _chat_message_history_list_out(m)
            snap = m.execution_snapshot if isinstance(m.execution_snapshot, dict) else {}
            timings = snap.get("timings_ms") if isinstance(snap.get("timings_ms"), dict) else {}
            runtime_params = (
                snap.get("runtime_params")
                if isinstance(snap.get("runtime_params"), dict)
                else {}
            )
            token_usage = (
                snap.get("token_usage")
                if isinstance(snap.get("token_usage"), dict)
                else {}
            )
            retrieval_meta = (
                snap.get("retrieval_meta")
                if isinstance(snap.get("retrieval_meta"), dict)
                else {}
            )
            sources_trace = snap.get("sources_trace") if isinstance(snap.get("sources_trace"), list) else []
            fb = out.feedback
            vote = ""
            if fb is not None:
                vote = "positive" if fb else "negative"
            export_rows.append(
                {
                    "message_id": str(out.message_id),
                    "session_id": out.session_id,
                    "created_at": out.created_at.isoformat() if out.created_at else "",
                    "user_message": out.user_message or "",
                    "assistant_response": out.assistant_response or "",
                    "message_type": out.message_type or "",
                    "history_status": out.history_status or "",
                    "history_confidence": out.history_confidence,
                    "history_total_ms": out.history_total_ms,
                    "feedback_vote": vote,
                    "timings_query_execution_ms": timings.get("query_execution_ms"),
                    "timings_retrieval_ms": timings.get("retrieval_ms"),
                    "timings_reranking_ms": timings.get("reranking_ms"),
                    "timings_llm_generation_ms": timings.get("llm_generation_ms"),
                    "timings_streaming_ms": timings.get("streaming_ms"),
                    "timings_spans_count": len(timings.get("spans", []))
                    if isinstance(timings.get("spans"), list)
                    else None,
                    "runtime_temperature": runtime_params.get("temperature"),
                    "runtime_top_k": runtime_params.get("top_k"),
                    "runtime_similarity_threshold": runtime_params.get("similarity_threshold"),
                    "runtime_max_tokens": runtime_params.get("max_tokens"),
                    "runtime_use_reranker": runtime_params.get("use_reranker"),
                    "runtime_reranker_model_name": runtime_params.get("reranker_model_name"),
                    "runtime_embedding_provider": runtime_params.get("embedding_provider"),
                    "runtime_embedding_model": runtime_params.get("embedding_model"),
                    "runtime_llm_provider": runtime_params.get("llm_provider"),
                    "runtime_llm_model": runtime_params.get("llm_model"),
                    "runtime_hybrid_search": runtime_params.get("hybrid_search"),
                    "runtime_vector_store": runtime_params.get("vector_store"),
                    "runtime_collection_name": runtime_params.get("collection_name"),
                    "runtime_chatbot_language": runtime_params.get("chatbot_language"),
                    "token_prompt_tokens": token_usage.get("prompt_tokens"),
                    "token_completion_tokens": token_usage.get("completion_tokens"),
                    "token_total_tokens": token_usage.get("total_tokens"),
                    "retrieval_tier_used": retrieval_meta.get("tier_used"),
                    "retrieval_confidence_score": retrieval_meta.get("confidence_score"),
                    "retrieval_top1_similarity": retrieval_meta.get("top1_similarity"),
                    "retrieval_top3_mean_similarity": retrieval_meta.get("top3_mean_similarity"),
                    "retrieval_lexical_overlap": retrieval_meta.get("lexical_overlap"),
                    "retrieval_fallback_reason": retrieval_meta.get("fallback_reason"),
                    "retrieval_semantic_count": retrieval_meta.get("semantic_count"),
                    "retrieval_keyword_count": retrieval_meta.get("keyword_count"),
                    "retrieval_fused_count": retrieval_meta.get("fused_count"),
                    "retrieval_reranked": retrieval_meta.get("reranked"),
                    "retrieval_rerank_skipped_reason": retrieval_meta.get("rerank_skipped_reason"),
                    "retrieval_reranking_ms": retrieval_meta.get("reranking_ms"),
                    "sources_trace_json": json.dumps(sources_trace, ensure_ascii=False),
                    "execution_snapshot_json": json.dumps(snap, ensure_ascii=False),
                    "retrieval_meta_json": json.dumps(retrieval_meta, ensure_ascii=False),
                    "runtime_params_json": json.dumps(runtime_params, ensure_ascii=False),
                    "token_usage_json": json.dumps(token_usage, ensure_ascii=False),
                }
            )

        if fmt == "json":
            data = json.dumps(export_rows, ensure_ascii=False, default=str).encode("utf-8")
            filename = f"{message_type}-history-export.json"
            media_type = "application/json; charset=utf-8"
        else:
            buf = io.StringIO()
            w = csv.writer(buf)
            headers = [
                "message_id",
                "session_id",
                "created_at",
                "user_message",
                "assistant_response",
                "message_type",
                "history_status",
                "history_confidence",
                "history_total_ms",
                "feedback_vote",
                "timings_query_execution_ms",
                "timings_retrieval_ms",
                "timings_reranking_ms",
                "timings_llm_generation_ms",
                "timings_streaming_ms",
                "timings_spans_count",
                "runtime_temperature",
                "runtime_top_k",
                "runtime_similarity_threshold",
                "runtime_max_tokens",
                "runtime_use_reranker",
                "runtime_reranker_model_name",
                "runtime_embedding_provider",
                "runtime_embedding_model",
                "runtime_llm_provider",
                "runtime_llm_model",
                "runtime_hybrid_search",
                "runtime_vector_store",
                "runtime_collection_name",
                "runtime_chatbot_language",
                "token_prompt_tokens",
                "token_completion_tokens",
                "token_total_tokens",
                "retrieval_tier_used",
                "retrieval_confidence_score",
                "retrieval_top1_similarity",
                "retrieval_top3_mean_similarity",
                "retrieval_lexical_overlap",
                "retrieval_fallback_reason",
                "retrieval_semantic_count",
                "retrieval_keyword_count",
                "retrieval_fused_count",
                "retrieval_reranked",
                "retrieval_rerank_skipped_reason",
                "retrieval_reranking_ms",
                "sources_trace_json",
                "execution_snapshot_json",
                "retrieval_meta_json",
                "runtime_params_json",
                "token_usage_json",
            ]
            w.writerow(headers)
            for row in export_rows:
                w.writerow(
                    [
                        sanitize_csv_cell(row.get(h))
                        if h.endswith("_json")
                        or h
                        in (
                            "message_id",
                            "session_id",
                            "created_at",
                            "user_message",
                            "assistant_response",
                            "message_type",
                            "history_status",
                            "feedback_vote",
                            "retrieval_fallback_reason",
                            "retrieval_rerank_skipped_reason",
                            "runtime_reranker_model_name",
                            "runtime_embedding_provider",
                            "runtime_embedding_model",
                            "runtime_llm_provider",
                            "runtime_llm_model",
                            "runtime_vector_store",
                            "runtime_collection_name",
                            "runtime_chatbot_language",
                        )
                        else row.get(h, "")
                        for h in headers
                    ]
                )
            data = buf.getvalue().encode("utf-8-sig")
            filename = f"{message_type}-history-export.csv"
            media_type = "text/csv; charset=utf-8"

        emit_audit(
            event_type="data.chat_history.exported",
            request=request,
            user_id=current_user.id,
            project_id=active_project.id,
            status="success",
            summary=f"Chat history export ({len(messages)} rows, {fmt})",
            details={"row_count": len(messages), "format": fmt, "filters": filter_summary},
        )

        def _csv_one_shot():
            yield data

        return StreamingResponse(
            _csv_one_shot(),
            media_type=media_type,
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Chat history export failed: %s", exc, exc_info=True)
        ap = _get_active_project(db, current_user.id)
        emit_audit(
            event_type="data.chat_history.exported",
            request=request,
            user_id=current_user.id,
            project_id=ap.id if ap else None,
            status="failed",
            summary="Chat history export failed",
            details={"filters": filter_summary, "error": str(exc)[:500]},
        )
        raise HTTPException(status_code=500, detail="Export failed") from exc


@router.get("/chat/messages/{message_id}", response_model=ChatMessageOut)
async def get_chat_message_detail(
    message_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Return one chat message including execution_snapshot (History detail)."""
    try:
        message_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")

    if auth["type"] == "widget":
        project_id = auth["project_id"]
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "chat",
        )
    else:
        user = auth["user"]
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.user_id == user.id,
            ChatMessage.message_type == "chat",
        )

    row = db.query(ChatMessage).filter(query_filter).first()
    if not row:
        raise HTTPException(status_code=404, detail="Chat message not found")
    from ..services.execution_snapshot_metrics import effective_execution_snapshot

    payload = ChatMessageOut.model_validate(row).model_dump()
    payload["execution_snapshot"] = effective_execution_snapshot(db, row)
    return ChatMessageOut.model_validate(payload)


@router.delete("/chat/messages/{message_id}")
async def delete_message(
    message_id: str,
    source: Optional[str] = Query(None, description="Source of request: 'widget' for chatbot widget (soft delete - hides from widget, keeps in history), 'page' for history page (hard delete - removes from DB)"),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Delete a specific chat message by message_id - CHAT ONLY.
    Only deletes messages with message_type='chat'.
    Search messages cannot be deleted through this endpoint.
    
    Supports both widget auth (via X-Project-ID) and user auth (via Bearer token).
    
    Behavior:
    - If source='widget' or not provided (default): Marks message as hidden from widget (soft delete), keeps in database for history page
    - If source='page': Permanently deletes message from database (hard delete, removes from both widget and history)
    """
    try:
        message_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")
    
    # Default to 'widget' if source is not explicitly 'page' to prevent accidental permanent deletes
    if source != "page":
        source = "widget"  # Treat as widget delete (soft delete/hide)
    
    # Build query based on auth type
    if auth["type"] == "widget":
        # Widget auth: filter by project_id
        project_id = auth["project_id"]
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass
        
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "chat"  # CRITICAL: Only chat messages
        )
        user_id_for_logging = auth.get("user_id", "widget")
    else:
        # User auth: filter by user_id
        user = auth["user"]
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.user_id == user.id,
            ChatMessage.message_type == "chat"  # CRITICAL: Only chat messages
        )
        user_id_for_logging = user.id
    
    # Build scope once — used for all session store calls below.
    _scope = _build_session_scope(auth)

    # Log the source parameter for debugging
    logger.info(f"Delete message request: message_id={message_id}, source={source}, auth_type={auth['type']}, user_id={user_id_for_logging}")

    if source == "widget":
        # Widget clear: Mark as hidden from widget, but keep in database for history page
        # CRITICAL: Only hide chat messages, not search messages
        message = db.query(ChatMessage).filter(query_filter).first()

        if not message:
            raise HTTPException(status_code=404, detail="Chat message not found")

        # Check if hidden_from_widget column exists (graceful handling if migration not run)
        if _column_exists_in_table(db, 'chat_messages', 'hidden_from_widget'):
            # Column exists - mark message as hidden from widget
            try:
                message.hidden_from_widget = True
                message.updated_at = datetime.now(timezone.utc)
                db.commit()
                db.refresh(message)

                session_id = message.session_id
                if session_id:
                    _mid = str(message.message_id)
                    _sessions().filter_messages(session_id, _scope, lambda m: m.get("id") != _mid)

                return create_success_response(
                    data={"message_id": message_id, "hidden_from_widget": True, "deleted": False},
                    message="Message hidden from chatbot widget (still visible in history page)"
                )
            except Exception as e:
                logger.error(f"Error hiding message from widget: {e}")
                db.rollback()
                session_id = message.session_id
                if session_id:
                    _mid = str(message.message_id)
                    _sessions().filter_messages(session_id, _scope, lambda m: m.get("id") != _mid)

                return create_success_response(
                    data={"message_id": message_id, "hidden_from_widget": False, "deleted": False, "error": True},
                    message="Message removed from widget (error hiding, but kept in database)"
                )
        else:
            # Column doesn't exist yet - DO NOT DELETE, just remove from session store
            logger.warning("hidden_from_widget column not found - migration needed. Message will remain in database.")
            session_id = message.session_id
            if session_id:
                _mid = str(message.message_id)
                _sessions().filter_messages(session_id, _scope, lambda m: m.get("id") != _mid)
            
            return create_success_response(
                data={"message_id": message_id, "hidden_from_widget": False, "deleted": False, "migration_needed": True},
                message="Message removed from widget (migration needed to hide from widget while keeping in history)"
            )
    else:
        # History page clear: Delete from database (permanent)
        # CRITICAL: Only delete chat messages, not search messages
        # Note: Only allow hard delete for user auth (history page), not widget auth
        if auth["type"] != "user":
            raise HTTPException(
                status_code=403,
                detail="Hard delete (source='page') is only allowed for authenticated users, not widget requests"
            )
        
        message = db.query(ChatMessage).filter(query_filter).first()
        
        if not message:
            raise HTTPException(status_code=404, detail="Chat message not found")
        
        db.delete(message)
        db.commit()
        
        return create_success_response(
            data={"message_id": message_id, "deleted": True},
            message="Chat message deleted successfully from database"
        )


@router.delete("/chat/messages")
async def delete_all_messages(
    source: Optional[str] = Query(None, description="Source of request: 'widget' for chatbot widget (soft delete - hides from widget), 'page' for history page (hard delete)"),
    session_id: Optional[str] = Query(None, description="Widget visitor session ID. Required in widget mode; only that visitor's messages are cleared."),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Delete all chat messages for the current user/project context.
    Supports soft-delete via 'hidden_from_widget' if source='widget'.
    For widget auth, scoped to the visitor's session_id when provided.
    """

    # CASE 1: Widget Auth
    if auth["type"] == "widget":
        project_id = auth["project_id"]
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass

        if not session_id or not session_id.strip():
            raise HTTPException(status_code=400, detail="session_id is required in widget mode")

        target_session_id = session_id.strip()
        query = db.query(ChatMessage).filter(
            ChatMessage.project_id == project_id,
            ChatMessage.session_id == target_session_id,
            ChatMessage.message_type == "chat",
        )

        # Scope to visitor's session only — prevents one visitor clearing another's chat
        if session_id:
            query = query.filter(ChatMessage.session_id == session_id)

        if source == "widget" or source is None:
            # Soft delete for widget view (default)
            deleted_count = query.count()
            query.update({ChatMessage.hidden_from_widget: True}, synchronize_session=False)
        else:
            # Widget requests must never perform hard-delete.
            raise HTTPException(
                status_code=403,
                detail="Hard delete is not allowed in widget mode"
            )

        db.commit()

        # Clear Redis session so deleted messages are not replayed as LLM context
        _proj_scope = _build_session_scope(auth)
        _sessions().delete(target_session_id, _proj_scope)

        return create_success_response(
            data={"project_id": str(project_id), "session_id": target_session_id, "messages_deleted": deleted_count},
            message="Chat session cleared successfully"
        )

    # CASE 2: User Auth
    user = auth["user"]
    active_project = _get_active_project(db, user.id)

    if not active_project:
        raise HTTPException(status_code=404, detail="No active project found")

    # Collect affected session IDs BEFORE deleting so we can purge in-memory cache
    affected_session_ids: set[str] = {
        row.session_id
        for row in db.query(ChatMessage.session_id)
        .filter(
            ChatMessage.user_id == user.id,
            ChatMessage.project_id == active_project.id,
            ChatMessage.session_id.isnot(None),
        )
        .distinct()
        .all()
        if row.session_id
    }

    query = db.query(ChatMessage).filter(
        ChatMessage.user_id == user.id,
        ChatMessage.project_id == active_project.id
    )

    if source == "widget":
        # Soft delete: just hide from widget
        deleted_count = query.count()
        query.update({ChatMessage.hidden_from_widget: True})
    else:
        # Hard delete from page/settings
        deleted_count = query.delete(synchronize_session=False)

    db.commit()

    # Purge session store so LLM doesn't receive deleted messages as context
    _user_scope = f"u:{user.id}"
    for sid in affected_session_ids:
        _sessions().delete(sid, _user_scope)
    if affected_session_ids:
        logger.info(
            "Cleared %s in-memory chat session(s) after bulk delete for user %s",
            len(affected_session_ids),
            user.id,
        )

    return create_success_response(
        data={"messages_deleted": deleted_count},
        message=f"Chat session cleared ({deleted_count} message(s) removed)"
    )



@router.delete("/chat/sessions/{session_id}")
async def clear_session(
    session_id: str,
    source: Optional[str] = Query(None, description="Source of request: 'widget' for chatbot widget (clears in-memory only), 'page' for history page (deletes from DB)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """
    Clear a chat session - CHAT ONLY.
    Only deletes messages with message_type='chat' in this session.
    Search messages in the same session are not affected.
    
    Behavior:
    - If source='widget' or not provided: Hides messages from widget, keeps in database
    - If source='page': Deletes chat messages from database (permanent deletion)
    """
    # Log the source parameter for debugging
    logger.info(f"Clear session request: session_id={session_id}, source={source}, user_id={current_user.id}")
    
    # Check if this is a search session (session_id starts with "search_")
    # If so, reject and tell frontend to use search endpoint
    if session_id.startswith("search_"):
        logger.warning(f"Session {session_id} is a search session, not a chat session. Use /api/v1/search/sessions endpoint to delete.")
        raise HTTPException(
            status_code=400,
            detail=f"Session '{session_id}' is a search session. Use the search delete endpoint (/api/v1/search/sessions/{session_id}) to delete it."
        )
    
    # Default to 'widget' if source is not explicitly 'page' to prevent accidental permanent deletes
    if source != "page":
        source = "widget"  # Treat as widget delete (soft delete/hide)
    
    _sess_scope = f"u:{current_user.id}"

    if source == "widget":
        # Widget clear: Mark all messages in session as hidden from widget, but keep in database for history page
        if _column_exists_in_table(db, 'chat_messages', 'hidden_from_widget'):
            # Column exists - mark all chat messages in this session as hidden from widget
            try:
                updated_count = db.query(ChatMessage).filter(
                    and_(
                        ChatMessage.session_id == session_id,
                        ChatMessage.user_id == current_user.id,
                        ChatMessage.message_type == "chat"  # CRITICAL: Only chat messages
                    )
                ).update({"hidden_from_widget": True, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
                db.commit()

                _sessions().delete(session_id, _sess_scope)

                return create_success_response(
                    data={"session_id": session_id, "messages_hidden": updated_count, "cleared_from_memory": True},
                    message=f"Session {session_id} hidden from chatbot widget (still visible in history page)"
                )
            except Exception as e:
                logger.error(f"Error hiding session from widget: {e}")
                db.rollback()
                _sessions().delete(session_id, _sess_scope)
                return create_success_response(
                    data={"session_id": session_id, "messages_hidden": 0, "cleared_from_memory": True},
                    message=f"Session {session_id} cleared from widget (error hiding messages)"
                )
        else:
            # Column doesn't exist yet - DO NOT DELETE, just clear session store
            logger.warning("hidden_from_widget column not found - migration needed. Messages will remain in database.")
            _sessions().delete(session_id, _sess_scope)
            return create_success_response(
                data={"session_id": session_id, "messages_deleted": 0, "cleared_from_memory": True, "migration_needed": True},
                message=f"Session {session_id} cleared from widget (migration needed to hide from widget while keeping in history)"
            )
    else:
        # History page clear: Delete from database (permanent) - removes from both widget and history
        # CRITICAL: Only delete chat messages, not search messages
        # Check if session exists
        session_messages = db.query(ChatMessage).filter(
            and_(
                ChatMessage.session_id == session_id,
                ChatMessage.user_id == current_user.id,
                ChatMessage.message_type == "chat"  # CRITICAL: Only chat messages
            )
        ).all()
        
        # Debug: Check if session exists with different message_type (might be search session)
        if not session_messages:
            # Check if it's a search session
            search_session = db.query(ChatMessage).filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id,
                    ChatMessage.message_type == "search"
                )
            ).first()
            
            if search_session:
                logger.warning(f"Session {session_id} is a search session, not a chat session. Use /api/v1/search/messages endpoint to delete.")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Session '{session_id}' is a search session. Use the search delete endpoint to delete it."
                )
            
            # Check if session exists at all (any message_type)
            any_session = db.query(ChatMessage).filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id
                )
            ).first()
            
            if any_session:
                logger.warning(f"Session {session_id} found but message_type is '{any_session.message_type}', not 'chat'")
                raise HTTPException(
                    status_code=400,
                    detail=f"Session '{session_id}' is not a chat session (type: {any_session.message_type})"
                )
            
            logger.warning(f"Session {session_id} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail=f"Chat session '{session_id}' not found")
        
        # Delete all messages in this session
        deleted_count = (
            db.query(ChatMessage)
            .filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id,
                    ChatMessage.message_type == "chat"  # CRITICAL: Only chat messages
                )
            )
            .delete()
        )
        
        db.commit()

        _sessions().delete(session_id, _sess_scope)

        logger.info(f"Permanently deleted {deleted_count} message(s) from session {session_id} for user {current_user.id}")
        
        return create_success_response(
            data={"session_id": session_id, "messages_deleted": deleted_count},
            message=f"Chat session permanently deleted ({deleted_count} message(s) removed from both widget and history)"
        )

@router.post("/chat/feedback")
async def submit_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """Submit feedback for a message"""
    try:
        message_uuid = uuid.UUID(req.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")
    
    # Base query
    query = db.query(ChatMessage).filter(ChatMessage.message_id == message_uuid)
    
    # Add ownership check based on auth type
    if auth["type"] == "user":
        # Ensure message belongs to the user
        user = auth["user"]
        query = query.filter(ChatMessage.user_id == user.id)
    elif auth["type"] == "widget":
        # Ensure message belongs to the project
        project_id = auth["project_id"]
        # Convert string UUID to UUID object if needed
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass # Should be handled by db driver usually, but safer to have UUID
        
        query = query.filter(ChatMessage.project_id == project_id)
    elif auth["type"] == "api_key":
        ak = auth["api_key"]
        if not getattr(ak, "project_id", None):
            raise HTTPException(status_code=403, detail="API key must be project-scoped")
        query = query.filter(ChatMessage.project_id == ak.project_id)
    
    chat_message = query.first()
    
    if not chat_message:
        raise HTTPException(status_code=404, detail="Message not found")

    if not _is_chat_feedback_enabled(db, chat_message.project_id):
        raise HTTPException(status_code=403, detail="Feedback collection is disabled for this project")
    
    # Update feedback fields
    from ..services.feedback_reason_catalog import normalize_context_tags

    allowed_tags, unknown_tags = normalize_context_tags(req.context_tags)
    if unknown_tags:
        logger.info("Dropped unknown feedback context_tags for message %s: %s", req.message_id, unknown_tags)

    chat_message.feedback = req.feedback
    chat_message.feedback_rating = req.rating
    chat_message.feedback_text = req.feedback_text
    chat_message.context_tags = allowed_tags if allowed_tags else None
    chat_message.updated_at = datetime.now(timezone.utc)
    
    try:
        db.commit()
        db.refresh(chat_message)
        logger.info(f"Feedback saved for message {req.message_id}: rating={req.rating}, has_text={bool(req.feedback_text)}, tags={allowed_tags}")
    except Exception as e:
        logger.error(f"Failed to update feedback in database: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to save feedback")

    _fb_scope = _build_session_scope(auth)
    if req.session_id:
        _fb_msgs = _sessions().get(req.session_id, _fb_scope) or []
        _fb_msg = next((m for m in _fb_msgs if m.get("id") == req.message_id), None)
        if _fb_msg:
            _fb_msg["feedback"] = "positive" if req.feedback else "negative"
            _fb_msg["feedback_rating"] = req.rating
            _fb_msg["feedback_text"] = req.feedback_text
            _fb_msg["context_tags"] = allowed_tags
            _sessions().set_session(req.session_id, _fb_scope, _fb_msgs)

    return create_success_response(
        data={
            "session_id": req.session_id,
            "message_id": req.message_id,
            "feedback": req.feedback,
            "feedback_type": "positive" if req.feedback else "negative",
            "rating": req.rating,
            "feedback_text": req.feedback_text,
            "context_tags": allowed_tags
        },
        message=f"Feedback recorded for message {req.message_id}"
    )


def _get_active_project(db: Session, user_id: int) -> Optional[Project]:
    """Helper function to get active project for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # First, check if user is in onboarding and has temp project
    try:
        from .onboarding import _ob_get
        onboarding_data = _ob_get(user_id)
        if "data_source" in onboarding_data:
            temp_project_id = onboarding_data["data_source"].get("temp_project_id")
            if temp_project_id:
                temp_project = db.query(Project).filter(
                    and_(
                        Project.id == uuid.UUID(temp_project_id),
                        Project.owner_id == user_id
                    )
                ).first()
                if temp_project:
                    return temp_project
    except Exception:
        pass

    from ..auth import resolve_active_project
    return resolve_active_project(db, user)


def _resolve_history_project(
    db: Session,
    user: User,
    project_id: Optional[str] = None,
) -> Optional[Project]:
    """Prefer explicit ``project_id`` (ACL-checked) over DB active project.

    History UIs send ``?project_id=`` on switch; using only ``active_project_id``
    can briefly return the previous project's rows until activate commits.
    """
    raw = (project_id or "").strip()
    if raw:
        from ..auth import ensure_project_access

        try:
            pid = uuid.UUID(raw)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project_id",
            ) from exc
        return ensure_project_access(db, user, pid)
    return _get_active_project(db, user.id)


def _convert_to_bool(value: Any) -> bool:
    """
    Convert a value to a proper Python boolean.
    Handles strings "true"/"false", boolean values, and None.
    """
    if value is None:
        raise ValueError("Value cannot be None")
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        value_lower = value.lower().strip()
        if value_lower in ("true", "1", "yes", "on"):
            return True
        elif value_lower in ("false", "0", "no", "off"):
            return False
        else:
            raise ValueError(f"Cannot convert string '{value}' to boolean")
    # For other types, use bool() conversion
    return bool(value)


@router.get("/search/prompt", tags=["search"], status_code=status.HTTP_200_OK)
async def get_search_prompt(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """
    Get the current system prompt used for search functionality.
    Returns the stored prompt for the user's active project or a default prompt if none is set.
    """
    # Determine user_id
    auth_type = auth_result.get("type")
    user_id = None
    api_key_project_id = None
    if auth_type == "user":
        user_id = auth_result["user"].id
    elif auth_type == "api_key":
        ak = auth_result["api_key"]
        if getattr(ak, "created_by_id", None):
            user_id = ak.created_by_id
        if getattr(ak, "project_id", None):
            api_key_project_id = ak.project_id

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="User authentication required"
        )

    # For API keys, enforce key-scoped project.
    if api_key_project_id:
        active_project = db.query(Project).filter(
            Project.id == api_key_project_id,
            Project.owner_id == user_id
        ).first()
    else:
        if auth_type == "api_key":
            raise HTTPException(status_code=403, detail="API key must be project-scoped")
        active_project = _get_active_project(db, user_id)

    if not active_project:
        # Return default prompt if no active project
        default_prompt = """You are a helpful AI assistant. Use ONLY the context below to answer questions.
If the information is not in the context, say so. Be concise and accurate."""

        return create_success_response(
            data={
                "system_prompt": default_prompt,
                "project_id": None,
                "is_default": True
            },
            message="Default system prompt (no active project found)"
        )

    # Get stored prompt from SearchSettings (separate table for search settings)
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    system_prompt = None
    is_default = True
    
    if search_settings and search_settings.search_prompt:
        system_prompt = search_settings.search_prompt
        is_default = False
        logger.info(f"Retrieved search system prompt from SearchSettings: {system_prompt[:100]}...")
    
    # Default prompt if none is stored
    if not system_prompt:
        default_prompt = """You are a helpful AI assistant. Use ONLY the context below to answer questions.
If the information is not in the context, say so. Be concise and accurate."""
        system_prompt = default_prompt
    
    return create_success_response(
        data={
            "system_prompt": system_prompt,
            "project_id": str(active_project.id),
            "is_default": is_default
        },
        message="Search system prompt retrieved successfully"
    )

@router.put("/search/prompt", tags=["search"], status_code=status.HTTP_200_OK)
@router.post("/search/prompt", tags=["search"], status_code=status.HTTP_200_OK)
async def save_search_prompt(
    req: PromptUpdateRequest,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """
    Save or update the system prompt used for search functionality - SEARCH ONLY.
    This endpoint is isolated from chat prompt configuration.
    Accepts both PUT and POST methods (same as chat prompt endpoint).
    Uses welcome_message field with __SEARCH_PROMPT__ prefix to keep it separate from chat prompts.
    """
    # Determine user_id
    auth_type = auth_result.get("type")
    user_id = None
    api_key_project_id = None
    if auth_type == "user":
        user_id = auth_result["user"].id
    elif auth_type == "api_key":
        ak = auth_result["api_key"]
        if getattr(ak, "created_by_id", None):
            user_id = ak.created_by_id
        if getattr(ak, "project_id", None):
            api_key_project_id = ak.project_id

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="User authentication required"
        )

    # For API keys, enforce key-scoped project.
    if api_key_project_id:
        active_project = db.query(Project).filter(
            Project.id == api_key_project_id,
            Project.owner_id == user_id
        ).first()
    else:
        if auth_type == "api_key":
            raise HTTPException(status_code=403, detail="API key must be project-scoped")
        active_project = _get_active_project(db, user_id)

    if not active_project:
        raise HTTPException(
            status_code=404,
            detail="No active project found. Please create or activate a project first."
        )

    logger.info(f"Saving search prompt for user {user_id}, project {active_project.id}")
    
    # Clean the prompt - remove any existing prefix if accidentally included
    clean_prompt = req.system_prompt
    if clean_prompt.startswith("__SEARCH_PROMPT__"):
        clean_prompt = clean_prompt.replace("__SEARCH_PROMPT__", "", 1)
        logger.info(f"Removed __SEARCH_PROMPT__ prefix from incoming prompt")
    
    # Get or create SearchSettings (separate table for search settings)
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if search_settings:
        # Update existing settings
        old_prompt = search_settings.search_prompt
        search_settings.search_prompt = clean_prompt
        db.commit()
        db.refresh(search_settings)
        logger.info(f"Updated search system prompt for user {user_id}, project {active_project.id}. Old: {old_prompt[:50] if old_prompt else 'None'}..., New: {clean_prompt[:50]}...")
    else:
        # Create new SearchSettings entry
        search_settings = SearchSettings(
            user_id=user_id,
            project_id=active_project.id,
            search_prompt=clean_prompt
        )
        db.add(search_settings)
        db.commit()
        db.refresh(search_settings)
        logger.info(f"Created search system prompt for user {user_id}, project {active_project.id}")
    
    # Return clean prompt - frontend should never see the prefix
    return create_success_response(
        data={
            "system_prompt": clean_prompt,
            "project_id": str(active_project.id)
        },
        message="Search system prompt saved successfully"
    )

@router.get("/search/response-config", tags=["search"], status_code=status.HTTP_200_OK)
async def get_search_response_config(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Get response configuration for search - SEARCH ONLY.
    Returns the response type configuration (long or short) used specifically for search functionality.
    This endpoint is isolated from chat response configuration.
    Supports both User Auth (for admin) and Widget Auth (via X-Project-ID).
    """
    user_id = auth_result.get("user_id")
    project = None
    
    # Handle different auth types
    if auth_result["type"] == "widget":
        # For widget, we have direct project_id
        project_id = auth_result["project_id"]
        # Verify project exists and is active
        project = db.query(Project).filter(Project.id == project_id).first()
        if not project or not project.is_active:
             # Fallback to default if project invalid/inactive
             logger.warning(f"Widget auth failed for response-config: Project {project_id} not found or inactive")
             return create_success_response(
                data=ResponseConfigOut(response_type=ResponseType.LONG).model_dump(),
                message="Response configuration retrieved (project not found, using default)"
            )
    elif auth_result["type"] == "user":
        # For user, get their active project
        # First check if explicit project_id passed in query (for admin testing widget mode)
        # But get_project_id_or_user handles typical cases. 
        # Here we just want the active project for this user.
        from ..auth import get_active_project
        try:
             # We can't easily reuse the dependency directly as a function without context, 
             # so we implement similar logic or query manually.
             # Better to use the helper if available or query directly.
             project = db.query(Project).filter(
                and_(
                    Project.owner_id == user_id,
                    Project.is_active == True,
                    not_(Project.name.like("__TEMP_ONBOARDING_%"))
                )
             ).first()
        except Exception as e:
            logger.error(f"Error getting active project for user {user_id}: {e}")
            
    else:
        # API Key or other
        if "api_key" in auth_result and auth_result["api_key"].project_id:
             project_id = auth_result["api_key"].project_id
             project = db.query(Project).filter(Project.id == project_id).first()

    if not project:
        # Return default if no project found
        return create_success_response(
            data={"response_type": ResponseType.LONG.value},
            message="Response configuration retrieved (defaults - no active project)"
        )
    
    # Get search settings for this project
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == project.owner_id, # Use project owner
            SearchSettings.project_id == project.id
        )
    ).first()
    
    # Get response config from SearchSettings JSON field or return default
    response_type = ResponseType.LONG.value  # Default to "long"
    if search_settings and search_settings.search_response_config:
        if isinstance(search_settings.search_response_config, dict):
            saved_type = search_settings.search_response_config.get("response_type")
            if saved_type:
                response_type = saved_type
                # logger.info(f"GET response-config: Found saved response_type={response_type} for project {project.id}")
            else:
                 pass # Default
        else:
             pass # Default
    
    return create_success_response(
        data=ResponseConfigOut(response_type=ResponseType(response_type)).model_dump(),
        message="Response configuration retrieved successfully"
    )

@router.post("/search/response-config", tags=["search"], status_code=status.HTTP_200_OK)
async def update_search_response_config(
    config_data: ResponseConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """Update response configuration for search (long or short)."""
    if not active_project:
        raise HTTPException(
            status_code=404,
            detail="No active project found. Please create or activate a project first."
        )

    logger.info(
        "Updating search response config: user %s, project %s, requested response_type=%s",
        current_user.id,
        active_project.id,
        config_data.response_type.value,
    )

    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == current_user.id,
            SearchSettings.project_id == active_project.id
        )
    ).first()

    requested_response_type_value = config_data.response_type.value

    if not search_settings:
        new_config = {"response_type": requested_response_type_value}
        search_settings = SearchSettings(
            user_id=current_user.id,
            project_id=active_project.id,
            is_search_active=True,
            search_response_config=new_config
        )
        db.add(search_settings)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(search_settings, "search_response_config")
    else:
        current_config = search_settings.search_response_config
        if not current_config or not isinstance(current_config, dict):
            current_config = {"response_type": ResponseType.LONG.value}

        new_config = current_config.copy() if isinstance(current_config, dict) else {}
        new_config["response_type"] = requested_response_type_value
        search_settings.search_response_config = new_config

        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(search_settings, "search_response_config")

    try:
        db.flush()
    except Exception as e:
        db.rollback()
        logger.error("Error flushing response config: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error staging response configuration: {str(e)}"
        )

    try:
        db.commit()
    except Exception as e:
        db.rollback()
        logger.error("Error committing response config: %s", e, exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error saving response configuration: {str(e)}"
        )

    db.expire(search_settings)
    db.refresh(search_settings, ['search_response_config'])

    verification_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == current_user.id,
            SearchSettings.project_id == active_project.id
        )
    ).first()

    if not verification_settings:
        raise HTTPException(
            status_code=500,
            detail="SearchSettings record was not created/updated properly"
        )

    saved_response_type = config_data.response_type
    if verification_settings.search_response_config and isinstance(
        verification_settings.search_response_config, dict
    ):
        saved_response_type_value = verification_settings.search_response_config.get("response_type")
        if saved_response_type_value:
            saved_response_type = ResponseType(saved_response_type_value)

    chatbot_check = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == active_project.id
        )
    ).first()
    if chatbot_check and getattr(chatbot_check, 'search_response_config', None):
        chatbot_check.search_response_config = None
        try:
            db.commit()
        except Exception as e:
            db.rollback()
            logger.warning("Could not clean up old search_response_config from ChatbotSettings: %s", e)

    return create_success_response(
        data=ResponseConfigOut(response_type=saved_response_type).model_dump(),
        message="Response configuration updated successfully"
    )

@router.get("/rag/settings", tags=["search"], status_code=status.HTTP_200_OK)
async def get_rag_settings(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Get RAG settings for search widget - SEARCH ONLY.
    Returns: topK, similarityThreshold, useReranker, maxTokens
    """
    # Extract user_id and active_project based on auth type
    user_id = auth_result["user_id"]
    active_project = None
    if auth_result["type"] == "widget":
         project_id = auth_result.get("project_id")
         if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
                 # If widget authentication, use the project owner as user_id for settings lookup
                 if active_project:
                     user_id = active_project.owner_id
             except: pass
    else:
        active_project = _get_active_project(db, user_id)
        
    if not active_project:
        # Return defaults if no project found
        return {
            "topK": 5,
            "similarityThreshold": 0.2,
            "useReranker": False,
            "maxTokens": 1000
        }

    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if search_settings:
        return {
            "topK": search_settings.search_top_k if search_settings.search_top_k is not None else 5,
            "similarityThreshold": search_settings.search_similarity_threshold if search_settings.search_similarity_threshold is not None else 0.2,
            "useReranker": search_settings.search_use_reranker if search_settings.search_use_reranker is not None else False,
            "maxTokens": search_settings.search_max_tokens if search_settings.search_max_tokens is not None else 1000
        }
    
    # Defaults
    return {
        "topK": 5,
        "similarityThreshold": 0.2,
        "useReranker": False,
        "maxTokens": 1000
    }

# ---------------- SEARCH ENDPOINTS (Mirrors Chat Functionality) ----------------

@router.post("/search/query", tags=["search"])
@router.post("/search", tags=["search"])
@limiter.limit("60/minute")
async def search(
    req: RagQuery,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    AI search with RAG - SEARCH ONLY endpoint.
    Supports both User Auth (Bearer) and Widget Auth (X-Project-ID).
    """
    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline is not available. Please check server logs for details."
        )

    start_time = time.time()

    from ..services.search_run_context import resolve_search_run_context

    ctx = resolve_search_run_context(
        db,
        auth_result,
        req,
        rag_pipeline=rag_pipeline,
        load_history_fn=_load_conversation_history,
    )

    auth_type = ctx.auth_type
    user_id = ctx.user_id
    api_key_id = ctx.api_key_id
    project_id = ctx.project_id
    project_uuid = ctx.project_uuid
    search_session_id = ctx.search_session_id
    llm_config_dict = ctx.llm_config_dict
    system_prompt = ctx.system_prompt
    search_language = ctx.search_language
    search_format_type = ctx.search_format_type
    max_tokens = ctx.max_tokens
    search_top_k = ctx.search_top_k
    search_similarity_threshold = ctx.search_similarity_threshold
    search_use_reranker = ctx.search_use_reranker
    recent_search_history = ctx.recent_search_history
    _search_emb_provider = ctx.embedding_provider
    _search_emb_model = ctx.embedding_model
    _search_emb_api_key = ctx.embedding_api_key

    logger.info(
        "Retrieving contexts for search query: %s, top_k: %s, similarityThreshold: %s, "
        "max_tokens: %s, use_reranker: %s",
        req.query,
        search_top_k,
        search_similarity_threshold,
        max_tokens,
        search_use_reranker,
    )

    query_fn = functools.partial(
        rag_pipeline.query,
        query=req.query,
        top_k=search_top_k,
        max_tokens=max_tokens,
        generate_topk=False,
        user_id=user_id,
        project_id=project_id,
        llm_config=llm_config_dict,
        system_prompt=system_prompt,
        language_code=search_language,
        similarity_threshold=search_similarity_threshold,
        use_reranker=search_use_reranker,
        mode="search",
        format_type=search_format_type,
        enable_keyword_fallback=req.enableKeywordFallback,
        semantic_confidence_floor=req.semanticConfidenceFloor,
        keyword_score_floor=req.keywordScoreFloor,
        chat_history=recent_search_history if recent_search_history else None,
        embedding_provider=_search_emb_provider,
        embedding_model=_search_emb_model,
        embedding_api_key=_search_emb_api_key,
    )
    
    try:
        from ..services.query_runtime import run_query_async

        resp = await run_query_async(query_fn)
    except Exception as e:
        logger.error(f"Error executing RAG query: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=format_llm_error_for_user(e),
        )

    answer = resp.get("summary")
    raw_contexts = resp.get("raw_contexts", [])

    # If query returned empty or no contexts, check if documents actually exist
    if not answer and not raw_contexts:
        # Try to verify documents exist - maybe count check was wrong
        try:
            from ..services.knowledge_base_status import project_has_retrievable_content

            if not project_has_retrievable_content(
                rag_pipeline.vdb, db, project_id, user_id, source="search"
            ):
                raise HTTPException(
                    status_code=503,
                    detail="No documents embedded yet for this project. Please upload documents or crawl a website first.",
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error verifying document count: {e}")
            raise HTTPException(
                status_code=503,
                detail="No relevant documents found for your query. Please try a different search term.",
            )
    answer_text = answer or ""
    from ..services.source_display_policy import should_omit_sources_for_answer

    suppress_sources = should_omit_sources_for_answer(
        answer_text,
        system_prompt=system_prompt,
    )

    # Refine answer: Remove raw context markers and citations
    if answer and not suppress_sources:
        answer = _refine_answer(answer)

    for i, ctx in enumerate(raw_contexts):
        logger.debug("Raw context %d length=%d", i + 1, len(str(ctx or "")))

    if suppress_sources:
        message_id = uuid.uuid4()
        session_id = search_session_id
        
        # project_uuid should already be set above, but ensure it's set for database operations
        if not project_uuid and project_id:
            # Convert string project_id back to UUID for database
            try:
                project_uuid = uuid.UUID(project_id)
            except (ValueError, TypeError):
                project_uuid = None
        
        elapsed_ms = int((time.time() - start_time) * 1000)
        token_usage = resp.get("token_usage") if isinstance(resp, dict) else {}
        from ..services.search_persist import persist_search_exchange

        if auth_type == "widget":
            persist_search_exchange(
                user_id=user_id,
                project_uuid=project_uuid,
                session_id=session_id,
                message_id=message_id,
                query=req.query,
                answer=answer or "",
                sources=None,
                api_key_id=api_key_id,
                llm_config_dict=llm_config_dict,
                token_usage=token_usage,
                elapsed_ms=elapsed_ms,
                result_count=0,
                retrieval_meta=resp.get("retrieval_meta") if isinstance(resp, dict) else None,
                raw_contexts=raw_contexts,
                raw_contexts_metadatas=resp.get("raw_contexts_metadatas") if isinstance(resp, dict) else None,
                raw_chunk_similarity_pct=resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None,
                stage_timings_ms=resp.get("stage_timings_ms") if isinstance(resp, dict) else None,
                effective_rag_params={
                    "top_k": search_top_k,
                    "similarity_threshold": search_similarity_threshold,
                    "use_reranker": search_use_reranker,
                    "max_tokens": max_tokens,
                },
                embedding_provider=_search_emb_provider,
                embedding_model=_search_emb_model,
                search_language=search_language,
                explicit_status="out_of_context",
            )
        else:
            background_tasks.add_task(
                persist_search_exchange,
                user_id=user_id,
                project_uuid=project_uuid,
                session_id=session_id,
                message_id=message_id,
                query=req.query,
                answer=answer or "",
                sources=None,
                api_key_id=api_key_id,
                llm_config_dict=llm_config_dict,
                token_usage=token_usage,
                elapsed_ms=elapsed_ms,
                result_count=0,
                retrieval_meta=resp.get("retrieval_meta") if isinstance(resp, dict) else None,
                raw_contexts=raw_contexts,
                raw_contexts_metadatas=resp.get("raw_contexts_metadatas") if isinstance(resp, dict) else None,
                raw_chunk_similarity_pct=resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None,
                stage_timings_ms=resp.get("stage_timings_ms") if isinstance(resp, dict) else None,
                effective_rag_params={
                    "top_k": search_top_k,
                    "similarity_threshold": search_similarity_threshold,
                    "use_reranker": search_use_reranker,
                    "max_tokens": max_tokens,
                },
                embedding_provider=_search_emb_provider,
                embedding_model=_search_emb_model,
                search_language=search_language,
                explicit_status="out_of_context",
            )

        return create_success_response(
            data={
                "answer": answer,
                "sources": None,
                "message_id": str(message_id),
                "session_id": session_id,
                "retrieval_meta": resp.get("retrieval_meta"),
            },
            message="Search completed: Out of context"
        )

    # Since generate_topk=False, we don't have refined_answers - use raw_contexts directly
    raw_contexts_metadatas = resp.get("raw_contexts_metadatas", [])
    # raw_contexts already defined above
    
    # Debug logging
    logger.info(f"RAG Response - contexts count: {len(raw_contexts)}, metadatas count: {len(raw_contexts_metadatas)}")
    logger.debug(f"Requested topK: {search_top_k}")
    
    if len(raw_contexts) < search_top_k:
        logger.debug(
            "Retrieved %d contexts, requested topK %d",
            len(raw_contexts),
            req.topK,
        )

    from ..services.search_sources import build_search_sources_from_contexts

    raw_chunk_sim = resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None
    sources = build_search_sources_from_contexts(
        list(raw_contexts),
        list(raw_contexts_metadatas) if raw_contexts_metadatas else [],
        raw_chunk_sim,
        top_k=search_top_k,
        answer=answer,
        user_query=req.query,
        live_item_ids=_live_coverage_item_ids(db, project_uuid),
        system_prompt=system_prompt,
    )

    message_id = uuid.uuid4()
    session_id = search_session_id
    final_sources = sources[:search_top_k] if len(sources) > search_top_k else sources
    elapsed_ms = int((time.time() - start_time) * 1000)
    token_usage = resp.get("token_usage") if isinstance(resp, dict) else {}
    from ..services.search_persist import persist_search_exchange

    persist_kwargs = dict(
        user_id=user_id,
        project_uuid=project_uuid,
        session_id=session_id,
        message_id=message_id,
        query=req.query,
        answer=answer or "",
        sources=final_sources,
        api_key_id=api_key_id,
        llm_config_dict=llm_config_dict,
        token_usage=token_usage,
        elapsed_ms=elapsed_ms,
        result_count=len(final_sources),
        retrieval_meta=resp.get("retrieval_meta") if isinstance(resp, dict) else None,
        raw_contexts=raw_contexts,
        raw_contexts_metadatas=raw_contexts_metadatas,
        raw_chunk_similarity_pct=raw_chunk_sim,
        stage_timings_ms=resp.get("stage_timings_ms") if isinstance(resp, dict) else None,
        effective_rag_params={
            "top_k": search_top_k,
            "similarity_threshold": search_similarity_threshold,
            "use_reranker": search_use_reranker,
            "max_tokens": max_tokens,
        },
        embedding_provider=_search_emb_provider,
        embedding_model=_search_emb_model,
        search_language=search_language,
    )
    # Persist before responding so Search Test feedback can resolve message_id immediately.
    persist_search_exchange(**persist_kwargs)

    return create_success_response(
        data={
            "answer": answer,
            "sources": final_sources,
            "message_id": str(message_id),
            "session_id": session_id,
            "retrieval_meta": resp.get("retrieval_meta"),
        },
        message="Search completed",
    )


@router.post("/search/stream", tags=["search"])
@limiter.limit("60/minute")
async def search_stream(
    req: RagQuery,
    request: Request,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user),
):
    """Streaming search endpoint. Returns Server-Sent Events with tokens, then sources on done."""
    _sse_headers = {
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    }

    if not RAG_AVAILABLE or not rag_pipeline:
        raise HTTPException(status_code=503, detail="RAG pipeline is not available")

    start_time = time.time()
    from ..services.search_run_context import resolve_search_run_context

    ctx = resolve_search_run_context(
        db,
        auth_result,
        req,
        rag_pipeline=rag_pipeline,
        load_history_fn=_load_conversation_history,
    )

    auth_type = ctx.auth_type
    user_id = ctx.user_id
    api_key_id = ctx.api_key_id
    project_id = ctx.project_id
    project_uuid = ctx.project_uuid
    search_session_id = ctx.search_session_id

    assistant_message_id = uuid.uuid4()

    async def _event_stream():
        import threading

        loop = asyncio.get_event_loop()
        q: asyncio.Queue = asyncio.Queue()
        full_text_parts: List[str] = []
        meta_result: Dict[str, Any] = {}

        def _run_stream():
            try:
                for delta, meta in rag_pipeline.stream_query(
                    user_query=req.query,
                    top_k=ctx.search_top_k,
                    max_tokens=ctx.max_tokens,
                    user_id=user_id,
                    project_id=project_id,
                    llm_config=ctx.llm_config_dict,
                    system_prompt=ctx.system_prompt,
                    language_code=ctx.search_language,
                    similarity_threshold=ctx.search_similarity_threshold,
                    use_reranker=ctx.search_use_reranker,
                    chat_history=ctx.recent_search_history or None,
                    semantic_confidence_floor=req.semanticConfidenceFloor,
                    keyword_score_floor=req.keywordScoreFloor,
                    mode="search",
                    format_type=ctx.search_format_type,
                    enable_keyword_fallback=req.enableKeywordFallback,
                    embedding_provider=ctx.embedding_provider,
                    embedding_model=ctx.embedding_model,
                    embedding_api_key=ctx.embedding_api_key,
                ):
                    loop.call_soon_threadsafe(q.put_nowait, (delta, meta))
            except Exception as exc:
                loop.call_soon_threadsafe(q.put_nowait, (None, {"error": str(exc)}))
            finally:
                loop.call_soon_threadsafe(q.put_nowait, None)

        thread = threading.Thread(target=_run_stream, daemon=True)
        thread.start()
        yield ": keepalive\n\n"
        sources_emitted = False
        _early_live_ids = _live_coverage_item_ids(db, project_uuid)

        try:
            while True:
                try:
                    item = await asyncio.wait_for(q.get(), timeout=10.0)
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
                    continue
                if item is None:
                    break
                delta, meta = item
                if delta is None and meta and "error" in meta:
                    friendly = format_llm_error_for_user(meta["error"])
                    err_payload = json.dumps({
                        "token": friendly,
                        "done": True,
                        "message_id": str(assistant_message_id),
                        "session_id": search_session_id,
                    })
                    yield f"data: {err_payload}\n\n"
                    return
                if delta and meta is None:
                    full_text_parts.append(delta)
                    yield f"data: {json.dumps({'token': delta, 'done': False})}\n\n"
                elif meta is not None:
                    if meta.get("retrieval_ready"):
                        if not sources_emitted:
                            try:
                                from ..services.search_sources import build_search_sources_from_contexts
                                early_sources = build_search_sources_from_contexts(
                                    list(meta.get("raw_contexts") or []),
                                    list(meta.get("raw_contexts_metadatas") or []),
                                    meta.get("raw_chunk_similarity_pct"),
                                    top_k=ctx.search_top_k,
                                    answer="(pending)",
                                    user_query=req.query,
                                    live_item_ids=_early_live_ids,
                                )
                                if early_sources:
                                    yield f"data: {json.dumps({'sources': early_sources})}\n\n"
                                    sources_emitted = True
                            except Exception:
                                logger.exception("Early sources emission failed")
                        continue
                    if delta:
                        full_text_parts.append(delta)
                        yield f"data: {json.dumps({'token': delta, 'done': False})}\n\n"
                    meta_result = meta
        except asyncio.CancelledError:
            return

        joined_raw = "".join(full_text_parts)
        # Prefer pipeline-resolved full_text (extractive fallback after OOC sentinel).
        resolved_from_meta = ""
        if isinstance(meta_result, dict):
            resolved_from_meta = str(meta_result.get("full_text") or "").strip()
        streamed_answer = joined_raw
        full_answer = _refine_answer(resolved_from_meta or joined_raw)
        full_answer = _normalize_ooc_answer_text(full_answer, raw_llm=joined_raw) or full_answer

        stream_sources: List[Dict[str, Any]] = []
        if isinstance(meta_result, dict):
            from ..services.search_sources import build_search_sources_from_contexts

            raw_contexts = meta_result.get("raw_contexts") or []
            raw_metas = meta_result.get("raw_contexts_metadatas") or []
            raw_chunk_sim = meta_result.get("raw_chunk_similarity_pct")
            stream_sources = build_search_sources_from_contexts(
                list(raw_contexts),
                list(raw_metas),
                raw_chunk_sim,
                top_k=ctx.search_top_k,
                answer=full_answer,
                user_query=req.query,
                live_item_ids=_live_coverage_item_ids(db, project_uuid),
                system_prompt=ctx.system_prompt,
            )

        elapsed_ms = int((time.time() - start_time) * 1000)
        stream_token_usage = (
            meta_result.get("token_usage") if isinstance(meta_result, dict) else {}
        ) or {}
        from ..services.search_persist import persist_search_exchange

        persist_kwargs = dict(
            user_id=user_id,
            project_uuid=project_uuid,
            session_id=search_session_id,
            message_id=assistant_message_id,
            query=req.query,
            answer=full_answer or "",
            sources=stream_sources if stream_sources else None,
            api_key_id=api_key_id,
            llm_config_dict=ctx.llm_config_dict,
            token_usage=stream_token_usage,
            elapsed_ms=elapsed_ms,
            result_count=len(stream_sources),
            retrieval_meta=meta_result.get("retrieval_meta") if isinstance(meta_result, dict) else None,
            raw_contexts=meta_result.get("raw_contexts") if isinstance(meta_result, dict) else None,
            raw_contexts_metadatas=meta_result.get("raw_contexts_metadatas") if isinstance(meta_result, dict) else None,
            raw_chunk_similarity_pct=meta_result.get("raw_chunk_similarity_pct") if isinstance(meta_result, dict) else None,
            stage_timings_ms=meta_result.get("stage_timings_ms") if isinstance(meta_result, dict) else None,
            effective_rag_params={
                "top_k": ctx.search_top_k,
                "similarity_threshold": ctx.search_similarity_threshold,
                "use_reranker": ctx.search_use_reranker,
                "max_tokens": ctx.max_tokens,
            },
            embedding_provider=ctx.embedding_provider,
            embedding_model=ctx.embedding_model,
            search_language=ctx.search_language,
        )

        done_payload: Dict[str, Any] = {
            "token": "",
            "done": True,
            "message_id": str(assistant_message_id),
            "session_id": search_session_id,
            "retrieval_meta": meta_result.get("retrieval_meta") if isinstance(meta_result, dict) else None,
            "sources": stream_sources,
            "token_usage": stream_token_usage,
            "final_answer": full_answer,
            "answer_updated": (full_answer or "").strip() != (streamed_answer or "").strip(),
        }
        logger.info("Search stream done: sources=%d, answer_len=%d", len(stream_sources), len(full_answer or ""))
        yield f"data: {json.dumps(done_payload)}\n\n"
        try:
            persist_search_exchange(**persist_kwargs)
        except Exception as persist_err:
            logger.warning("search stream persist failed after done: %s", persist_err)

    return StreamingResponse(
        _event_stream(),
        media_type="text/event-stream; charset=utf-8",
        headers=_sse_headers,
    )


@router.get("/search/history", tags=["search"])
async def get_search_history(
    session_id: Optional[str] = None,
    q: Optional[str] = Query(None, description="Search substring in user or assistant message"),
    project_id: Optional[str] = Query(None, description="Project to scope history (defaults to active project)"),
    limit: int = 50,
    offset: int = 0,
    source: Optional[str] = Query(None, description="Source of request: 'widget' for chatbot widget, 'page' for history page (default: 'page')"),
    grouped: bool = Query(False, description="Return messages grouped by 24-hour periods (date)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
):
    """
    Get search history - SEARCH ONLY.
    Filters by message_type='search' to ensure only search messages are returned.
    This endpoint will NOT return chat messages.
    
    Behavior:
    - If source='widget' and session_id provided: Returns messages from database for that session only (for widget display)
    - If source='page' or no source: Returns ALL historical search messages from database (for history page)
    - History page always shows all messages from database, regardless of widget clears
    - If grouped=True: Returns messages grouped by date (24-hour periods) for easier frontend rendering
    """
    try:
        active_project = _resolve_history_project(db, current_user, project_id)
        if not active_project:
            if grouped:
                return {"grouped": True, "groups": [], "total_messages": 0}
            return []

        # Filter by user, scoped project, message_type='search'
        query = db.query(ChatMessage).filter(
            and_(
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
                ChatMessage.message_type == "search"  # CRITICAL: Only search messages
            )
        )
        
        # If source is 'widget' and session_id is provided, filter by session_id
        # Widget only shows messages that are NOT hidden from widget
        # If source is 'page' or not provided, show all messages including hidden ones (no session filter)
        if source == "widget" and session_id:
            query = query.filter(ChatMessage.session_id == session_id)
            # Hide messages marked as hidden_from_widget (graceful handling if column doesn't exist)
            try:
                query = query.filter(ChatMessage.hidden_from_widget == False)
            except AttributeError:
                # Column doesn't exist yet, show all messages
                pass
        elif source != "widget" and session_id:
            # For history page, still allow filtering by session_id if needed
            query = query.filter(ChatMessage.session_id == session_id)
        elif source == "widget":
            # Widget without session_id: also filter out hidden messages
            try:
                query = query.filter(ChatMessage.hidden_from_widget == False)
            except AttributeError:
                # Column doesn't exist yet, show all messages
                pass

        if q and q.strip():
            pat = f"%{q.strip()}%"
            query = query.filter(
                or_(
                    ChatMessage.user_message.ilike(pat),
                    ChatMessage.assistant_response.ilike(pat),
                )
            )
            
        # Order by creation time descending (newest first)
        messages = query.order_by(ChatMessage.created_at.desc()).offset(offset).limit(limit).all()
        
        # If grouped=True, group messages by date (24-hour periods)
        # OVERRIDE: User requested "every message separately shown", so we force grouped=False
        # regardless of what frontend requests.
        grouped = False
        if grouped:
            from collections import defaultdict
            from datetime import datetime, timezone
            
            # Group messages by date
            grouped_messages = defaultdict(list)
            for message in messages:
                # Get the date in UTC (24-hour period)
                message_date = message.created_at.date() if message.created_at else datetime.now(timezone.utc).date()
                date_str = message_date.isoformat()  # Format: YYYY-MM-DD
                grouped_messages[date_str].append(message)
            
            # Convert to list of groups with date labels
            grouped_list = []
            for date_str in sorted(grouped_messages.keys(), reverse=True):  # Newest dates first
                grouped_list.append({
                    "date": date_str,
                    "messages": [_chat_message_history_list_out(msg).model_dump() for msg in grouped_messages[date_str]]
                })
            
            return {
                "grouped": True,
                "groups": grouped_list,
                "total_messages": len(messages)
            }
        else:
            # Return flat list for backward compatibility
            return [_chat_message_history_list_out(msg).model_dump() for msg in messages]
    except Exception as e:
        logger.error(f"Error retrieving search history: {e}", exc_info=True)
        # Return empty list/object instead of raising error to allow user to continue
        if grouped:
            return {"grouped": True, "groups": [], "total_messages": 0}
        return []

@router.get("/search/sessions", tags=["search"])
async def list_search_sessions(
    project_id: Optional[str] = Query(None, description="Project to scope sessions (defaults to active project)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    List search sessions grouped by day - SEARCH ONLY (excludes chat sessions).
    Returns sessions in the same format as chat sessions, with daily session IDs.
    All searches on the same day share one session (format: search_{user_id}_{YYYY-MM-DD}).
    """
    active_project = _resolve_history_project(db, current_user, project_id)
    if not active_project:
        return create_success_response(
            data={"sessions": [], "count": 0, "sessions_by_date": {}},
            message="Search sessions retrieved (grouped by day)",
        )

    # Get distinct search sessions with their dates
    # Group by session_id and extract the date from created_at for grouping
    sessions = (
        db.query(
            ChatMessage.session_id,
            func.date(ChatMessage.created_at).label('date')
        )
        .filter(
            and_(
                ChatMessage.user_id == current_user.id,
                ChatMessage.project_id == active_project.id,
                ChatMessage.message_type == "search"  # CRITICAL: Only search sessions
            )
        )
        .distinct()
        .order_by(func.date(ChatMessage.created_at).desc())  # Order by date descending (newest first)
        .all()
    )
    
    # Extract session IDs (same format as chat sessions endpoint)
    session_list = [session[0] for session in sessions]
    
    # Also group by date for easier frontend consumption
    sessions_by_date = {}
    for session_id, date in sessions:
        date_str = date.isoformat() if date else None
        if date_str:
            if date_str not in sessions_by_date:
                sessions_by_date[date_str] = []
            sessions_by_date[date_str].append(session_id)
    
    return create_success_response(
        data={
            "sessions": session_list, 
            "count": len(session_list),
            "sessions_by_date": sessions_by_date  # Additional grouping by date
        },
        message="Search sessions retrieved (grouped by day)"
    )

@router.delete("/search/sessions/{session_id}", tags=["search"])
async def clear_search_session(
    session_id: str,
    source: Optional[str] = Query(None, description="Source of request: 'widget' for chatbot widget (clears in-memory only), 'page' for history page (deletes from DB)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """
    Clear a search session - SEARCH ONLY.
    Only deletes messages with message_type='search' in this session.
    Chat messages in the same session are not affected.
    
    Behavior:
    - If source='widget' or not provided: Hides messages from widget, keeps in database
    - If source='page': Deletes search messages from database (permanent deletion)
    """
    # Log the source parameter for debugging
    logger.info(f"Clear search session request: session_id={session_id}, source={source}, user_id={current_user.id}")
    
    # For search sessions, if source is None (not provided), assume it's from history page and do hard delete
    # This ensures search sessions are actually deleted when called from history page
    # If source='widget', do soft delete (hide from widget)
    if source is None:
        source = "page"  # Default to hard delete for search sessions (permanent deletion)
    elif source != "page":
        source = "widget"  # Treat as widget delete (soft delete/hide)
    
    if source == "widget":
        # Widget clear: Mark all messages in session as hidden from widget, but keep in database for history page
        if _column_exists_in_table(db, 'chat_messages', 'hidden_from_widget'):
            # Column exists - mark all search messages in this session as hidden from widget
            try:
                updated_count = db.query(ChatMessage).filter(
                    and_(
                        ChatMessage.session_id == session_id,
                        ChatMessage.user_id == current_user.id,
                        ChatMessage.message_type == "search"  # CRITICAL: Only search messages
                    )
                ).update({"hidden_from_widget": True, "updated_at": datetime.now(timezone.utc)}, synchronize_session=False)
                db.commit()
                
                return create_success_response(
                    data={"session_id": session_id, "messages_hidden": updated_count},
                    message=f"Search session {session_id} hidden from chatbot widget (still visible in history page)"
                )
            except Exception as e:
                logger.error(f"Error hiding search session from widget: {e}")
                db.rollback()
                return create_success_response(
                    data={"session_id": session_id, "messages_hidden": 0},
                    message=f"Search session {session_id} not found or error hiding messages"
                )
        else:
            # Column doesn't exist yet - DO NOT DELETE, just return message
            logger.warning("hidden_from_widget column not found - migration needed. Messages will remain in database.")
            return create_success_response(
                data={"session_id": session_id, "messages_deleted": 0, "migration_needed": True},
                message=f"Search session {session_id} cannot be hidden (migration needed to hide from widget while keeping in history)"
            )
    else:
        # History page clear: Delete from database (permanent) - removes from both widget and history
        # CRITICAL: Only delete search messages, not chat messages
        # Check if session exists
        session_messages = db.query(ChatMessage).filter(
            and_(
                ChatMessage.session_id == session_id,
                ChatMessage.user_id == current_user.id,
                ChatMessage.message_type == "search"  # CRITICAL: Only search messages
            )
        ).all()
        
        # Debug: Check if session exists with different message_type (might be chat session)
        if not session_messages:
            # Check if it's a chat session
            chat_session = db.query(ChatMessage).filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id,
                    ChatMessage.message_type == "chat"
                )
            ).first()
            
            if chat_session:
                logger.warning(f"Session {session_id} is a chat session, not a search session. Use /api/v1/chat/sessions endpoint to delete.")
                raise HTTPException(
                    status_code=400, 
                    detail=f"Session '{session_id}' is a chat session. Use the chat delete endpoint to delete it."
                )
            
            # Check if session exists at all (any message_type)
            any_session = db.query(ChatMessage).filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id
                )
            ).first()
            
            if any_session:
                logger.warning(f"Session {session_id} found but message_type is '{any_session.message_type}', not 'search'")
                raise HTTPException(
                    status_code=400,
                    detail=f"Session '{session_id}' is not a search session (type: {any_session.message_type})"
                )
            
            logger.warning(f"Search session {session_id} not found for user {current_user.id}")
            raise HTTPException(status_code=404, detail=f"Search session '{session_id}' not found")
        
        # Delete all messages in this session
        deleted_count = (
            db.query(ChatMessage)
            .filter(
                and_(
                    ChatMessage.session_id == session_id,
                    ChatMessage.user_id == current_user.id,
                    ChatMessage.message_type == "search"  # CRITICAL: Only search messages
                )
            )
            .delete()
        )
        
        db.commit()
        
        logger.info(f"Permanently deleted {deleted_count} search message(s) from session {session_id} for user {current_user.id}")
        
        return create_success_response(
            data={"session_id": session_id, "messages_deleted": deleted_count},
            message=f"Search session permanently deleted ({deleted_count} message(s) removed from both widget and history)"
        )

@router.post("/search/feedback", tags=["search"])
async def submit_search_feedback(
    req: FeedbackRequest,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Submit feedback for a search message - SEARCH ONLY.
    Only accepts feedback for messages with message_type='search'.
    Chat messages will be rejected.
    """
    try:
        message_uuid = uuid.UUID(req.message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")
    
    query = db.query(ChatMessage).filter(
        and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.message_type == "search",
        )
    )
    if auth["type"] == "user":
        query = query.filter(ChatMessage.user_id == auth["user"].id)
    elif auth["type"] == "widget":
        project_id = auth["project_id"]
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass
        query = query.filter(ChatMessage.project_id == project_id)
    elif auth["type"] == "api_key":
        ak = auth["api_key"]
        if not getattr(ak, "project_id", None):
            raise HTTPException(status_code=403, detail="API key must be project-scoped")
        query = query.filter(ChatMessage.project_id == ak.project_id)

    chat_message = query.first()
    
    if not chat_message:
        raise HTTPException(status_code=404, detail="Search message not found")

    if not _is_search_feedback_enabled(db, chat_message.project_id):
        raise HTTPException(status_code=403, detail="Feedback collection is disabled for this project")

    from ..services.feedback_reason_catalog import normalize_context_tags

    allowed_tags, unknown_tags = normalize_context_tags(req.context_tags)
    if unknown_tags:
        logger.info("Dropped unknown search feedback context_tags for message %s: %s", req.message_id, unknown_tags)

    chat_message.feedback = req.feedback
    chat_message.feedback_rating = req.rating
    chat_message.feedback_text = req.feedback_text
    chat_message.context_tags = allowed_tags if allowed_tags else None
    chat_message.updated_at = datetime.now(timezone.utc)
    db.commit()

    return create_success_response(
        data={
            "session_id": req.session_id,
            "message_id": req.message_id,
            "feedback": req.feedback,
            "feedback_type": "positive" if req.feedback else "negative",
            "rating": req.rating,
            "feedback_text": req.feedback_text,
            "context_tags": allowed_tags,
        },
        message="Feedback recorded"
    )

@router.get("/search/messages/{message_id}", response_model=ChatMessageOut, tags=["search"])
async def get_search_message_detail(
    message_id: str,
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user),
):
    """Return one search message including execution_snapshot."""
    try:
        message_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid message_id format")

    if auth["type"] == "widget":
        project_id = auth["project_id"]
        if isinstance(project_id, str):
            try:
                project_id = uuid.UUID(project_id)
            except ValueError:
                pass
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.project_id == project_id,
            ChatMessage.message_type == "search",
        )
    else:
        user = auth["user"]
        query_filter = and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.user_id == user.id,
            ChatMessage.message_type == "search",
        )

    row = db.query(ChatMessage).filter(query_filter).first()
    if not row:
        raise HTTPException(status_code=404, detail="Search message not found")
    from ..services.execution_snapshot_metrics import effective_execution_snapshot

    payload = ChatMessageOut.model_validate(row).model_dump()
    payload["execution_snapshot"] = effective_execution_snapshot(db, row)
    return ChatMessageOut.model_validate(payload)

@router.delete("/search/messages/{message_id}", tags=["search"])
async def delete_search_message_endpoint(
    message_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Delete a search message - SEARCH ONLY.
    Only deletes messages with message_type='search'.
    Chat messages cannot be deleted through this endpoint.
    """
    try:
        message_uuid = uuid.UUID(message_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid ID")
    
    # Explicitly filter to ensure only search messages can be deleted
    msg = db.query(ChatMessage).filter(
        and_(
            ChatMessage.message_id == message_uuid,
            ChatMessage.user_id == current_user.id,
            ChatMessage.message_type == "search"  # CRITICAL: Only search messages
        )
    ).first()
    
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found")
    
    # Delete the message
    db.delete(msg)
    deleted_count = 1
    
    db.commit()
    
    return create_success_response(
        data={"messages_deleted": deleted_count},
        message=f"Search message deleted successfully"
    )

@router.delete("/search/messages", tags=["search"])
async def delete_all_search_messages(
    source: Optional[str] = Query(None, description="Source of request (logged for debugging)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    active_project: Project = Depends(get_active_project)
):
    """
    Delete all search messages for the current user - SEARCH ONLY.
    Only deletes messages with message_type='search'.
    
    Behavior:
    - ALWAYS deletes search messages from database (permanent deletion).
    - Search does not support 'soft delete' or 'hiding'.
    """
    # Log the request
    logger.info(f"Delete all search messages request: source={source}, user_id={current_user.id}, project_id={active_project.id}")
    
    # Perform permanent delete
    deleted_count = db.query(ChatMessage).filter(
        and_(
            ChatMessage.user_id == current_user.id,
            ChatMessage.project_id == active_project.id,
            ChatMessage.message_type == "search"  # CRITICAL: Only search messages
        )
    ).delete()
    
    db.commit()
    
    return create_success_response(
        data={"messages_deleted": deleted_count},
        message=f"Deleted {deleted_count} search message(s) from database"
    )

class SearchActivateRequest(BaseModel):
    """Request model for search activation"""
    is_active: Optional[bool] = None

@router.put("/search/activate", tags=["search"], status_code=status.HTTP_200_OK)
async def activate_search(
    request: Optional[SearchActivateRequest] = Body(None),
    is_active: Optional[bool] = Query(None, description="Activate (true) or deactivate (false) the search"),
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Activate or deactivate the search functionality - SEARCH ONLY.
    When deactivated, search endpoints will not work.
    Accepts is_active as query parameter or in JSON body.
    If neither is provided, defaults to toggling the current state.
    """
    # Get is_active from query parameter or request body
    if is_active is None:
        if request and request.is_active is not None:
            is_active = request.is_active
        else:
            # If not provided, get current state and toggle it
            user_id = auth_result["user_id"]
            active_project = None
            if auth_result["type"] == "widget":
                 project_id = auth_result.get("project_id")
                 if project_id:
                     try:
                         project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                         active_project = db.query(Project).filter(Project.id == project_uuid).first()
                     except: pass
            else:
                active_project = _get_active_project(db, user_id)
            
            if active_project:
                search_settings = db.query(SearchSettings).filter(
                    and_(
                        SearchSettings.user_id == user_id,
                        SearchSettings.project_id == active_project.id
                    )
                ).first()
                if search_settings:
                    try:
                        # Read current DB value and toggle it - direct mapping (no inversion)
                        current_db_state = search_settings.is_search_active
                        is_active = not current_db_state  # Toggle: if DB is True, send False to UI, and vice versa
                        logger.info(f"Toggle logic: current DB={current_db_state}, toggled to UI={is_active}")
                    except Exception:
                        is_active = True  # Default to True (enabled)
                else:
                    is_active = True  # Default to True if no settings
            else:
                is_active = True  # Default to True if no project
    
    if is_active is None:
        raise HTTPException(
            status_code=400,
            detail="is_active parameter is required (as query parameter or in JSON body)"
        )
    
    try:
        # Get active project for the user
        user_id = auth_result["user_id"]
        active_project = None
        if auth_result["type"] == "widget":
             project_id = auth_result.get("project_id")
             if project_id:
                 try:
                     project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                     active_project = db.query(Project).filter(Project.id == project_uuid).first()
                 except: pass
        else:
            active_project = _get_active_project(db, user_id)

        if not active_project:
            raise HTTPException(
                status_code=404,
                detail="No active project found. Please create or activate a project first."
            )
        
        # Get or create SearchSettings for the active project (separate table for search settings)
        search_settings = db.query(SearchSettings).filter(
            and_(
                SearchSettings.user_id == user_id,
                SearchSettings.project_id == active_project.id
            )
        ).first()
        
        if search_settings:
            # Simple direct assignment - same as chatbot activation
            old_value = search_settings.is_search_active
            search_settings.is_search_active = is_active
            try:
                db.commit()
                logger.info(f"Committed search activation change: {old_value} -> {is_active} for user {user_id}, project {active_project.id}")
            except Exception as e:
                db.rollback()
                logger.error(f"Error committing search activation: {e}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error saving search activation status: {str(e)}"
                )
            db.refresh(search_settings)
            # Verify the saved value
            verified_value = search_settings.is_search_active
            logger.info(f"Search activation status updated: UI sent={is_active}, saved={is_active}, verified in DB={verified_value} for user {user_id}, project {active_project.id}")
            if verified_value != is_active:
                logger.error(f"CRITICAL: Value mismatch after save! Expected {is_active}, but DB has {verified_value}")
        else:
            # Create new SearchSettings with search activation status - same pattern as chatbot
            try:
                search_settings = SearchSettings(
                    user_id=user_id,
                    project_id=active_project.id,
                    is_search_active=is_active
                )
                db.add(search_settings)
                try:
                    db.commit()
                    logger.info(f"Committed new SearchSettings with is_search_active={is_active} for user {user_id}, project {active_project.id}")
                except Exception as e:
                    db.rollback()
                    logger.error(f"Error committing new SearchSettings: {e}", exc_info=True)
                    raise HTTPException(
                        status_code=500,
                        detail=f"Error saving search activation status: {str(e)}"
                    )
                db.refresh(search_settings)
                # Verify the saved value
                verified_value = search_settings.is_search_active
                logger.info(f"Created new SearchSettings: UI sent={is_active}, saved={is_active}, verified in DB={verified_value} for user {user_id}, project {active_project.id}")
                if verified_value != is_active:
                    logger.error(f"CRITICAL: Value mismatch after create! Expected {is_active}, but DB has {verified_value}")
            except HTTPException:
                raise
            except Exception as e:
                db.rollback()
                logger.error(f"Error creating search settings: {e}", exc_info=True)
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating search activation status: {str(e)}"
                )
        
        logger.info(f"Search activation status updated for user {user_id}: {is_active}")
        
        # Return same format as chatbot activation
        return create_success_response(
            data={
                "is_active": is_active
            },
            message=f"Search {'activated' if is_active else 'deactivated'} successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in activate_search: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error updating search activation status: {str(e)}"
        )

@router.get("/search/activate", tags=["search"], status_code=status.HTTP_200_OK)
async def get_search_activation_status(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Get the current activation status of search functionality - SEARCH ONLY.
    Returns the is_search_active status for the user's active project.
    """
    # Get active project for the user
    user_id = auth_result["user_id"]
    active_project = None
    if auth_result["type"] == "widget":
         project_id = auth_result.get("project_id")
         if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except: pass
    else:
        active_project = _get_active_project(db, user_id)

    if not active_project:
        return create_success_response(
            data={
                "is_active": True  # Default to active if no project/settings
            },
            message="No project found, defaulting to active"
        )
    
    # Get SearchSettings (separate table for search settings)
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    # Default to True if no settings exist - same as chatbot
    is_active = True
    if search_settings:
        # Simple direct read - same as chatbot activation
        try:
            is_active = search_settings.is_search_active
        except Exception as e:
            # Column might not exist in database yet
            logger.warning(f"Could not read is_search_active: {e}, defaulting to True")
            is_active = True
    
    return create_success_response(
        data={
            "is_active": is_active
        },
        message="Search activation status retrieved successfully"
    )
