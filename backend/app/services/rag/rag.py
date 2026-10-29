import copy
import time
import os
import sys
# Workaround for OpenTelemetry ReadableLogRecord import error
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
    try:
        import opentelemetry.sdk._logs as otel_logs_module
        if not hasattr(otel_logs_module, 'ReadableLogRecord'):
            otel_logs_module.ReadableLogRecord = ReadableLogRecord
    except Exception:
        pass  # If module doesn't exist, that's fine

import uuid
import logging
import re
import hashlib
import json
import threading
import queue
from typing import Callable, List, Dict, Optional, Any, Sequence, Tuple, Set
from pathlib import Path

import redis
import asyncio
import concurrent.futures

from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

from .source_display_config import display_sources_min_chunk_similarity_pct
from .live_coverage import chunk_references_live_item
from . import (
    answer_cache,
    answer_completion,
    answer_next_step,
    answer_verification,
    chunk_context,
    citation_trailer,
    constraint_boost,
    cross_encoder,
    grounding_guard,
    hard_scope,
    hybrid_fusion,
    info_pages,
    item_answers,
    keyword_candidates,
    language_preference,
    lexical_index,
    page_kinds,
    query_embedding_cache,
    query_keywords,
    query_signals,
    record_evidence,
    retrieval_policy,
    scoped_query,
    denylist_filter,
    source_availability,
    source_routing,
    task_requests,
)
from . import query_processing
from ..feedback_training import hook as feedback_memory_hook
from .query_language import normalize_lang_code
from .query_processing import ProcessedQuery


def _rag_cache_aligned_with_chunk_similarity(cached: Dict[str, Any]) -> bool:
    """
    Per-chunk display floors need raw_chunk_similarity_pct aligned 1:1 with raw_contexts.
    Older cache entries may omit or truncate that list; treat them as incompatible.
    """
    rctx = cached.get("raw_contexts")
    pct = cached.get("raw_chunk_similarity_pct")
    if not isinstance(rctx, list):
        return True
    if not isinstance(pct, list) or len(pct) != len(rctx):
        return False
    return True


from ..llmconn import LLMFactory
from ...defaults import DEFAULT_EMBEDDING_MODEL
from ...settings import settings
from .embedder_factory import (
    DEFAULT_COLLECTION_NAME,
    collection_name_for,
    get_embedding_meta,
    get_raw_embedder,
)

from .utils_rag import (
    normalize_url,
    extract_text_from_file,
    batch_iterate,
    _as_primitive,
)
from .vector_store.client import VectorDB

# --- Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(os.getcwd())


EMBED_BATCH_SIZE = 32
# Hosted embedding APIs enforce per-input and per-request token (and sometimes item) limits.
# Reindex sends full crawled pages; batching must stay within vendor caps or requests fail.
DEFAULT_TOP_K = 5


def _redis_host_port() -> Tuple[str, int]:
    from ..infra_env import redis_host, redis_port

    # RAG query cache: prefer configured host; localhost when unset (legacy behavior).
    return (redis_host() or "localhost"), redis_port()

def _env_float(name: str, default: float) -> float:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return float(value)
    except (TypeError, ValueError):
        logger.warning(f"Invalid {name}='{value}', using default {default}")
        return default

def _env_int(name: str, default: int) -> int:
    value = os.environ.get(name)
    if value is None:
        return default
    try:
        return int(value)
    except (TypeError, ValueError):
        logger.warning(f"Invalid {name}='{value}', using default {default}")
        return default


# --- Tiered Retrieval Constants (configurable, override per-request within bounded limits) ---
TIER1_TOP1_SIM_FLOOR: float = 0.16      # semantic top-1 similarity minimum (lowered: 0.22→0.16)
TIER1_TOP3_MEAN_FLOOR: float = 0.20     # semantic top-3 mean minimum (lowered: 0.28→0.20)
TIER1_LEXICAL_OVERLAP_FLOOR: float = 0.10  # fraction of query keywords that must appear in top chunks (0.15→0.10)
TIER1_DUPLICATE_RATIO_MAX: float = 0.70    # max allowed near-duplicate chunk ratio
TIER2_KEYWORD_SCORE_FLOOR: float = 0.20    # minimum keyword aggregate score to accept Tier 2 result (0.35→0.20)
TIER2_MAX_FETCH_CHUNKS: int = _env_int("TIER2_MAX_FETCH_CHUNKS", 300)  # cap on chunks fetched from the vector store for keyword pass
TIER2_LARGE_COLLECTION_THRESHOLD: int = _env_int("TIER2_LARGE_COLLECTION_THRESHOLD", 5000)  # vector count above which keyword fetch is reduced
TIER2_LARGE_COLLECTION_FETCH_CHUNKS: int = _env_int("TIER2_LARGE_COLLECTION_FETCH_CHUNKS", 100)  # keyword fetch for large collections
KEYWORD_RETRIEVAL_TIMEOUT_SECONDS: float = _env_float("KEYWORD_RETRIEVAL_TIMEOUT_SECONDS", 4.0)  # tighter budget for keyword branch in parallel mode
LEXICAL_CANDIDATES: int = _env_int("RAG_LEXICAL_CANDIDATES", 40)  # full-text index hits considered per query
LEXICAL_CODE_CANDIDATES: int = _env_int("RAG_LEXICAL_CODE_CANDIDATES", 10)  # exact identifier hits put first
CHAT_MAX_CHUNKS_PER_PAGE: int = _env_int("RAG_CHAT_MAX_CHUNKS_PER_PAGE", 3)  # before other pages get a turn
SEMANTIC_POOL_MAX: int = _env_int("RAG_SEMANTIC_POOL_MAX", 40)  # semantic candidates fused with the full-text index
SCOPED_QUERY_TIMEOUT_S: float = float(_env_int("RAG_SCOPED_QUERY_TIMEOUT_MS", 3000)) / 1000.0
INFO_PAGE_INJECT_MAX: int = _env_int("RAG_INFO_PAGE_INJECT_MAX", 4)
RETRIEVAL_TIMEOUT_SECONDS: float = _env_float("RETRIEVAL_TIMEOUT_SECONDS", 10.0)  # timeout for embedding + vector query calls

# Hard deadline for the LLM streaming loop: if no token arrives within this many
# seconds on first chunk (or between tokens), we abort cleanly.
LLM_STREAM_FIRST_TOKEN_TIMEOUT_S: float = _env_float("LLM_STREAM_FIRST_TOKEN_TIMEOUT_S", 25.0)
LLM_STREAM_INTER_TOKEN_TIMEOUT_S: float = _env_float("LLM_STREAM_INTER_TOKEN_TIMEOUT_S", 15.0)

# TTL for cached collection.count() results (seconds). Avoids a COUNT on every query
# while still detecting large new ingests within a minute.
_COLLECTION_SIZE_CACHE_TTL: float = 60.0
_collection_size_cache: Dict[str, Tuple[int, float]] = {}
_collection_size_cache_lock: threading.Lock = threading.Lock()

_GEO_QUERY_EXPANSION: Dict[str, str] = {
    "en": "headquarters office address city based in",
    "de": "Hauptsitz Firmensitz Adresse Standort Stadt Sitz in",
}

# --- Hybrid retrieval constants ---
RRF_K: int = 60                             # RRF dampening constant (60 is the canonical default)
CE_RERANK_CANDIDATES: int = 30              # max fused candidates to feed the cross-encoder reranker
CE_RERANK_MIN_CANDIDATES: int = cross_encoder.MIN_USEFUL_CANDIDATES  # skip rerank when fused pool is too small

# When the LLM emits OOC but Tier-1 retrieval returned chunks, use extractive fallback
# if top-1 similarity (as %) is at least this. 70% was too strict (many false refusals).
EXTRACTIVE_FALLBACK_MIN_CONFIDENCE_PCT: int = 52


# ---------------- Embedding ----------------
# (stage, done, total) — stages: "training" while embedding batches, "saving" before the vector write.
EmbedProgressFn = Callable[[str, int, int], None]


def _report_embed_progress(on_progress: Optional[EmbedProgressFn], done: int, total: int) -> None:
    """Progress reporting must never fail an ingest."""
    if on_progress is None:
        return
    try:
        on_progress("training", done, total)
    except Exception as exc:
        logger.debug("Embed progress callback failed: %s", exc)


class EmbedData:
    """Lightweight wrapper around a llama-index embedding model.

    Constructed in one of two ways:
      - ``EmbedData(model_name=...)``: builds an OllamaEmbedding (legacy behavior).
      - ``EmbedData.from_embedder(embed_model)``: wraps any pre-built BaseEmbedding
        instance returned by the multi-provider factory.
    """

    def __init__(self, model_name: str = DEFAULT_EMBEDDING_MODEL, embed_model=None):
        if embed_model is not None:
            self.embed_model = embed_model
        else:
            from ..infra_env import ollama_base_url

            base_url = ollama_base_url()
            self.embed_model = OllamaEmbedding(
                model_name=model_name,
                base_url=base_url,
                embed_batch_size=EMBED_BATCH_SIZE,
                ollama_additional_kwargs={"keep_alive": "1h"},
            )

    @classmethod
    def from_embedder(cls, embed_model) -> "EmbedData":
        return cls(embed_model=embed_model)

    @staticmethod
    def _approx_token_count(text: str) -> int:
        """Rough token estimate (Llama-style ~4 chars/token); avoids extra deps."""
        return max(1, len(text) // 4)

    def _get_text_embedding_batch_with_retry(self, batch: List[str]) -> List[List[float]]:
        """Call provider embed API with provider-agnostic 429/503 retry."""
        from ..embed_rate_limit import (
            EmbeddingRateLimitError,
            embed_retry_delay_seconds,
            is_embed_non_retryable_error,
            is_embed_rate_limit_error,
        )
        from ..embed_throttle import hosted_embed_slot

        max_retries = max(1, int(settings.embed_rate_limit_max_retries or 6))
        base_delay = max(0.5, int(settings.embed_rate_limit_base_delay_ms or 2000) / 1000.0)
        cap_seconds = float(max(30, int(settings.embed_rate_limit_retry_cap_seconds or 300)))

        last_exc: Optional[Exception] = None
        for attempt in range(1, max_retries + 1):
            try:
                with hosted_embed_slot(self.embed_model):
                    return self.embed_model.get_text_embedding_batch(batch, show_progress=False)
            except Exception as exc:
                last_exc = exc
                if is_embed_non_retryable_error(exc):
                    raise
                if not is_embed_rate_limit_error(exc):
                    raise
                if attempt >= max_retries:
                    raise EmbeddingRateLimitError(str(exc)) from exc
                delay = embed_retry_delay_seconds(
                    exc,
                    attempt,
                    base_delay=base_delay,
                    cap_seconds=cap_seconds,
                )
                logger.warning(
                    "Embedding rate limited (attempt %s/%s), retrying in %.1fs",
                    attempt,
                    max_retries,
                    delay,
                )
                time.sleep(delay)

        if last_exc is not None:
            raise EmbeddingRateLimitError(str(last_exc)) from last_exc
        raise RuntimeError("Embedding batch failed without exception")

    def _embed_with_api_limits(
        self,
        contexts: List[str],
        *,
        max_input_chars: int,
        max_batch_tokens: int,
        max_batch_items: Optional[int] = None,
        on_progress: Optional[EmbedProgressFn] = None,
    ) -> List[List[float]]:
        """Split embedding calls so each request respects vendor token/item caps (reindex-safe)."""
        clamped = [t[:max_input_chars] if len(t) > max_input_chars else t for t in contexts]
        embeddings: List[List[float]] = []
        batch: List[str] = []
        batch_tokens = 0
        pause_sec = self._batch_pause_seconds()
        total = len(clamped)

        def flush() -> None:
            nonlocal batch, batch_tokens
            if not batch:
                return
            embeddings.extend(self._get_text_embedding_batch_with_retry(batch))
            batch = []
            batch_tokens = 0
            _report_embed_progress(on_progress, len(embeddings), total)
            if pause_sec > 0:
                time.sleep(pause_sec)

        for t in clamped:
            tok = self._approx_token_count(t)
            if max_batch_items is not None and len(batch) >= max_batch_items:
                flush()
            if batch and batch_tokens + tok > max_batch_tokens:
                flush()
            batch.append(t)
            batch_tokens += tok
        flush()
        return embeddings

    def _batch_pause_seconds(self) -> float:
        base = max(0, int(settings.ingest_batch_pause_ms or 0)) / 1000.0
        try:
            from llama_index.embeddings.mistralai import MistralAIEmbedding
        except ImportError:
            MistralAIEmbedding = None
        if MistralAIEmbedding is not None and isinstance(self.embed_model, MistralAIEmbedding):
            mistral_pause = max(0, int(settings.mistral_ingest_batch_pause_ms or 0)) / 1000.0
            return max(base, mistral_pause)
        return base

    def embed(
        self,
        contexts: List[str],
        on_progress: Optional[EmbedProgressFn] = None,
    ) -> List[List[float]]:
        if not contexts:
            return []

        try:
            from llama_index.embeddings.mistralai import MistralAIEmbedding
        except ImportError:
            MistralAIEmbedding = None
        try:
            from llama_index.embeddings.openai import OpenAIEmbedding
        except ImportError:
            OpenAIEmbedding = None
        try:
            from llama_index.embeddings.gemini import GeminiEmbedding
        except ImportError:
            GeminiEmbedding = None

        # Mistral free tier: small batches + modest token totals per HTTP request.
        if MistralAIEmbedding is not None and isinstance(self.embed_model, MistralAIEmbedding):
            return self._embed_with_api_limits(
                contexts,
                max_input_chars=30_000,
                max_batch_tokens=max(1000, int(settings.mistral_embed_max_batch_tokens or 8000)),
                max_batch_items=max(1, int(settings.mistral_embed_max_batch_items or 8)),
                on_progress=on_progress,
            )

        # OpenAI: 8192 tokens/input, 300k tokens/request, max 2048 inputs/request.
        if OpenAIEmbedding is not None and isinstance(self.embed_model, OpenAIEmbedding):
            return self._embed_with_api_limits(
                contexts,
                max_input_chars=32_000,
                max_batch_tokens=280_000,
                max_batch_items=2048,
                on_progress=on_progress,
            )

        # Gemini (llama-index): models in our registry use ~2048 tokens/input; keep batches modest.
        if GeminiEmbedding is not None and isinstance(self.embed_model, GeminiEmbedding):
            return self._embed_with_api_limits(
                contexts,
                max_input_chars=8_000,
                max_batch_tokens=200_000,
                max_batch_items=250,
                on_progress=on_progress,
            )

        # Ollama / local: count-based batching only (large context; no shared HTTP batch cap).
        embeddings: List[List[float]] = []
        for batch in batch_iterate(contexts, EMBED_BATCH_SIZE):
            embeddings.extend(
                self.embed_model.get_text_embedding_batch(batch, show_progress=False)
            )
            _report_embed_progress(on_progress, len(embeddings), len(contexts))
        return embeddings


# ---------------- Retriever ----------------
class Retriever:
    def __init__(self, vdb: VectorDB, embedder: EmbedData, default_top_k: int = DEFAULT_TOP_K):
        self.vdb = vdb
        self.embedder = embedder
        self.default_top_k = default_top_k

    # ------------------------------------------------------------------
    # Tiered retrieval helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _run_with_timeout(fn, timeout_seconds: float, *args, **kwargs):
        """Run fn(*args, **kwargs) with a wall-clock timeout. Raises TimeoutError if exceeded."""
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(fn, *args, **kwargs)
            try:
                return future.result(timeout=timeout_seconds)
            except concurrent.futures.TimeoutError:
                raise TimeoutError(
                    f"Operation '{getattr(fn, '__name__', str(fn))}' timed out after {timeout_seconds}s"
                )

    @staticmethod
    def _extract_keywords(query: str, lang: Optional[str] = None) -> List[str]:
        """High-value terms of ``query``: stop words of its language removed, codes kept whole.

        ``lang`` is only a fallback hint; the question's own language wins when detectable.
        """
        return query_keywords.extract_keywords(query, lang)

    @staticmethod
    def _score_chunk_keywords(chunk: str, keywords: List[str]) -> float:
        """Score a chunk 0–1 by unique keyword coverage. Longer keywords earn a small bonus."""
        if not chunk or not keywords:
            return 0.0
        chunk_lower = chunk.lower()
        matched = [k for k in keywords if k in chunk_lower]
        if not matched:
            return 0.0
        base = len(matched) / len(keywords)
        avg_len = sum(len(k) for k in matched) / len(matched)
        length_bonus = min(0.3, (avg_len - 3) * 0.03)
        return min(1.0, base + length_bonus)

    def _keyword_retrieve(
        self,
        query: str,
        top_k: int,
        user_id: Optional[int],
        project_id: Optional[str],
        keyword_score_floor: Optional[float] = None,
        fetch_limit: Optional[int] = None,
        collection_name: Optional[str] = None,
        query_lang: Optional[str] = None,
        source_ids: Optional[List[str]] = None,
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """
        Tier 2 keyword retrieval.
        Fetches project-scoped chunks from the vector store (max TIER2_MAX_FETCH_CHUNKS),
        scores them by keyword match, and returns the top_k qualifying results.
        ``source_ids`` (hard source scope) limits the fetch to those sources.
        Returns same 4-tuple shape as VectorDB.query().
        """
        kw_lang = query_keywords.keyword_language(query, query_lang)
        keywords = query_keywords.match_forms(self._extract_keywords(query, kw_lang), kw_lang)
        if not keywords:
            return [], [], [], []

        score_floor = keyword_score_floor if keyword_score_floor is not None else TIER2_KEYWORD_SCORE_FLOOR

        conditions: List[Dict[str, Any]] = []
        if user_id is not None:
            conditions.append({"user_id": user_id})
        if project_id is not None:
            conditions.append({"project_id": str(project_id)})
        if source_ids:
            conditions.append(source_routing.metadata_where(source_ids, project_id=project_id))

        fetch_kwargs: Dict[str, Any] = {
            "limit": min(fetch_limit or TIER2_MAX_FETCH_CHUNKS, TIER2_MAX_FETCH_CHUNKS),
            "include": ["documents", "metadatas"],
        }
        if len(conditions) == 1:
            fetch_kwargs["where"] = conditions[0]
        elif len(conditions) > 1:
            fetch_kwargs["where"] = {"$and": conditions}

        raw = self.vdb.get_collection(collection_name).get(**fetch_kwargs)
        all_docs: List[str] = raw.get("documents", []) or []
        all_metas: List[Any] = raw.get("metadatas", []) or []
        all_ids_raw: List[str] = raw.get("ids", []) or []

        if not all_docs:
            return [], [], [], []

        scored: List[Tuple[float, str, str, Any]] = []
        for doc, meta, _raw_id in zip(all_docs, all_metas, all_ids_raw):
            if not doc or not doc.strip():
                continue
            score = self._score_chunk_keywords(doc, keywords)
            if score >= score_floor:
                doc_id = (meta.get("document_id", "unknown") if meta else "unknown")
                scored.append((score, doc, doc_id, meta))

        if not scored:
            return [], [], [], []

        scored.sort(key=lambda x: x[0], reverse=True)
        top = scored[:top_k]

        out_docs = [x[1] for x in top]
        out_doc_ids = [x[2] for x in top]
        out_metas = [x[3] for x in top]
        # Use (1 - score) as pseudo-distance so callers that convert to similarity get score back
        out_dists = [max(0.0, 1.0 - x[0]) for x in top]
        return out_docs, out_doc_ids, out_metas, out_dists

    def _indexed_keyword_retrieve(
        self,
        query: str,
        top_k: int,
        user_id: Optional[int],
        project_id: Optional[str],
        keyword_score_floor: Optional[float] = None,
        collection_name: Optional[str] = None,
        embeddings_out: Optional[Dict[str, Any]] = None,
        query_lang: Optional[str] = None,
        source_ids: Optional[List[str]] = None,
        exact_keys_out: Optional[Set[str]] = None,
        rare_keys_out: Optional[Set[str]] = None,
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """Keyword retrieval over the Postgres full-text index (large collections).

        Hits are re-read from the vector store by id, so rows for deleted chunks drop out.
        Chunk embeddings are returned via ``embeddings_out`` (keyed like fusion) so
        keyword-only hits can be scored with real cosine similarity; fusion keys of
        exact identifier hits are added to ``exact_keys_out``, those of chunks holding a
        rare query word to ``rare_keys_out``.
        ``source_ids`` (hard source scope) limits hits to those sources.
        """
        kw_lang = query_keywords.keyword_language(query, query_lang)
        surface = self._extract_keywords(query, kw_lang)
        if not surface:
            return [], [], [], []
        candidates = keyword_candidates.gather(
            collection_name,
            project_id,
            surface,
            kw_lang,
            source_ids or None,
            limit=LEXICAL_CANDIDATES,
            code_limit=LEXICAL_CODE_CANDIDATES,
            identifiers=query_keywords.capitalized_codes(query),
            names=query_keywords.name_phrases(query, kw_lang),
        )
        if not candidates.ids:
            return [], [], [], []
        keywords = query_keywords.match_forms(candidates.terms or surface, kw_lang)

        ids = candidates.ids
        raw = self.vdb.get_collection(collection_name).get(
            ids=ids, include=["documents", "metadatas", "embeddings"]
        )
        raw_ids = list(raw.get("ids") or [])
        raw_docs = list(raw.get("documents") or [])
        raw_metas = list(raw.get("metadatas") or [])
        raw_embs = raw.get("embeddings")
        raw_embs = list(raw_embs) if raw_embs is not None else []
        by_id = {
            cid: (
                raw_docs[i] if i < len(raw_docs) else "",
                raw_metas[i] if i < len(raw_metas) else None,
                raw_embs[i] if i < len(raw_embs) else None,
            )
            for i, cid in enumerate(raw_ids)
        }

        score_floor = keyword_score_floor if keyword_score_floor is not None else TIER2_KEYWORD_SCORE_FLOOR
        scored: List[Tuple[float, int, str, Any, Any, bool]] = []
        for position, cid in enumerate(ids):
            if cid not in by_id:
                continue
            doc, meta, emb = by_id[cid]
            if not doc or not str(doc).strip():
                continue
            meta_d = meta if isinstance(meta, dict) else {}
            if user_id is not None and str(meta_d.get("user_id", user_id)) != str(user_id):
                continue
            if source_ids and not source_routing.chunk_belongs_to(meta_d, set(source_ids)):
                continue
            haystack = f"{meta_d.get('title') or ''} {meta_d.get('url') or ''} {doc}"
            score = self._score_chunk_keywords(haystack, keywords)
            tier = (
                0 if cid in candidates.priority else 1 if cid in candidates.scoped
                else 2 if cid in candidates.rare else 3
            )
            if score < score_floor and tier == 3:
                continue
            scored.append((score, position, doc, meta, emb, tier))

        # Exact identifier hits keep their gathered order, then question-ranked chunks of a
        # shared identifier by coverage, then chunks holding a rare query word, then the rest;
        # both identifier tiers count as exact.
        scored.sort(key=lambda x: (0, 0.0, x[1]) if x[5] == 0 else (x[5], -x[0], x[1]))
        seen_keys: Set[str] = set()
        top = []
        for row in scored:
            key = self._fusion_key(row[2], row[3])
            if key in seen_keys:
                continue
            seen_keys.add(key)
            top.append(row)
            if len(top) >= top_k:
                break
        for _score, _pos, doc, meta, emb, tier in top:
            if embeddings_out is not None and emb is not None:
                embeddings_out[self._fusion_key(doc, meta)] = emb
            if exact_keys_out is not None and tier < 2:
                exact_keys_out.add(self._fusion_key(doc, meta))
            if rare_keys_out is not None and tier == 2:
                rare_keys_out.add(self._fusion_key(doc, meta))
        return (
            [x[2] for x in top],
            [(x[3] or {}).get("document_id", "unknown") if isinstance(x[3], dict) else "unknown" for x in top],
            [x[3] for x in top],
            [max(0.0, 1.0 - x[0]) for x in top],
        )

    @staticmethod
    def _normalize_url_for_dedupe(url: Any) -> Optional[str]:
        if not url or not isinstance(url, str):
            return None
        cleaned = url.strip().lower().rstrip("/")
        return cleaned or None

    @staticmethod
    def _chunk_dedup_key(doc: str, meta: Any) -> str:
        """Stable identity for a chunk across the two retrieval lists.

        Prefer (document_id, chunk_index[, url]) when present in metadata; fall
        back to a hash of the leading characters so semantic and keyword hits on
        the same chunk collapse to a single fused row. The URL is part of the key
        because some crawls stamp one source-wide document_id on every page; without
        it, chunk N of unrelated pages would fuse and add up their scores.
        """
        if isinstance(meta, dict):
            doc_id = meta.get("document_id")
            chunk_idx = meta.get("chunk_index")
            if doc_id is not None and chunk_idx is not None:
                url = meta.get("url")
                return f"{doc_id}:{chunk_idx}:{url}" if url else f"{doc_id}:{chunk_idx}"
        body = (doc or "")[:200].strip().lower()
        return hashlib.sha1(body.encode("utf-8")).hexdigest()

    @staticmethod
    def _fusion_key(doc: str, meta: Any) -> str:
        """Rank-fusion identity that also merges identical copies of a page chunk.

        Re-ingested pages get a new document_id each time, so ``_chunk_dedup_key`` keeps
        every copy apart and the copies crowd the fusion window. Same URL, chunk index and
        text means the same chunk; other extractions of the page (other text) stay apart.
        """
        if isinstance(meta, dict):
            url_key = Retriever._normalize_url_for_dedupe(meta.get("url"))
            if url_key is not None:
                body = " ".join((doc or "").split()).lower()
                digest = hashlib.sha1(body.encode("utf-8")).hexdigest()
                return f"url:{url_key}:{meta.get('chunk_index')}:{digest}"
        return Retriever._chunk_dedup_key(doc, meta)

    @staticmethod
    def _query_result_dedup_key(doc: str, meta: Any) -> str:
        """Identity for post-retrieval collapse (duplicate crawl pages / re-ingests).

        Prefer (normalized_url, chunk_index) so the same page ingested multiple
        times collapses while distinct chunks of one page are kept. Fall back to
        (document_id, chunk_index), then a text-prefix hash.
        """
        if isinstance(meta, dict):
            url_key = Retriever._normalize_url_for_dedupe(meta.get("url"))
            chunk_idx = meta.get("chunk_index")
            if url_key is not None:
                idx = 0 if chunk_idx is None else chunk_idx
                return f"url:{url_key}:{idx}"
            doc_id = meta.get("document_id")
            if doc_id is not None and chunk_idx is not None:
                return f"doc:{doc_id}:{chunk_idx}"
        return f"text:{Retriever._chunk_dedup_key(doc, meta)}"

    @staticmethod
    def _dedupe_ranked_results(
        docs: List[str],
        doc_ids: List[str],
        metas: List[Any],
        dists: List[float],
        top_k: int,
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """Keep the best-scoring row per query-dedupe key, then truncate to top_k.

        Smaller distance is better. First occurrence in ranked order wins when
        distances tie, so existing fusion/rerank order is preserved.
        """
        if not docs:
            return [], [], [], []
        best: Dict[str, Tuple[float, int, str, str, Any]] = {}
        order: List[str] = []
        identity = hybrid_fusion.ChunkIdentity()
        near_dupes = hybrid_fusion.NearDuplicateBodies()
        ranked_rows = sorted(
            enumerate(zip(docs, doc_ids, metas, dists)),
            key=lambda row: (float(row[1][3]) if row[1][3] is not None else 1.0, row[0]),
        )
        for i, (doc, doc_id, meta, dist) in ranked_rows:
            if not doc or not str(doc).strip():
                continue
            key = identity.key(Retriever._query_result_dedup_key(doc, meta), doc)
            if key not in best and near_dupes.seen(doc):
                continue
            dist_f = float(dist) if dist is not None else 1.0
            prev = best.get(key)
            if prev is None:
                best[key] = (dist_f, i, doc, doc_id, meta)
                order.append(key)
            elif dist_f < prev[0]:
                best[key] = (dist_f, prev[1], doc, doc_id, meta)
        ranked_keys = sorted(order, key=lambda k: (best[k][0], best[k][1]))[: max(1, int(top_k))]
        return (
            [best[k][2] for k in ranked_keys],
            [best[k][3] for k in ranked_keys],
            [best[k][4] for k in ranked_keys],
            [best[k][0] for k in ranked_keys],
        )

    def _finalize_ranking(
        self,
        entries: List[Dict[str, Any]],
        *,
        preserve_order: bool,
        routed_set: Set[str],
        query_lang: Optional[str],
        k: int,
    ) -> Tuple[Tuple[List[str], List[str], List[Any], List[float]], bool]:
        """Dedupe to top-k, then move query-language chunks ahead of nearby same-site twins.

        Site header/footer chunks beyond the first only fill slots no page chunk takes.
        The language step only reorders the final top-k, so retrieval recall is unchanged.
        """
        if preserve_order:
            ranked = hybrid_fusion.dedupe_preserving_order(
                hybrid_fusion.defer_site_blocks(entries), self._query_result_dedup_key, k
            )
        else:
            deduped = self._dedupe_ranked_results(
                [e["doc"] for e in entries],
                [e["id"] for e in entries],
                [e["meta"] for e in entries],
                [e["dist"] for e in entries],
                top_k=len(entries),
            )
            kept = hybrid_fusion.defer_site_blocks(hybrid_fusion.entries_from_lists(*deduped))[: max(1, int(k))]
            ranked = (
                [e["doc"] for e in kept],
                [e["id"] for e in kept],
                [e["meta"] for e in kept],
                [e["dist"] for e in kept],
            )
        top_entries, lang_reordered = language_preference.prefer_language(
            hybrid_fusion.entries_from_lists(*ranked), query_lang, partition_ids=routed_set or None
        )
        if lang_reordered:
            ranked = (
                [e["doc"] for e in top_entries],
                [e["id"] for e in top_entries],
                [e["meta"] for e in top_entries],
                [e["dist"] for e in top_entries],
            )
        return ranked, lang_reordered

    @staticmethod
    def _rrf_fuse(
        semantic: Tuple[List[str], List[str], List[Any], List[float]],
        keyword: Tuple[List[str], List[str], List[Any], List[float]],
        top_k: int,
        k: int = RRF_K,
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """Reciprocal Rank Fusion of two ranked retrieval lists.

        Each list contributes 1/(k + rank) per chunk; identical chunks collapse
        and their scores sum. Returns top_k by fused score, preserving the
        smallest seen distance from the semantic side (or pseudo-distance from
        keyword side if the chunk only came from keyword).
        """
        sem_docs, sem_ids, sem_metas, sem_dists = semantic
        kw_docs, kw_ids, kw_metas, kw_dists = keyword

        fused: Dict[str, Dict[str, Any]] = {}

        for rank, (doc, doc_id, meta, dist) in enumerate(
            zip(sem_docs, sem_ids, sem_metas, sem_dists)
        ):
            if not doc or not doc.strip():
                continue
            key = Retriever._chunk_dedup_key(doc, meta)
            score = 1.0 / (k + rank + 1)
            entry = fused.setdefault(
                key,
                {"doc": doc, "id": doc_id, "meta": meta, "dist": dist, "score": 0.0, "from_semantic": False},
            )
            entry["score"] += score
            entry["from_semantic"] = True
            entry["dist"] = min(entry["dist"], dist) if entry.get("from_semantic") else dist

        for rank, (doc, doc_id, meta, dist) in enumerate(
            zip(kw_docs, kw_ids, kw_metas, kw_dists)
        ):
            if not doc or not doc.strip():
                continue
            key = Retriever._chunk_dedup_key(doc, meta)
            score = 1.0 / (k + rank + 1)
            if key in fused:
                fused[key]["score"] += score
            else:
                fused[key] = {
                    "doc": doc,
                    "id": doc_id,
                    "meta": meta,
                    "dist": dist,
                    "score": score,
                    "from_semantic": False,
                }

        if not fused:
            return [], [], [], []

        ranked = sorted(fused.values(), key=lambda x: x["score"], reverse=True)[:top_k]
        return (
            [x["doc"] for x in ranked],
            [x["id"] for x in ranked],
            [x["meta"] for x in ranked],
            [x["dist"] for x in ranked],
        )

    @staticmethod
    def _hybrid_fuse(
        semantic: Tuple[List[str], List[str], List[Any], List[float]],
        keyword: Tuple[List[str], List[str], List[Any], List[float]],
        top_k: int,
        semantic_weight: float = 0.65,
        keyword_weight: float = 0.35,
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """
        Weighted score fusion: combines normalized cosine similarity with keyword coverage.

        final_hybrid_score = semantic_weight × (1 - cosine_dist) + keyword_weight × kw_score

        Both signals are already in [0, 1]:
          - semantic: 1 - cosine_distance (cosine distance; lower dist = more similar)
          - keyword:  1 - pseudo_distance (set by _keyword_retrieve: pseudo_dist = 1 - kw_coverage)

        A chunk that appears in BOTH lists benefits from additive evidence.  A chunk that only
        appears in one list still gets a non-zero combined score from that signal alone, which is
        better than pure RRF where rank information is discarded when a list is short.

        Output distance = 1 - hybrid_score so downstream code (which expects smaller = better)
        works unchanged.
        """
        sem_docs, sem_ids, sem_metas, sem_dists = semantic
        kw_docs, kw_ids, kw_metas, kw_dists = keyword

        fused: Dict[str, Dict[str, Any]] = {}

        for doc, doc_id, meta, dist in zip(sem_docs, sem_ids, sem_metas, sem_dists):
            if not doc or not doc.strip():
                continue
            key = Retriever._chunk_dedup_key(doc, meta)
            sem_score = max(0.0, 1.0 - float(dist))
            entry = fused.setdefault(key, {
                "doc": doc, "id": doc_id, "meta": meta,
                "sem_score": 0.0, "kw_score": 0.0,
            })
            entry["sem_score"] = max(entry["sem_score"], sem_score)

        for doc, doc_id, meta, dist in zip(kw_docs, kw_ids, kw_metas, kw_dists):
            if not doc or not doc.strip():
                continue
            key = Retriever._chunk_dedup_key(doc, meta)
            kw_score = max(0.0, 1.0 - float(dist))  # pseudo_dist = 1 - kw_coverage
            if key in fused:
                fused[key]["kw_score"] = max(fused[key]["kw_score"], kw_score)
            else:
                fused[key] = {
                    "doc": doc, "id": doc_id, "meta": meta,
                    "sem_score": 0.0, "kw_score": kw_score,
                }

        if not fused:
            return [], [], [], []

        ranked = sorted(
            fused.values(),
            key=lambda x: semantic_weight * x["sem_score"] + keyword_weight * x["kw_score"],
            reverse=True,
        )[:top_k]

        out_dists = [
            max(0.0, 1.0 - (semantic_weight * x["sem_score"] + keyword_weight * x["kw_score"]))
            for x in ranked
        ]
        return (
            [x["doc"] for x in ranked],
            [x["id"] for x in ranked],
            [x["meta"] for x in ranked],
            out_dists,
        )

    @staticmethod
    def _cross_encoder_rerank(
        query: str,
        docs: List[str],
        doc_ids: List[str],
        metas: List[Any],
        distances: List[float],
        top_k: int,
        provider_scores: Optional[List[float]] = None,
    ) -> Tuple[List[str], List[str], List[Any], List[float], bool]:
        """Optional cross-encoder rerank pass over fused candidates.

        Returns the same 4-tuple plus a `reranked` bool. If the cross-encoder is
        unavailable (model load failed) or the input is empty, the inputs are
        returned untouched with `reranked=False` so callers can degrade safely.
        Cross-encoder scores are turned into pseudo-distances via 1 - sigmoid(s)
        so the rest of the pipeline (which expects "smaller is better") works.
        """
        if not docs:
            return docs, doc_ids, metas, distances, False

        from .singleton import get_cross_encoder

        scores: Optional[List[float]] = provider_scores if provider_scores and len(provider_scores) == len(docs) else None
        if scores is None:
            ce = get_cross_encoder()
            if ce is None:
                return docs, doc_ids, metas, distances, False
            try:
                pairs = [
                    (query, chunk_context.embedding_text(d or "", metas[i] if i < len(metas) else None))
                    for i, d in enumerate(docs)
                ]
                t_predict = time.perf_counter()
                raw_scores = ce.predict(pairs, show_progress_bar=False, convert_to_numpy=True)
                cross_encoder.record_latency(len(pairs), (time.perf_counter() - t_predict) * 1000)
                scores = [float(s) for s in raw_scores]
            except Exception as exc:
                logger.warning(f"Hybrid: cross-encoder predict failed ({exc}); skipping rerank")
                return docs, doc_ids, metas, distances, False

        order = sorted(range(len(docs)), key=lambda i: scores[i], reverse=True)[:top_k]

        def _sigmoid(x: float) -> float:
            if x >= 0:
                z = pow(2.718281828, -x)
                return 1.0 / (1.0 + z)
            z = pow(2.718281828, x)
            return z / (1.0 + z)

        out_docs = [docs[i] for i in order]
        out_ids = [doc_ids[i] for i in order]
        out_metas = [metas[i] for i in order]
        out_dists = [max(0.0, 1.0 - _sigmoid(scores[i])) for i in order]
        return out_docs, out_ids, out_metas, out_dists, True

    def compute_semantic_confidence(
        self,
        documents: List[str],
        distances: List[float],
        query: str,
        top1_floor: float = TIER1_TOP1_SIM_FLOOR,
        top3_floor: float = TIER1_TOP3_MEAN_FLOOR,
        lexical_floor: float = TIER1_LEXICAL_OVERLAP_FLOOR,
        dup_max: float = TIER1_DUPLICATE_RATIO_MAX,
    ) -> Dict[str, Any]:
        """
        Compute confidence signals for Tier 1 results.
        Returns dict with individual signals and an overall `passes` bool.
        """
        if not documents or not distances:
            return {"passes": False, "reason": "empty_results"}

        sims = [max(0.0, 1.0 - d) for d in distances]
        top1 = sims[0]
        top3_mean = sum(sims[:3]) / min(3, len(sims))

        keywords = self._extract_keywords(query)
        if keywords:
            top3_combined = " ".join(d.lower() for d in documents[:3] if d)
            matched_kw = sum(1 for k in keywords if k in top3_combined)
            lexical_overlap = matched_kw / len(keywords)
        else:
            lexical_overlap = 1.0  # no keywords → don't penalise

        if len(documents) > 1:
            first_prefix = documents[0][:200].strip().lower() if documents[0] else ""
            dups = sum(
                1 for d in documents[1:]
                if d and d[:200].strip().lower() == first_prefix
            )
            dup_ratio = dups / (len(documents) - 1)
        else:
            dup_ratio = 0.0

        passes = (
            top1 >= top1_floor
            and top3_mean >= top3_floor
            and lexical_overlap >= lexical_floor
            and dup_ratio <= dup_max
        )

        reason = "ok"
        if not passes:
            if top1 < top1_floor or top3_mean < top3_floor:
                reason = "semantic_low_confidence"
            elif lexical_overlap < lexical_floor:
                reason = "low_lexical_overlap"
            elif dup_ratio > dup_max:
                reason = "high_duplicate_ratio"

        return {
            "passes": passes,
            "reason": reason,
            "top1_sim": top1,
            "top3_mean_sim": top3_mean,
            "lexical_overlap": lexical_overlap,
            "dup_ratio": dup_ratio,
        }

    def should_fallback_to_tier2(
        self,
        documents: List[str],
        distances: List[float],
        query: str,
        semantic_confidence_floor: Optional[float] = None,
    ) -> Tuple[bool, str]:
        """Return (True, reason_code) if Tier 1 results do not meet confidence criteria."""
        top1_floor = semantic_confidence_floor if semantic_confidence_floor is not None else TIER1_TOP1_SIM_FLOOR
        conf = self.compute_semantic_confidence(
            documents, distances, query, top1_floor=top1_floor
        )
        if conf["passes"]:
            return False, "ok"
        return True, conf["reason"]

    # ------------------------------------------------------------------
    # Main retrieval entry point
    # ------------------------------------------------------------------

    def retrieve(
        self,
        query: str,
        top_k: Optional[int] = None,
        source_file: Optional[str] = None,
        document_id: Optional[str] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        enable_keyword_fallback: bool = True,
        semantic_confidence_floor: Optional[float] = None,
        keyword_score_floor: Optional[float] = None,
        use_reranker: Optional[bool] = None,
        embedder: Optional["EmbedData"] = None,
        collection_name: Optional[str] = None,
        preferred_language: Optional[str] = None,
        processed_query: Optional["ProcessedQuery"] = None,
        routing_query: Optional[str] = None,
        record_documents: Optional[Sequence[Tuple[str, Sequence[str]]]] = None,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
    ):
        """``preferred_language``: None → detect from ``query``; ``""`` → no language preference.

        ``processed_query`` feeds the rerank policy and constraint boost; ``routing_query``
        (default ``query``) is the text matched against source names. ``record_documents``
        (``(document_id, hints)`` of catalog records matched for the question) are pinned
        first, one evidence chunk per page.
        """
        retrieve_start = time.perf_counter()
        k = top_k or self.default_top_k
        # Project knowledge is shared across members. Ingest still records who
        # uploaded; query by project_id only so orgadmin and members hit the same index.
        if project_id is not None:
            user_id = None
        from .retrieve_knobs import clamp_keyword_blend, fusion_weights as _fusion_weights
        from .retrieve_knobs import pool_size as _retrieve_pool_size
        pool_k = _retrieve_pool_size(k, rerank_candidates)
        keyword_blend = clamp_keyword_blend(keyword_blend)
        active_embedder = embedder or self.embedder
        query_lang = (
            language_preference.preferred_language(query)
            if preferred_language is None
            else normalize_lang_code(preferred_language)
        )

        # Query *shape* (filename / doc name / question) is judged on the user's own
        # wording, so a filler-stripped retrieval rewrite never becomes a "document name".
        shape_query = routing_query or query
        file_extensions = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md']
        looks_like_filename = any(shape_query.lower().endswith(ext) for ext in file_extensions) or \
                             any(ext in shape_query.lower() for ext in file_extensions)

        common_stop_words = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'could', 'may', 'might', 'must', 'can', 'if', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'i', 'you', 'he', 'she', 'it',
            'we', 'they', 'what', 'when', 'where', 'why', 'how', 'who', 'which'
        }

        query_words = shape_query.strip().split()
        meaningful_words = [word.lower() for word in query_words if word.lower() not in common_stop_words]
        q_lower = shape_query.strip().lower()

        # Natural-language questions (with or without "?") are not "open document X".
        _question_prefixes = (
            "what is ", "what are ", "what was ", "who is ", "who are ",
            "how is ", "how are ", "how do ", "how does ", "how can ",
            "why is ", "why are ", "where is ", "where are ", "when is ",
            "when did ", "which is ", "can you ", "tell me ", "explain ",
        )
        looks_like_question = (
            "?" in shape_query
            or any(q_lower.startswith(p) for p in _question_prefixes)
        )

        # Single-token queries (e.g. brand names "nitsan", "t3planet") are entity search,
        # not "open the document called X". Treating them as filenames mis-frames the LLM prompt.
        single_token_entity = len(query_words) == 1 and len(meaningful_words) == 1
        looks_like_doc_name = (
            len(query_words) <= 3 and
            len(meaningful_words) >= 1 and
            len(shape_query) <= 50 and
            not looks_like_filename and
            not looks_like_question and
            not any(char in shape_query for char in [':', ';', '!'])
            and not single_token_entity
        )

        enhanced_query = query
        if (looks_like_filename or looks_like_doc_name) and not source_file:
            enhanced_query = f"document named {query} or file called {query} or document about {query}"
            logger.info(f"Query looks like filename/document name, using enhanced query: {enhanced_query}")

        # === Run semantic and keyword retrieval in parallel ===
        # Keep semantic as primary path while allowing keyword evidence to contribute
        # when it returns within a tighter latency budget.
        sem_failed = False
        sem_reason = "ok"
        sem_docs: List[str] = []
        sem_ids: List[str] = []
        sem_metas: List[Any] = []
        sem_dists: List[float] = []
        kw_docs: List[str] = []
        kw_ids: List[str] = []
        kw_metas: List[Any] = []
        kw_dists: List[float] = []

        # Keyword mode: small collections are fully scanned (complete and exact);
        # larger ones use the full-text index. A first-N storage-order sample only
        # ever sees the earliest-ingested source, so it is never used.
        keyword_fetch_limit = min(max(k * 30, 250), TIER2_MAX_FETCH_CHUNKS)
        keyword_mode = "scan"
        try:
            _now = time.monotonic()
            with _collection_size_cache_lock:
                _cached = _collection_size_cache.get(collection_name or "")
            if _cached and (_now - _cached[1]) < _COLLECTION_SIZE_CACHE_TTL:
                collection_size = _cached[0]
            else:
                collection_size = int(self.vdb.get_collection(collection_name).count())
                with _collection_size_cache_lock:
                    _collection_size_cache[collection_name or ""] = (collection_size, _now)
            if collection_size <= TIER2_MAX_FETCH_CHUNKS:
                keyword_fetch_limit = TIER2_MAX_FETCH_CHUNKS
            else:
                keyword_mode = "index" if lexical_index.has_rows(collection_name) else "off"
                logger.info(
                    "VectorService: collection has %s vectors — keyword mode=%s",
                    collection_size,
                    keyword_mode,
                )
        except Exception as exc:
            logger.debug("VectorService: collection size check skipped: %s", exc)

        semantic_k = (
            min(max(k * 4, 20), max(k, SEMANTIC_POOL_MAX)) if keyword_mode == "index" else k
        )
        if rerank_candidates is not None:
            semantic_k = max(semantic_k, min(pool_k, 256))
        disabled = source_availability.disabled(project_id)
        disabled_sources = disabled.ids
        excluded_files: Optional[List[str]] = None
        excluded_docs: Optional[List[str]] = None
        if disabled_sources:
            if source_availability.prefilter_enabled():
                excluded_files = source_availability.excluded_source_files(disabled.crawl_sources) or None
                excluded_docs = sorted(disabled.documents) or None
            else:
                semantic_k *= 2
        route_text = routing_query or query
        routed_ids: List[str] = source_availability.prune_ids(
            source_routing.match_source_ids(project_id, route_text)
            if project_id and not source_file and not document_id
            else [],
            disabled_sources,
        )
        routed_set: Set[str] = set(routed_ids)
        hard_ids: List[str] = source_availability.prune_ids(
            hard_scope.hard_scope_ids(project_id, route_text, routed_ids), disabled_sources
        )
        hard_set: Set[str] = set(hard_ids)
        site_info = bool(
            project_id
            and not hard_ids
            and not source_file
            and not document_id
            and query_signals.wants_site_info(
                route_text, processed_query.intent if processed_query is not None else None
            )
        )
        if routed_ids:
            logger.info(
                "VectorService: query names %d trained source(s); scoped retrieval on (hard=%s)",
                len(routed_ids),
                bool(hard_ids),
            )
        query_state: Dict[str, Any] = {}
        kw_embeddings: Dict[str, Any] = {}
        kw_exact_keys: Set[str] = set()
        kw_rare_keys: Set[str] = set()

        def _run_hard_scoped(query_vector):
            try:
                return scoped_query.query_routed_sources(
                    self.vdb,
                    query_vector,
                    hard_ids,
                    top_k=max(semantic_k, k * 2, 10),
                    user_id=user_id,
                    project_id=project_id,
                    collection_name=collection_name,
                )
            except Exception as exc:
                logger.info("VectorService: hard-scoped query failed (%s); filtering unscoped results", exc)
            unscoped = self.vdb.query(
                query_vector,
                top_k=max(semantic_k * 3, 30),
                user_id=user_id,
                project_id=project_id,
                collection_name=collection_name,
                exclude_source_files=excluded_files,
                exclude_document_ids=excluded_docs,
            )
            return hard_scope.filter_ranked(unscoped, hard_set)

        def _run_semantic():
            embed_t0 = time.perf_counter()
            embed_model = active_embedder.embed_model
            query_vector = query_embedding_cache.embed_query(
                embed_model, enhanced_query, embed_model.get_text_embedding
            )
            query_state["embed_ms"] = int((time.perf_counter() - embed_t0) * 1000)
            query_state["vector"] = query_vector
            if hard_ids:
                return _run_hard_scoped(query_vector)
            scoped_pool = scoped_future = info_future = None
            if routed_ids or site_info:
                scoped_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)
            if site_info:
                info_future = scoped_pool.submit(
                    info_pages.nearest_info_chunks,
                    self.vdb,
                    query_vector,
                    project_id,
                    collection_name=collection_name,
                )
            if routed_ids:
                scoped_future = scoped_pool.submit(
                    scoped_query.query_routed_sources,
                    self.vdb,
                    query_vector,
                    routed_ids,
                    top_k=max(k * 2, 10),
                    user_id=user_id,
                    project_id=project_id,
                    collection_name=collection_name,
                )
            try:
                result = self.vdb.query(
                    query_vector,
                    top_k=semantic_k,
                    source_file=source_file,
                    document_id=document_id,
                    user_id=user_id,
                    project_id=project_id,
                    collection_name=collection_name,
                    exclude_source_files=excluded_files,
                    exclude_document_ids=excluded_docs,
                )
                if scoped_future is not None:
                    try:
                        query_state["scoped"] = scoped_future.result(timeout=SCOPED_QUERY_TIMEOUT_S)
                    except Exception as exc:
                        logger.info("VectorService: scoped source query skipped: %s", exc)
                if info_future is not None:
                    try:
                        query_state["info"] = info_future.result(timeout=SCOPED_QUERY_TIMEOUT_S)
                    except Exception as exc:
                        logger.info("VectorService: site-info page query skipped: %s", exc)
                return result
            finally:
                if scoped_pool is not None:
                    scoped_pool.shutdown(wait=False)

        def _run_keyword():
            if not enable_keyword_fallback or keyword_mode == "off":
                return [], [], [], []
            if keyword_mode == "index":
                return self._indexed_keyword_retrieve(
                    query,
                    semantic_k,
                    user_id,
                    project_id,
                    keyword_score_floor,
                    collection_name=collection_name,
                    embeddings_out=kw_embeddings,
                    query_lang=query_lang,
                    source_ids=hard_ids or None,
                    exact_keys_out=kw_exact_keys,
                    rare_keys_out=kw_rare_keys,
                )
            return self._keyword_retrieve(
                query,
                k,
                user_id,
                project_id,
                keyword_score_floor,
                fetch_limit=keyword_fetch_limit,
                collection_name=collection_name,
                query_lang=query_lang,
                source_ids=hard_ids or None,
            )

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=3 if record_documents else 2)
        record_entries: List[Dict[str, Any]] = []
        try:
            branches_t0 = time.perf_counter()

            def _timed_keyword():
                try:
                    return _run_keyword()
                finally:
                    query_state["keyword_ms"] = int((time.perf_counter() - branches_t0) * 1000)

            sem_future = executor.submit(_run_semantic)
            kw_future = executor.submit(_timed_keyword)
            record_future = (
                executor.submit(
                    record_evidence.fetch_entries,
                    self.vdb,
                    list(record_documents),
                    collection_name=collection_name,
                    project_id=project_id,
                    user_id=user_id,
                )
                if record_documents
                else None
            )

            try:
                sem_result = sem_future.result(timeout=RETRIEVAL_TIMEOUT_SECONDS)
                sem_docs, sem_ids, sem_metas, sem_dists = sem_result
                logger.info(
                    f"VectorService: Semantic returned {len(sem_docs)} candidates",
                    extra={"tier": 1},
                )
            except concurrent.futures.TimeoutError:
                sem_failed = True
                sem_reason = "vector_timeout"
                sem_future.cancel()
                embed_ms = query_state.get("embed_ms")
                logger.warning(
                    "VectorService: Semantic side timeout (%s)",
                    "query embedding still running"
                    if embed_ms is None
                    else f"embedding took {embed_ms} ms; vector search still running",
                    extra={"tier": 1, "reason": sem_reason},
                )
            except Exception as exc:
                sem_failed = True
                sem_reason = "embed_error"
                logger.warning(
                    f"VectorService: Semantic side error ({exc})",
                    extra={"tier": 1, "reason": sem_reason},
                )

            query_state["semantic_ms"] = int((time.perf_counter() - branches_t0) * 1000)
            # Both branches share one clock: the keyword budget counts from the start,
            # not from when the semantic wait ended.
            kw_wait = max(0.0, KEYWORD_RETRIEVAL_TIMEOUT_SECONDS - (time.perf_counter() - branches_t0))
            try:
                kw_result = kw_future.result(timeout=kw_wait)
                kw_docs, kw_ids, kw_metas, kw_dists = kw_result
                if kw_docs:
                    logger.info(
                        f"VectorService: Keyword returned {len(kw_docs)} candidates",
                        extra={"tier": 2},
                    )
            except concurrent.futures.TimeoutError:
                kw_future.cancel()
                logger.info(
                    "VectorService: Keyword side timed out, continuing with semantic results",
                    extra={"tier": 2, "reason": "keyword_timeout"},
                )
            except Exception as ke:
                logger.warning(
                    f"VectorService: Keyword side error ({ke})",
                    extra={"tier": 2, "reason": "keyword_error"},
                )
            if record_future is not None:
                record_wait = max(0.5, KEYWORD_RETRIEVAL_TIMEOUT_SECONDS - (time.perf_counter() - branches_t0))
                try:
                    record_entries = record_evidence.apply_query_vector(
                        record_future.result(timeout=record_wait), query_state.get("vector")
                    )
                    if hard_set:
                        record_entries = [
                            e for e in record_entries
                            if source_routing.chunk_belongs_to(e.get("meta"), hard_set)
                        ]
                except Exception as exc:
                    logger.info("VectorService: record evidence skipped (%s)", exc)
                query_state["record_ms"] = int((time.perf_counter() - branches_t0) * 1000)
        finally:
            executor.shutdown(wait=False, cancel_futures=True)
        branch_timings = {
            name: query_state.get(name) for name in ("embed_ms", "semantic_ms", "keyword_ms", "record_ms")
            if name != "record_ms" or record_documents
        }

        if disabled_sources:
            # Final guarantee for every branch (legacy keyword path, pre-filter switched off).
            sem_docs, sem_ids, sem_metas, sem_dists = source_availability.drop_ranked(
                (sem_docs, sem_ids, sem_metas, sem_dists), disabled_sources
            )
            kw_docs, kw_ids, kw_metas, kw_dists = source_availability.drop_ranked(
                (kw_docs, kw_ids, kw_metas, kw_dists), disabled_sources
            )
            record_entries = source_availability.drop_entries(record_entries, disabled_sources)
            if query_state.get("scoped"):
                query_state["scoped"] = source_availability.drop_ranked(
                    tuple(list(part) for part in query_state["scoped"]), disabled_sources
                )

        denylists = denylist_filter.for_project(project_id)
        if denylists:
            sem_docs, sem_ids, sem_metas, sem_dists = denylist_filter.drop_ranked(
                (sem_docs, sem_ids, sem_metas, sem_dists), denylists
            )
            kw_docs, kw_ids, kw_metas, kw_dists = denylist_filter.drop_ranked(
                (kw_docs, kw_ids, kw_metas, kw_dists), denylists
            )
            record_entries = denylist_filter.drop_entries(record_entries, denylists)
            if query_state.get("scoped"):
                query_state["scoped"] = denylist_filter.drop_ranked(
                    tuple(list(part) for part in query_state["scoped"]), denylists
                )

        if hard_set:
            # Cross-source rows never survive a hard scope (defensive: lists are already scoped).
            sem_docs, sem_ids, sem_metas, sem_dists = hard_scope.filter_ranked(
                (sem_docs, sem_ids, sem_metas, sem_dists), hard_set
            )
            kw_docs, kw_ids, kw_metas, kw_dists = hard_scope.filter_ranked(
                (kw_docs, kw_ids, kw_metas, kw_dists), hard_set
            )

        # === Apply filename/doc-name prioritisation to semantic side BEFORE fusion ===
        # Boosting matched chunks to the front of the semantic list gives them higher
        # RRF score post-fusion, preserving the existing "filename match wins" contract.
        if (looks_like_filename or looks_like_doc_name) and sem_docs and sem_metas:
            filename_lower = query.lower().strip()
            base_filename = os.path.splitext(filename_lower)[0].strip()
            prioritized_docs: List[str] = []
            prioritized_ids: List[str] = []
            prioritized_metas: List[Any] = []
            prioritized_dists: List[float] = []
            other_docs: List[str] = []
            other_ids: List[str] = []
            other_metas: List[Any] = []
            other_dists: List[float] = []

            for i, meta in enumerate(sem_metas):
                if meta and "source_file" in meta:
                    source_file_val = str(meta.get("source_file", "")).lower()
                    source_base = source_file_val
                    if "_" in source_file_val:
                        parts = source_file_val.split("_", 1)
                        if len(parts) > 1 and len(parts[0]) > 20 and parts[0].replace("-", "").isalnum():
                            source_base = parts[1]
                    source_base_no_ext = os.path.splitext(source_base)[0].strip()
                    matches = (
                        filename_lower in source_file_val or
                        source_file_val in filename_lower or
                        base_filename in source_base_no_ext or
                        source_base_no_ext in base_filename
                    )
                    if matches:
                        prioritized_docs.append(sem_docs[i] if i < len(sem_docs) else "")
                        prioritized_ids.append(sem_ids[i] if i < len(sem_ids) else "unknown")
                        prioritized_metas.append(meta)
                        prioritized_dists.append(sem_dists[i] if i < len(sem_dists) else 1.0)
                    else:
                        other_docs.append(sem_docs[i] if i < len(sem_docs) else "")
                        other_ids.append(sem_ids[i] if i < len(sem_ids) else "unknown")
                        other_metas.append(meta)
                        other_dists.append(sem_dists[i] if i < len(sem_dists) else 1.0)
                else:
                    other_docs.append(sem_docs[i] if i < len(sem_docs) else "")
                    other_ids.append(sem_ids[i] if i < len(sem_ids) else "unknown")
                    other_metas.append(meta)
                    other_dists.append(sem_dists[i] if i < len(sem_dists) else 1.0)

            if prioritized_docs:
                sem_docs = prioritized_docs + other_docs
                sem_ids = prioritized_ids + other_ids
                sem_metas = prioritized_metas + other_metas
                sem_dists = prioritized_dists + other_dists
                logger.info(f"Prioritized {len(prioritized_docs)} documents matching filename '{query}'")

        # === Apply similarity_threshold filter to semantic side BEFORE fusion ===
        # Threshold semantics only make sense for vector distances; keyword pseudo-distances
        # are scored on a different scale and should not be filtered here.
        if similarity_threshold is not None and sem_dists:
            filtered_docs: List[str] = []
            filtered_ids: List[str] = []
            filtered_metas: List[Any] = []
            filtered_dists: List[float] = []
            for i, dist in enumerate(sem_dists):
                similarity = 1.0 - dist
                if similarity >= similarity_threshold:
                    filtered_docs.append(sem_docs[i] if i < len(sem_docs) else "")
                    filtered_ids.append(sem_ids[i] if i < len(sem_ids) else "unknown")
                    filtered_metas.append(sem_metas[i] if i < len(sem_metas) else None)
                    filtered_dists.append(dist)

            if not filtered_docs and sem_docs:
                top1_sim = 1.0 - sem_dists[0]
                lenient_threshold = similarity_threshold * 0.5
                logger.warning(
                    f"Similarity threshold {similarity_threshold} filtered out all semantic results. "
                    f"Using lenient fallback (threshold: {lenient_threshold:.3f}). "
                    f"Top semantic similarity: {top1_sim:.3f}"
                )
                for i, dist in enumerate(sem_dists):
                    similarity = 1.0 - dist
                    if similarity >= lenient_threshold:
                        filtered_docs.append(sem_docs[i] if i < len(sem_docs) else "")
                        filtered_ids.append(sem_ids[i] if i < len(sem_ids) else "unknown")
                        filtered_metas.append(sem_metas[i] if i < len(sem_metas) else None)
                        filtered_dists.append(dist)

                # Honest "no relevant context" instead of grabbing the
                # least-bad chunks when even the lenient threshold is empty.
                # When top-1 similarity is below the Tier-1 floor we have no
                # business answering from these results — the LLM will
                # hallucinate. Leave the pool empty so the Tier-3 path takes
                # over and returns a proper out-of-context response.
                if not filtered_docs:
                    floor = (
                        semantic_confidence_floor
                        if semantic_confidence_floor is not None
                        else TIER1_TOP1_SIM_FLOOR
                    )
                    if top1_sim < floor:
                        logger.info(
                            f"Semantic top-1 similarity {top1_sim:.3f} below floor "
                            f"{floor:.3f}; returning empty pool so Tier-3 handles it."
                        )
                    else:
                        # Top-1 is reasonable, just no chunks cleared the
                        # configured threshold — keep up to 3 highest-sim
                        # chunks so retrieval still has something to fuse.
                        top_n = min(3, len(sem_docs))
                        filtered_docs = sem_docs[:top_n]
                        filtered_ids = sem_ids[:top_n] if len(sem_ids) >= top_n else sem_ids
                        filtered_metas = sem_metas[:top_n] if len(sem_metas) >= top_n else sem_metas
                        filtered_dists = sem_dists[:top_n] if len(sem_dists) >= top_n else sem_dists
                        logger.info(
                            f"Returning top {top_n} semantic results as final fallback "
                            f"(similarities: {[f'{1.0-d:.3f}' for d in filtered_dists]})"
                        )

            sem_docs, sem_ids, sem_metas, sem_dists = (
                filtered_docs, filtered_ids, filtered_metas, filtered_dists
            )

        # === Scoped results for sources named in the query (lenient threshold) ===
        scoped_lists: Optional[Tuple[List[str], List[str], List[Any], List[float]]] = None
        scoped_raw = query_state.get("scoped")
        if scoped_raw and scoped_raw[0]:
            lenient = similarity_threshold * 0.5 if similarity_threshold is not None else None
            filtered_scoped = hybrid_fusion.filter_by_similarity(
                tuple(list(part) for part in scoped_raw), lenient
            )
            if filtered_scoped[0]:
                scoped_lists = filtered_scoped

        # === Confidence signals ===
        top1_floor = semantic_confidence_floor if semantic_confidence_floor is not None else TIER1_TOP1_SIM_FLOOR
        if sem_docs:
            tier1_conf = self.compute_semantic_confidence(
                sem_docs, sem_dists, query, top1_floor=top1_floor
            )
        else:
            tier1_conf = {
                "passes": False,
                "reason": sem_reason,
                "top1_sim": 0.0,
                "top3_mean_sim": 0.0,
                "lexical_overlap": 0.0,
                "dup_ratio": 0.0,
            }

        if kw_docs and sem_docs and tier1_conf.get("passes", False):
            logger.info(
                "VectorService: Semantic confidence is high; keyword branch kept only for fusion diversity",
                extra={"tier": 1, "reason": "semantic_confident"},
            )

        # === Empty pool → Tier 3 (out of context) ===
        if not sem_docs and not kw_docs and not scoped_lists and not record_entries:
            logger.info(
                "VectorService: Hybrid pool empty - returning Tier 3",
                extra={"tier": 3, "reason": sem_reason or "no_docs"},
            )
            tier3_meta = {
                "tier_used": 3,
                "confidence_score": 0,
                "top1_similarity": 0,
                "top3_mean_similarity": 0,
                "lexical_overlap": 0,
                "fallback_reason": sem_reason if sem_failed else "no_docs",
                "semantic_count": 0,
                "keyword_count": 0,
                "fused_count": 0,
                "reranked": False,
                "routed_source_count": len(routed_ids),
                "hard_source_ids": hard_ids,
            }
            _stamp_retrieval_meta_timings(tier3_meta, retrieve_start, branch_timings=branch_timings)
            return [], [], [], [], tier3_meta

        # === Backwards-compat: keyword fallback explicitly disabled ===
        # When the caller opts out of keyword, return semantic results unchanged
        # (no RRF, no rerank). Preserves the old `enable_keyword_fallback=False`
        # contract that some chat paths depend on.
        if not enable_keyword_fallback:
            sims = sorted((max(0.0, 1.0 - d) for d in sem_dists), reverse=True) if sem_dists else []
            kw_off_entries = hybrid_fusion.entries_from_lists(sem_docs, sem_ids, sem_metas, sem_dists)
            if scoped_lists:
                kw_off_entries = hybrid_fusion.prioritize_routed(
                    hybrid_fusion.entries_from_lists(*scoped_lists) + kw_off_entries,
                    routed_set,
                )
            (deduped_docs, deduped_ids, deduped_metas, deduped_dists), lang_reordered = (
                self._finalize_ranking(
                    record_entries + kw_off_entries,
                    preserve_order=bool(scoped_lists or record_entries),
                    routed_set=routed_set,
                    query_lang=query_lang,
                    k=max(k, len(record_entries) + 2) if record_entries else k,
                )
            )
            kw_off_meta = {
                "tier_used": 1 if deduped_docs else 3,
                "confidence_score": round(sims[0] * 100) if sims else 0,
                "top1_similarity": round(tier1_conf.get("top1_sim", 0.0) * 100),
                "top3_mean_similarity": round(tier1_conf.get("top3_mean_sim", 0.0) * 100),
                "lexical_overlap": round(tier1_conf.get("lexical_overlap", 1.0) * 100),
                "fallback_reason": "ok" if deduped_docs else (sem_reason or "no_docs"),
                "semantic_count": len(sem_docs),
                "keyword_count": 0,
                "fused_count": len(deduped_docs),
                "reranked": False,
                "query_language": query_lang,
                "language_reordered": lang_reordered,
                "routed_source_count": len(routed_ids),
                "hard_source_ids": hard_ids,
            }
            _stamp_retrieval_meta_timings(kw_off_meta, retrieve_start, branch_timings=branch_timings)
            return deduped_docs, deduped_ids, deduped_metas, deduped_dists, kw_off_meta

        use_rank_fusion = keyword_mode == "index"
        if use_rank_fusion:
            # === Large collections: RRF over semantic, scoped and full-text lists ===
            sem_w, kw_w = _fusion_weights(keyword_blend, large=True)
            weighted_lists: List[Tuple[Any, float, str]] = []
            if sem_w > 0:
                weighted_lists.append(
                    ((sem_docs, sem_ids, sem_metas, sem_dists), sem_w, "semantic")
                )
            if scoped_lists and sem_w > 0:
                weighted_lists.append((scoped_lists, hybrid_fusion.SCOPED_WEIGHT, "scoped"))
            if kw_docs and kw_w > 0:
                weighted_lists.append(
                    ((kw_docs, kw_ids, kw_metas, kw_dists), kw_w, "keyword")
                )
                for keys, weight, origin in (
                    (kw_exact_keys, hybrid_fusion.EXACT_WEIGHT, "exact"),
                    (kw_rare_keys, hybrid_fusion.RARE_WEIGHT, "rare"),
                ):
                    rows = [
                        row for row in zip(kw_docs, kw_ids, kw_metas, kw_dists)
                        if self._fusion_key(row[0], row[2]) in keys
                    ]
                    if rows:
                        weighted_lists.append((tuple(list(col) for col in zip(*rows)), weight, origin))
            fused_entries = hybrid_fusion.resolve_distances(
                hybrid_fusion.rrf_fuse(weighted_lists, self._fusion_key),
                query_vec=query_state.get("vector"),
                keyword_embeddings=kw_embeddings,
                similarity_threshold=similarity_threshold,
            )
            fused_entries = hybrid_fusion.prioritize_routed(fused_entries, routed_set)[: pool_k]
            fused_docs = [e["doc"] for e in fused_entries]
            fused_ids = [e["id"] for e in fused_entries]
            fused_metas = [e["meta"] for e in fused_entries]
            fused_dists = [e["dist"] for e in fused_entries]
            logger.info(
                "VectorService: RRF fusion → %d chunks (sem=%d scoped=%d kw=%d)",
                len(fused_docs), len(sem_docs), len(scoped_lists[0]) if scoped_lists else 0, len(kw_docs),
            )
        elif kw_docs:
            # === Hybrid Score Fusion (cosine similarity + keyword coverage, weighted) ===
            if scoped_lists:
                sem_docs, sem_ids, sem_metas, sem_dists = hybrid_fusion.merge_by_distance(
                    (sem_docs, sem_ids, sem_metas, sem_dists), scoped_lists, self._chunk_dedup_key
                )
            sem_w, kw_w = _fusion_weights(keyword_blend, large=False)
            fused_docs, fused_ids, fused_metas, fused_dists = self._hybrid_fuse(
                (sem_docs, sem_ids, sem_metas, sem_dists),
                (kw_docs, kw_ids, kw_metas, kw_dists),
                top_k=pool_k,  # over-fetch so URL dedupe still fills top_k
                semantic_weight=sem_w,
                keyword_weight=kw_w,
            )
            logger.info(
                "VectorService: Hybrid fusion (cosine+keyword) → %d chunks "
                "(sem=%d kw=%d)",
                len(fused_docs), len(sem_docs), len(kw_docs),
            )
        else:
            if scoped_lists:
                sem_docs, sem_ids, sem_metas, sem_dists = hybrid_fusion.merge_by_distance(
                    (sem_docs, sem_ids, sem_metas, sem_dists), scoped_lists, self._chunk_dedup_key
                )
            fused_docs, fused_ids, fused_metas, fused_dists = sem_docs, sem_ids, sem_metas, sem_dists

        # === Optional cross-encoder rerank (gated by use_reranker flag) ===
        reranked = False
        rerank_skipped_reason = None
        rerank_ms: Optional[int] = None
        t_rerank = time.perf_counter()
        pq = processed_query
        rerank_decision = retrieval_policy.should_rerank(
            bool(use_reranker),
            len(fused_docs),
            distances=fused_dists[:CE_RERANK_CANDIDATES],
            intent=pq.intent if pq else None,
            entity_count=len(pq.entities) if pq else 0,
            has_constraints=bool(pq and pq.has_constraints),
            min_candidates=CE_RERANK_MIN_CANDIDATES,
        )
        if record_entries and rerank_decision.value:
            rerank_skipped_reason = "item_records"
        elif rerank_decision.value:
            from ..extra_model_runtime import extra_rerank_scores

            provider_scores = extra_rerank_scores(
                project_id, collection_name, query, fused_docs[: min(len(fused_docs), CE_RERANK_CANDIDATES)]
            )
            if provider_scores is None and not cross_encoder.ready():
                rerank_skipped_reason = cross_encoder.unavailable_reason()
                ce_input_n = 0
                rerank_docs, rerank_ids, rerank_metas, rerank_dists, did_rerank = [], [], [], [], False
            else:
                ce_input_n = cross_encoder.candidate_limit(
                    min(len(fused_docs), CE_RERANK_CANDIDATES), CE_RERANK_MIN_CANDIDATES
                )
                slice_docs = fused_docs[:ce_input_n]
                (
                    rerank_docs, rerank_ids, rerank_metas, rerank_dists, did_rerank
                ) = self._cross_encoder_rerank(
                    query,
                    slice_docs,
                    fused_ids[:ce_input_n],
                    fused_metas[:ce_input_n],
                    fused_dists[:ce_input_n],
                    top_k=max(k * 3, k),
                    provider_scores=(provider_scores[:ce_input_n] if provider_scores else None),
                ) if ce_input_n else ([], [], [], [], False)
            if not ce_input_n:
                rerank_skipped_reason = "over_latency_budget"
            if did_rerank:
                tail = max(k * 3, k) - len(rerank_docs)
                floor = max(rerank_dists, default=0.0)
                fused_docs, fused_ids, fused_metas, fused_dists = (
                    rerank_docs + fused_docs[ce_input_n:ce_input_n + tail],
                    rerank_ids + fused_ids[ce_input_n:ce_input_n + tail],
                    rerank_metas + fused_metas[ce_input_n:ce_input_n + tail],
                    rerank_dists + [max(floor, d) for d in fused_dists[ce_input_n:ce_input_n + tail]],
                )
                reranked = True
                rerank_ms = _elapsed_ms_since(t_rerank)
                logger.info(
                    f"VectorService: Cross-encoder rerank applied to {ce_input_n} candidates"
                )
        elif use_reranker:
            rerank_skipped_reason = rerank_decision.reason
            logger.info(
                "VectorService: Cross-encoder rerank skipped (%s, fused_count=%d)",
                rerank_decision.reason,
                len(fused_docs),
            )

        final_entries = hybrid_fusion.entries_from_lists(fused_docs, fused_ids, fused_metas, fused_dists)

        # === Reward memory from admin-trained feedback (soft reorder, never drops) ===
        # Runs before the constraint boost so explicit price/rating constraints keep precedence
        # and learned preferences only break ties among equally fitting candidates.
        final_entries, feedback_info = feedback_memory_hook.apply(
            final_entries, project_id, query_state.get("vector"), getattr(active_embedder, "embed_model", None)
        )

        # === Query-time constraint boost (price/rating parsed from chunk text) ===
        boost_info: Dict[str, Any] = {"applied": False, "reason": "no_constraints"}
        if pq is not None and pq.has_constraints:
            final_entries, boost_info = constraint_boost.boost_entries(
                final_entries, pq.constraints, pq.entities
            )

        geo_query = routing_query or query
        location_boost_info: Dict[str, Any] = {"applied": False, "reason": "not_geo"}
        final_entries, location_boost_info = constraint_boost.boost_location_evidence(
            final_entries, geo_query
        )

        # === Page kind: policy questions read FAQ/policy pages; shopping filters read products ===
        page_kind_info: Dict[str, Any] = {"applied": False, "reason": "not_requested"}
        if site_info:
            final_entries, page_kind_info = page_kinds.prefer_info(
                final_entries,
                (query_state.get("info") or [])[:INFO_PAGE_INJECT_MAX],
                limit=max(2, k - 1),
            )
        elif pq is not None and pq.intent == query_signals.INTENT_FILTER:
            final_entries, page_kind_info = page_kinds.demote_articles(final_entries)

        # Fused/routed/boosted order is the ranking — do not re-sort by distance.
        preserve_order = bool(
            use_rank_fusion
            or routed_set
            or boost_info.get("applied")
            or location_boost_info.get("applied")
            or feedback_info.get("applied")
            or page_kind_info.get("applied")
            or record_entries
        )
        if preserve_order:
            final_entries = hybrid_fusion.prioritize_routed(final_entries, routed_set)
        finalize_k = max(k, len(record_entries) + 2) if record_entries else k
        (fused_docs, fused_ids, fused_metas, fused_dists), lang_reordered = self._finalize_ranking(
            record_entries + final_entries,
            preserve_order=preserve_order,
            routed_set=routed_set,
            query_lang=query_lang,
            k=finalize_k,
        )
        from .parent_child import expand_parent_hits

        fused_docs, fused_ids, fused_metas, fused_dists = expand_parent_hits(
            fused_docs, fused_ids, fused_metas, fused_dists, finalize_k
        )

        # === Build retrieval_meta ===
        # tier_used stays an integer for backwards compatibility with the LLM
        # extractive-fallback path (RAG.query reads this and switches on 1 vs 2).
        # 1 = semantic-driven result, 2 = keyword-only fallback, 3 = empty pool.
        sims = [max(0.0, 1.0 - d) for d in fused_dists] if fused_dists else []
        tier_used = 1 if (sem_docs or scoped_lists or record_entries) else 2
        retrieval_meta = {
            "tier_used": tier_used,
            # Routed/fused order is not similarity order — confidence is the best chunk.
            "confidence_score": round(max(sims) * 100) if sims else 0,
            "top1_similarity": round(tier1_conf.get("top1_sim", 0.0) * 100),
            "top3_mean_similarity": round(tier1_conf.get("top3_mean_sim", 0.0) * 100),
            "lexical_overlap": round(tier1_conf.get("lexical_overlap", 1.0) * 100),
            "fallback_reason": "ok" if (sem_docs or scoped_lists or record_entries) else sem_reason,
            "record_count": len(record_entries),
            "semantic_count": len(sem_docs),
            "keyword_count": len(kw_docs),
            "fused_count": len(fused_docs),
            "reranked": reranked,
            "rerank_skipped_reason": rerank_skipped_reason,
            "keyword_mode": keyword_mode,
            "routed_source_count": len(routed_ids),
            "query_language": query_lang,
            "language_reordered": lang_reordered,
            "hard_source_ids": hard_ids,
            "rerank_decision": rerank_decision.to_meta(),
            "constraint_boost": boost_info,
            "location_boost": location_boost_info,
            "page_kind_boost": page_kind_info,
            "feedback_memory": feedback_info,
        }
        if disabled_sources:
            retrieval_meta["excluded_sources"] = len(disabled_sources)
        _stamp_retrieval_meta_timings(
            retrieval_meta, retrieve_start, rerank_ms, branch_timings=branch_timings
        )
        return fused_docs, fused_ids, fused_metas, fused_dists, retrieval_meta


def _elapsed_ms_since(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


def _stamp_retrieval_meta_timings(
    meta: Dict[str, Any],
    retrieve_start: float,
    rerank_ms: Optional[int] = None,
    *,
    branch_timings: Optional[Dict[str, Optional[int]]] = None,
) -> None:
    """Attach retrieval_ms / reranking_ms (and per-branch timings) to retrieval_meta."""
    if rerank_ms is not None and rerank_ms > 0:
        meta["reranking_ms"] = rerank_ms
        meta["retrieval_ms"] = max(0, _elapsed_ms_since(retrieve_start) - rerank_ms)
    else:
        meta["reranking_ms"] = None
        meta["retrieval_ms"] = _elapsed_ms_since(retrieve_start)
    if branch_timings:
        meta["retrieval_branches_ms"] = dict(branch_timings)


def _build_stage_timings_ms(
    *,
    start_wall: float,
    retrieval_meta: Optional[Dict[str, Any]] = None,
    llm_generation_ms: Optional[int] = None,
    streaming_ms: Optional[int] = None,
    contextualize_ms: Optional[int] = None,
    source_build_ms: Optional[int] = None,
    finalize_ms: Optional[int] = None,
    settings_load_ms: Optional[int] = None,
) -> Dict[str, Any]:
    rm = retrieval_meta if isinstance(retrieval_meta, dict) else {}
    return {
        "total_ms": max(0, int((time.time() - start_wall) * 1000)),
        "retrieval_ms": rm.get("retrieval_ms"),
        "reranking_ms": rm.get("reranking_ms"),
        "llm_generation_ms": llm_generation_ms,
        "streaming_ms": streaming_ms,
        "contextualize_ms": contextualize_ms,
        "source_build_ms": source_build_ms,
        "finalize_ms": finalize_ms,
        "settings_load_ms": settings_load_ms,
        "retrieval_branches_ms": rm.get("retrieval_branches_ms"),
        "retrieval_attempts_ms": rm.get("retrieval_attempts_ms"),
        "verification_ms": (rm.get("verification") or {}).get("ms"),
        "answer_completion_ms": rm.get("answer_completion_ms"),
    }


def raw_chunk_similarity_pct_from_distances(distances: List[Any]) -> List[int]:
    """Per-chunk similarity 0–100 from vector distance (same indexing as filtered contexts)."""
    out: List[int] = []
    for d in distances:
        try:
            di = float(d)
        except (TypeError, ValueError):
            di = 1.0
        out.append(round(max(0.0, 1.0 - di) * 100))
    return out


def normalize_chunk_relevance_pcts(pcts: List[int]) -> List[int]:
    """Spread per-chunk scores across 0–100 within one answer for display (relative relevance)."""
    if not pcts:
        return []
    if len(pcts) == 1:
        return [100]
    lo = min(pcts)
    hi = max(pcts)
    if lo == hi:
        n = len(pcts)
        step = 80.0 / (n - 1)
        return [max(0, min(100, round(100.0 - i * step))) for i in range(n)]
    span = hi - lo
    return [max(0, min(100, round(100.0 * (p - lo) / span))) for p in pcts]


def chunk_relevance_pcts_from_distances(
    distances: List[Any],
) -> Tuple[List[int], List[int]]:
    """Return (absolute_pct, display_pct) aligned with filtered contexts."""
    absolute = raw_chunk_similarity_pct_from_distances(distances)
    return absolute, normalize_chunk_relevance_pcts(absolute)


# ---------------- RAG Core ----------------
class RAG:
    OUT_OF_CONTEXT_MSG = (
        "I am sorry, this query is out of the context of the provided documents."
    )
    OUT_OF_CONTEXT_SENTINEL = "QUERY_OUT_OF_CONTEXT"
    PRIVACY_BLOCK_MSG = (
        "I cannot share sensitive personal or financial details from uploaded documents."
    )

    @staticmethod
    def _hosted_llm_provider(provider: str) -> bool:
        p = (provider or "").lower()
        if "custom" in p or "ollama" in p:
            return False
        return any(
            token in p for token in ("openai", "mistral", "gemini", "anthropic", "claude")
        )

    @staticmethod
    def _llm_allow_ollama_fallback(provider: str) -> bool:
        return not RAG._hosted_llm_provider(provider)

    _LLM_UNCERTAINTY_PATTERNS = [
        r"\bi\s+don[‘’]?t\s+know\b",
        r"\bi\s+do\s+not\s+know\b",
        r"\bi\s+(?:am|’?m)\s+not\s+sure\b",
        r"\bi\s+am\s+uncertain\b",
        r"\buncertain\s+as\b",
        r"\bi\s+cannot\s+(?:answer|provide|find)\b",
        r"\bi\s+(?:have\s+)?no\s+information\b",
        r"\bno\s+information\s+(?:is\s+)?available\b",
        r"\bnot\s+(?:able\s+to\s+)?(?:find|provide)\s+(?:an?\s+)?answer\b",
        r"\bunable\s+to\s+(?:answer|provide)\b",
        r"\bsorry[,\s]+i\s+(?:can(?:not|’?t)|don[‘’]?t)\b",
        r"\bdo\s+not\s+specify\b",
    ]

    def __init__(self, retriever: Retriever, llm_model="gpt-oss:120b-cloud", timeout=300):
        from ..infra_env import ollama_base_url

        self.retriever = retriever
        self.llm = Ollama(
            model=llm_model,
            base_url=ollama_base_url(),
            request_timeout=timeout,
            keep_alive="1h",
            context_window=8192,
        )
        self._clean_regex = re.compile(
            r"===FINAL_ANSWER===(.*?)(?:===END_FINAL_ANSWER===|$)",
            re.DOTALL,
        )

        self._query_cache: Dict[str, Any] = {}
        self._cache_max_size = 100

        self.redis_client = None
        self.redis_ttl = 86400
        try:
            rh, rp = _redis_host_port()
            self.redis_client = redis.StrictRedis(
                host=rh, port=rp, db=0, decode_responses=True
            )
            self.redis_client.ping()
            logger.info("Successfully connected to Redis cache.")
        except Exception as e:
            logger.warning(f"Could not connect to Redis. Caching disabled. Error: {e}")

    # ---------- small helpers ----------
    def _make_cache_keys(
        self, user_query: str, top_k: int, max_tokens: Optional[int], generate_topk: bool,
        user_id: Optional[int] = None, project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        format_type: str = "markdown",
    ):
        # Include project + collection so cache is not reused across embedding models.
        key_str = (
            f"{user_query}_{top_k}_{max_tokens}_{generate_topk}"
            f"_{user_id}_{project_id}_{collection_name or ''}_{format_type}"
        )
        h = hashlib.sha256(key_str.encode()).hexdigest()
        return f"rag_summary:{h}", key_str

    def _get_cached(self, redis_key: Optional[str], local_key: str):
        # Callers post-process the result in place; hand out copies, never the cached dict.
        if local_key in self._query_cache:
            logger.info(f"Cache hit (Local) for query.")
            return copy.deepcopy(self._query_cache[local_key])

        # Skip Redis lookup if no redis_key provided (e.g., cache bypassed)
        if not redis_key:
            return None

        if self.redis_client:
            try:
                data = self.redis_client.get(redis_key)
                if data:
                    logger.info(f"Cache hit (Redis) for query.")
                    result = json.loads(data)
                    self._query_cache[local_key] = result
                    return copy.deepcopy(result)
            except Exception as e:
                logger.warning(f"Failed to retrieve from Redis cache: {e}")
        return None

    def _should_cache_query_result(self, result: Dict[str, Any]) -> bool:
        """Do not cache no-context or error responses (avoids stale OOC after ingest)."""
        raw_contexts = result.get("raw_contexts") or []
        if not any((c or "").strip() for c in raw_contexts):
            logger.debug("RAG cache skip: reason=no_context (empty raw_contexts)")
            return False

        summary = (result.get("summary") or "").strip()
        if summary == self.OUT_OF_CONTEXT_MSG:
            logger.debug("RAG cache skip: reason=no_context (default OOC summary)")
            return False
        if result.get("llm_failed") or summary.startswith("LLM failed to respond"):
            logger.debug("RAG cache skip: reason=llm_failure")
            return False

        retrieval_meta = result.get("retrieval_meta") or {}
        fallback = (retrieval_meta.get("fallback_reason") or "").lower()
        if fallback in (
            "no_docs",
            "empty_pool",
            "privacy_guard_blocked",
            "tier_3_empty",
        ) or "empty" in fallback and "pool" in fallback:
            logger.debug("RAG cache skip: reason=no_context (fallback=%s)", fallback)
            return False

        top_k = result.get("top_k") or {}
        if not top_k and not summary:
            logger.debug("RAG cache skip: reason=empty_result")
            return False

        return True

    def _set_cached(self, redis_key: Optional[str], local_key: str, result: Dict[str, Any]):
        if not self._should_cache_query_result(result):
            return
        # Skip if no redis key (e.g. bypassed cache)
        if not redis_key:
            return

        self._query_cache[local_key] = copy.deepcopy(result)
        if len(self._query_cache) > self._cache_max_size:
            self._query_cache.pop(next(iter(self._query_cache)))

        if self.redis_client:
            try:
                self.redis_client.set(redis_key, json.dumps(result), ex=self.redis_ttl)
                logger.info(f"Stored result in Redis cache: {redis_key}")
            except Exception as e:
                logger.warning(f"Failed to store result in Redis: {e}")

    def clear_query_cache(self):
        self._query_cache.clear()
        logger.info("Cleared local RAG query cache.")

        if self.redis_client:
            try:
                keys = list(self.redis_client.scan_iter(match="rag_summary:*", count=200))
                if keys:
                    self.redis_client.delete(*keys)
                    logger.info(f"Cleared {len(keys)} Redis RAG cache keys.")
            except Exception as e:
                logger.warning(f"Failed to clear Redis RAG cache: {e}")

    def _is_sensitive_query(self, user_query: str) -> bool:
        """Detect direct requests for private secrets from documents.

        Uses word-boundary matching so short tokens like ``pin`` do not match
        inside unrelated words (e.g. ``typing`` → false positive privacy block).
        """
        q = (user_query or "").lower()
        if not q.strip():
            return False
        secret_intent_terms = [
            "account number",
            "bank account",
            "statement number",
            "card number",
            "cvv",
            "pin",
            "ifsc",
            "swift",
            "routing number",
            "iban",
            "aadhaar",
            "pan number",
            "social security",
            "ssn",
            "password",
            "private details",
            "personal details",
            "secret",
        ]
        extraction_verbs = [
            "what is",
            "show",
            "tell",
            "give",
            "reveal",
            "extract",
            "share",
            "display",
        ]

        def _has_phrase(phrase: str) -> bool:
            return bool(
                re.search(rf"\b{re.escape(phrase)}\b", q, flags=re.IGNORECASE)
            )

        return any(_has_phrase(t) for t in secret_intent_terms) and any(
            _has_phrase(v) for v in extraction_verbs
        )

    def _redact_sensitive_text(self, text: str) -> str:
        """Redact common personal/financial identifiers from retrieved context.

        Public contact info (hospital phone lines, department emails) is not redacted here;
        sensitive extraction queries are blocked separately via _is_sensitive_query().
        """
        if not text:
            return text

        redacted = text
        redaction_patterns = [
            (r"\b[A-Z]{5}[0-9]{4}[A-Z]\b", "[REDACTED_PAN]"),
            (r"\b[A-Z]{4}0[A-Z0-9]{6}\b", "[REDACTED_IFSC]"),
            (r"\b\d{4}\s?\d{4}\s?\d{4}\b", "[REDACTED_AADHAAR]"),
            # Card-length only (16–19 digits); avoids matching public phone numbers.
            (r"\b(?:\d[ -]?){16,19}\b", "[REDACTED_CARD_OR_ACCOUNT]"),
            # Long account numbers only; typical phone numbers are 9–12 digits.
            (r"\b\d{15,18}\b", "[REDACTED_ACCOUNT_NUMBER]"),
        ]
        for pattern, replacement in redaction_patterns:
            redacted = re.sub(pattern, replacement, redacted)
        return redacted

    def _clean_response_text(self, text: str, format_type: str = "markdown") -> str:
        text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL)
        text = re.sub(r"\[\d+\]", "", text)
        # Remove citation artifacts always
        text = re.sub(r"CITE:\d+", "", text, flags=re.IGNORECASE)
        text = re.sub(r"\[Document\s+\d+[^\]]*\]", "", text)
        # Passage labels / SOURCES_USED / NEXT_STEP trailers must never reach users.
        text, _ = answer_next_step.split_next_step(text)
        text, _ = citation_trailer.parse_and_strip(text)
        text = re.sub(r"-{2,}\s*Passage\s+\d+\s*-{2,}", "", text, flags=re.IGNORECASE)
        # Inline parenthetical markers e.g. (Source 4), (Sources 1, 2)
        text = re.sub(
            r"(?:\*\*)?\s*[(\[]\s*sources?\s*[:#]?\s*\d+(?:\s*[,;&/]\s*\d+)*\s*[)\]](?:\*\*)?",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(
            r"(?:\*\*)?\s*[(\[]\s*(?:passage|document|excerpt|chunk)\s*[:#]?\s*\d+"
            r"(?:\s*[,;&/]\s*\d+)*\s*[)\]](?:\*\*)?",
            "",
            text,
            flags=re.IGNORECASE,
        )
        text = re.sub(r"[ \t]{2,}", " ", text)
        text = re.sub(r" +([.,;:!?])", r"\1", text)

        if format_type.startswith("html"):
            # HTML mode: preserve tags, only normalize whitespace artifacts
            text = re.sub(r"SUMMARY\s*:", "", text, flags=re.IGNORECASE)
            # Drop leftover Summary heading if the model still emits it
            text = re.sub(
                r"<h2[^>]*>\s*Summary\s*</h2>",
                "",
                text,
                flags=re.IGNORECASE,
            )
            text = re.sub(r"\n{3,}", "\n\n", text)
            return text.strip()

        # Markdown mode: existing cleaning logic
        code_blocks: List[str] = []
        code_pattern = r"```[\s\S]*?```"

        def replace_code(m):
            idx = len(code_blocks)
            code_blocks.append(m.group(0))
            return f"__CODE_BLOCK_{idx}__"

        text = re.sub(code_pattern, replace_code, text)
        text = re.sub(r"\n{3,}", "\n\n", text)

        lines = text.split("\n")
        cleaned_lines = []
        for line in lines:
            if "__CODE_BLOCK_" in line:
                cleaned_lines.append(line)
            elif line.strip().startswith(("-", "*", "#", ">", "|", "`")):
                cleaned_lines.append(line)
            else:
                line = re.sub(r"[ \t]+", " ", line).strip()
                if line:
                    cleaned_lines.append(line)
        text = "\n".join(cleaned_lines)

        for i, block in enumerate(code_blocks):
            text = text.replace(f"__CODE_BLOCK_{i}__", block)

        text = re.sub(r'^[\s]*Answer[:.]?\s*', '', text, flags=re.IGNORECASE | re.MULTILINE)
        text = re.sub(r'^[\s]*Answer[\s]*\n', '', text, flags=re.IGNORECASE | re.MULTILINE)

        return text.strip()

    def _extract_section(
        self, text: str, header: str, next_headers: List[str]
    ) -> str:
        """Extract [header ... next_header) section; header can be 'SUMMARY:' or 'REFINED_ANSWERS' etc."""
        # case-insensitive search for header label
        lower = text.lower()
        header_lower = header.lower()
        idx = lower.find(header_lower)
        if idx == -1:
            return ""
        start = idx + len(header)
        end = len(text)

        for nh in next_headers:
            nh_lower = nh.lower()
            pos = lower.find(nh_lower, start)
            if pos != -1 and pos < end:
                end = pos

        return text[start:end].strip()

    def _strip_crawl_ui_noise(self, text: str) -> str:
        """Remove common crawl/UI fragments that pollute extractive snippets."""
        cleaned = (text or "").strip()
        if not cleaned:
            return ""
        cleaned = re.sub(r"(?i)\bread\s+full\b", " ", cleaned)
        cleaned = re.sub(r"(?i)\bread\s+more\b", " ", cleaned)
        cleaned = re.sub(r"(?i)\blearn\s+more\b", " ", cleaned)
        cleaned = re.sub(r"#{2,}\s*", "", cleaned)
        cleaned = re.sub(r"\s+", " ", cleaned).strip()
        return cleaned

    def _extract_meaningful_snippet(
        self, context: str, query: str = "", max_length: int = 350
    ) -> str:
        if not context or not context.strip():
            return ""

        cleaned = re.sub(r"\[Document \d+.*?\]", "", context)
        cleaned = re.sub(r"CITE:\d+", "", cleaned)
        cleaned = re.sub(r"\[\d+\]", "", cleaned).strip()
        cleaned = self._strip_crawl_ui_noise(cleaned)
        if not cleaned:
            return ""

        if len(cleaned) <= max_length:
            return cleaned

        query_terms = [t for t in query.lower().split() if len(t) > 2] if query else []
        sentences = re.split(r"[.!?]\s+", cleaned)
        best_sentence = None
        best_score = 0

        for s in sentences:
            s = self._strip_crawl_ui_noise(s.strip())
            if len(s) < 20:
                continue
            score = sum(1 for t in query_terms if t in s.lower()) if query_terms else 0
            if query_terms and score < 1:
                continue
            if 50 <= len(s) <= 300 and score >= best_score:
                best_score = score
                best_sentence = s

        if best_sentence:
            return (
                best_sentence[: max_length - 3] + "..."
                if len(best_sentence) > max_length
                else best_sentence
            )

        snippet = cleaned[:max_length]
        last_end = max(snippet.rfind("."), snippet.rfind("!"), snippet.rfind("?"))
        if last_end > max_length * 0.5:
            snippet = snippet[: last_end + 1]
        else:
            snippet = snippet.rstrip() + "..."
        return snippet

    def _is_out_of_context_response(self, text: str) -> bool:
        raw = (text or "").strip()
        if not raw:
            return False
        return (
            self.OUT_OF_CONTEXT_SENTINEL in raw
            or "out of the context" in raw.lower()
        )

    def _resolve_ooc_answer(
        self,
        raw_response: str,
        *,
        user_query: str,
        non_empty_contexts: List[str],
        retrieval_meta: Optional[Dict[str, Any]],
        mode: str,
        format_type: str = "markdown",
        system_prompt: Optional[str] = None,
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        When the LLM emits QUERY_OUT_OF_CONTEXT (or similar), return a friendly
        message. Raw chunk dumps are never shown — recovery LLM handles synthesis upstream.
        """
        if not self._is_out_of_context_response(raw_response):
            return raw_response

        meta = retrieval_meta or {}
        retrieval_confidence = int(meta.get("confidence_score", 0) or 0)
        tier_used = int(meta.get("tier_used", 1) or 1)

        logger.info(
            "LLM returned out-of-context. tier=%s, confidence=%s%%. mode=%s",
            tier_used,
            retrieval_confidence,
            mode,
        )

        cleaned_raw = raw_response.replace(self.OUT_OF_CONTEXT_SENTINEL, "").strip()
        if cleaned_raw and not self._is_out_of_context_response(cleaned_raw):
            return self._clean_response_text(cleaned_raw, format_type=format_type)
        if system_prompt and not cleaned_raw:
            return self._extract_custom_ooc_reply(system_prompt) or self.OUT_OF_CONTEXT_MSG

        return self.OUT_OF_CONTEXT_MSG

    _SEARCH_LEXICAL_STOPWORDS = frozenset(
        {
            "what",
            "which",
            "where",
            "when",
            "who",
            "whom",
            "how",
            "why",
            "are",
            "the",
            "and",
            "for",
            "with",
            "from",
            "this",
            "that",
            "have",
            "has",
            "had",
            "was",
            "were",
            "does",
            "did",
            "can",
            "about",
            "into",
            "your",
            "our",
            "their",
            "its",
            "any",
            "all",
            "please",
            "tell",
            "give",
            "show",
            "list",
            "some",
            "more",
            "than",
            "also",
            # Generic content words that match almost any marketing site and
            # must not alone count as evidence for an entity query ("nitsan").
            "service",
            "services",
            "company",
            "companies",
            "product",
            "products",
            "website",
            "page",
            "home",
            "contact",
            "information",
            "details",
            "team",
            "solution",
            "solutions",
            "business",
            "digital",
            "online",
            "support",
            "offer",
            "offers",
            "provide",
            "provides",
            "help",
            "need",
            "want",
        }
    )

    def _search_signal_terms(self, query: str) -> set:
        """Distinctive query terms used to gate search retrieval / OOC recovery."""
        return {
            t
            for t in re.findall(r"\w+", (query or "").lower())
            if len(t) > 2 and t not in self._SEARCH_LEXICAL_STOPWORDS
        }

    def _search_lacks_lexical_support(
        self,
        query: str,
        contexts: List[str],
        *,
        distances: Optional[List[float]] = None,
        lang: Optional[str] = None,
    ) -> bool:
        """True when the passages do not support the query (see ``_evidence_decision``)."""
        return not self._evidence_decision(query, contexts, distances=distances, lang=lang).sufficient

    def _legacy_lacks_lexical_support(self, query: str, contexts: List[str]) -> bool:
        """True when no distinctive query terms appear in any retrieved chunk."""
        terms = self._search_signal_terms(query)
        if not terms:
            return True
        for ctx in contexts:
            lowered = (ctx or "").lower()
            if any(t in lowered for t in terms):
                return False
        return True

    def _top_contexts_for_search_recovery(
        self, query: str, contexts: List[str], limit: int = 3
    ) -> List[str]:
        terms = self._search_signal_terms(query)
        # Recovery forces an answer, so one incidental word ("peru" inside "superuser",
        # "capital" on a pricing page) is not enough: require two terms (or all, if fewer).
        required = min(2, len(terms))
        patterns = [re.compile(rf"\b{re.escape(t)}") for t in terms]
        scored: List[Tuple[int, str]] = []
        for ctx in contexts:
            text = (ctx or "").strip()
            if not text:
                continue
            lowered = text.lower()
            score = sum(1 for p in patterns if p.search(lowered))
            if score <= 0 or score < required:
                continue
            scored.append((score, text))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [text for _, text in scored[:limit]]

    def _build_search_recovery_prompt(
        self,
        user_query: str,
        contexts: List[str],
        *,
        format_type: str = "html_long",
        language_code: Optional[str] = None,
    ) -> str:
        from .language_config import build_language_instruction

        language_instruction = build_language_instruction(language_code)
        joined = "\n\n".join(
            f"--- Passage {i + 1} ---\n{ctx}" for i, ctx in enumerate(contexts)
        )
        if format_type == "html_short":
            format_block = (
                "Write 3-4 short sentences in HTML only: wrap in <p>...</p>. "
                "No Markdown, no headers."
            )
        elif format_type == "markdown":
            format_block = (
                "Write clear Markdown (short paragraphs, optional ### headers). No HTML."
            )
        else:
            format_block = (
                "Write clear HTML only (no Markdown, no ###).\n"
                "Start with <p>1–2 sentence direct answer with one <mark>precise span</mark></p>, "
                "then optional <h2>…</h2><ul><li><strong>Label:</strong> plain detail</li></ul> "
                "(enough labeled bullets to cover supported facts), "
                "then a required closing <p> with exactly 1–2 wrap-up sentences. "
                "No Summary heading. No mid-sentence bold. Target ~150–350 words; "
                "do not truncate mid-sentence or omit material source facts. "
                "No invented details. No repetition. No notes about retrieval or out-of-context."
            )
        return (
            "You are an AI search widget. Answer the user using ONLY the sources below.\n"
            "The sources are relevant — synthesize a helpful, natural answer.\n"
            "Do NOT output QUERY_OUT_OF_CONTEXT. Do NOT refuse. Do NOT paste raw source text.\n"
            f"{format_block}\n"
            f"{language_instruction}\n\n"
            f"SOURCES:\n{joined}\n\n"
            f"QUESTION: {user_query}\n"
            "ANSWER:"
        )

    def _complete_ooc_recovery(
        self,
        llm: Any,
        user_query: str,
        contexts: List[str],
        *,
        format_type: str,
        language_code: Optional[str],
        max_tokens: Optional[int],
        llm_kwargs: Optional[Dict[str, Any]] = None,
    ) -> str:
        """One-shot recovery when LLM emitted OOC but entity terms matched in retrieved chunks."""
        recovery_contexts = self._top_contexts_for_search_recovery(
            user_query, contexts, limit=3
        )
        if not recovery_contexts:
            return ""
        prompt = self._build_search_recovery_prompt(
            user_query,
            recovery_contexts,
            format_type=format_type,
            language_code=language_code,
        )
        kwargs = dict(llm_kwargs or {})
        kwargs["max_tokens"] = min(int(max_tokens or 400), 450)
        try:
            response = self._complete_with_transient_retry(
                llm,
                prompt,
                provider="search_recovery",
                kwargs=kwargs,
            )
            text = (getattr(response, "text", None) or str(response) or "").strip()
        except Exception as exc:
            logger.warning("OOC recovery complete failed: %s", exc)
            return ""
        if not text or self._is_out_of_context_response(text):
            return ""
        return self._clean_response_text(text, format_type=format_type)

    def _complete_search_ooc_recovery(self, *args, **kwargs) -> str:
        """Backward-compatible alias for search callers."""
        return self._complete_ooc_recovery(*args, **kwargs)

    def _build_context_fallback_answer(
        self,
        query: str,
        contexts: List[str],
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        Internal short bullet fallback (max 3 snippets). Not used for user-facing OOC paths.
        """
        del max_tokens  # kept for call-site compatibility
        if not contexts:
            return self.OUT_OF_CONTEXT_MSG

        recovery_contexts = self._top_contexts_for_search_recovery(query, contexts, limit=3)
        if not recovery_contexts:
            return self.OUT_OF_CONTEXT_MSG

        snippets: List[str] = []
        for ctx in recovery_contexts:
            snippet = self._extract_meaningful_snippet(ctx, query=query, max_length=320)
            if not snippet:
                continue
            cleaned = re.sub(r"\s+", " ", snippet).strip()
            if cleaned:
                snippets.append(cleaned)
        if not snippets:
            return self.OUT_OF_CONTEXT_MSG

        lines = ["### Answer from retrieved context"]
        for snippet in snippets[:3]:
            lines.append(f"- {snippet}")
        return "\n".join(lines)

    def _fallback_answer_after_llm_failure(
        self,
        *,
        user_query: str,
        non_empty_contexts: List[str],
        retrieval_meta: Optional[Dict[str, Any]],
        mode: str,
        format_type: str = "markdown",
        max_tokens: Optional[int] = None,
        exc: Optional[BaseException] = None,
        llm: Any = None,
        language_code: Optional[str] = None,
        llm_kwargs: Optional[Dict[str, Any]] = None,
        provider: Optional[str] = None,
        model: Optional[str] = None,
    ) -> str:
        """
        When the LLM fails/times out but retrieval already found contexts,
        return an honest provider error (or try recovery). Never dump raw
        chunks and never pretend the query was out of context.
        """
        from ..llm_error_messages import (
            format_llm_error_for_user,
            is_llm_auth_error,
            is_llm_provider_infra_error,
        )

        del mode  # call-site compatibility
        del retrieval_meta

        contexts = [c for c in (non_empty_contexts or []) if (c or "").strip()]

        # Auth / rate-limit / timeout / connectivity — tell the truth immediately.
        if exc is not None and (
            is_llm_auth_error(exc) or is_llm_provider_infra_error(exc)
        ):
            return format_llm_error_for_user(exc, provider=provider, model=model)

        if contexts and not self._search_lacks_lexical_support(user_query, contexts):
            # Only attempt recovery when we do not already know the provider is down.
            if llm is not None and (
                exc is None or not is_llm_provider_infra_error(exc)
            ):
                recovered = self._complete_ooc_recovery(
                    llm,
                    user_query,
                    contexts,
                    format_type=format_type,
                    language_code=language_code,
                    max_tokens=max_tokens,
                    llm_kwargs=llm_kwargs,
                )
                if recovered:
                    logger.info(
                        "LLM failure fallback: using OOC recovery (contexts=%d)",
                        len(contexts),
                    )
                    return recovered

            # Sources were found; generation failed. Do not show OOC or chunk dumps.
            if exc is not None:
                return format_llm_error_for_user(exc, provider=provider, model=model)
            return (
                "Relevant sources were found, but the AI service could not generate an answer. "
                "Please try again."
            )

        if contexts:
            if exc is not None:
                return format_llm_error_for_user(exc, provider=provider, model=model)
            return (
                "Relevant sources were found, but the AI service could not generate an answer. "
                "Please try again."
            )

        if exc is not None:
            return format_llm_error_for_user(exc, provider=provider, model=model)
        return "Sorry, I couldn't generate a response. Please try again."

    @staticmethod
    def _is_retryable_llm_error(exc: BaseException) -> bool:
        lower = str(exc).lower()
        return any(
            token in lower
            for token in (
                "429",
                "rate limit",
                "too many requests",
                "timed out",
                "timeout",
                "overloaded",
                "service unavailable",
                "temporarily unavailable",
                "connection reset",
                "connection aborted",
                "connection error",
            )
        )

    def _complete_with_transient_retry(
        self,
        llm: Any,
        prompt: str,
        *,
        provider: str,
        kwargs: Dict[str, Any],
        max_attempts: int = 2,
    ) -> Any:
        """
        Retry one time for transient hosted-provider failures (Mistral/OpenAI/etc).
        Keeps architecture unchanged while reducing intermittent answer failures.
        """
        attempt = 0
        while True:
            attempt += 1
            try:
                return llm.complete(prompt, **kwargs)
            except Exception as exc:
                retryable = self._is_retryable_llm_error(exc)
                if attempt >= max_attempts or not retryable:
                    raise
                delay = min(3.0, 0.9 * attempt)
                logger.warning(
                    "LLM complete transient error (provider=%s attempt=%s/%s): %s; retrying in %.1fs",
                    provider,
                    attempt,
                    max_attempts,
                    exc,
                    delay,
                )
                time.sleep(delay)

    def generate_context(
        self,
        query: str,
        top_k: Optional[int] = None,
        min_results: Optional[int] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        embedder: Optional["EmbedData"] = None,
        collection_name: Optional[str] = None,
    ) -> Tuple[str, List[str], List[Dict[str, Any]]]:
        """Return (context_string, unique_doc_ids, metadata_list)."""
        if top_k is None:
            top_k = self.retriever.default_top_k

        retrieve_k = top_k
        if min_results:
            retrieve_k = max(min_results * 2, top_k * 2)

        retrieve_result = self.retriever.retrieve(
            query, top_k=retrieve_k, user_id=user_id, project_id=project_id, similarity_threshold=similarity_threshold,
            embedder=embedder, collection_name=collection_name,
        )
        results, document_ids, metadatas = retrieve_result[0], retrieve_result[1], retrieve_result[2]
        if not results:
            logger.warning(f"No results found for query: {query}")
            return "No relevant context found.", [], []

        contexts = []
        unique_doc_ids = list(dict.fromkeys(document_ids))
        doc_id_to_index = {doc_id: i + 1 for i, doc_id in enumerate(unique_doc_ids)}

        for idx, (ctx, doc_id) in enumerate(zip(results, document_ids), 1):
            doc_idx = doc_id_to_index.get(doc_id, idx)
            score = 0.0  # not exposing distances here
            contexts.append(
                f"[Document {doc_idx} (ID: {doc_id[:8]}...) - Relevance: {score:.2f} | CITE:{idx}]\n{ctx}"
            )

        context_str = "\n\n".join(contexts)

        logger.info(
            f"Generated context with {len(contexts)} chunks from "
            f"{len(unique_doc_ids)} unique documents (total chars: {len(context_str)})"
        )
        return context_str, unique_doc_ids, metadatas

    @staticmethod
    def _retrieval_query_for_user_query(user_query: str, query_lang: Optional[str] = None) -> str:
        """
        Expand geographic location questions so hybrid retrieval prefers HQ/address chunks
        over generic brand mentions. The LLM still sees the original user question.
        Expansion terms follow the question's language so they do not pull other-language pages.
        """
        q = (user_query or "").strip()
        if not q:
            return q
        from ..source_display_policy import user_query_asks_geographic_location

        if user_query_asks_geographic_location(q):
            return f"{q} {_GEO_QUERY_EXPANSION.get(query_lang or '', _GEO_QUERY_EXPANSION['en'])}"
        return q

    @staticmethod
    def _resolve_processed_query(
        user_query: str,
        processed_query: Optional[ProcessedQuery],
        source_lang: Optional[str],
    ) -> Optional[ProcessedQuery]:
        """Caller-supplied ``ProcessedQuery``, else a fresh one (``None`` when disabled)."""
        if processed_query is not None:
            return processed_query
        if not query_processing.is_enabled():
            return None
        return query_processing.process_query(user_query, language_hint=source_lang)

    def _retrieve_for_query(
        self,
        user_query: str,
        processed_query: Optional[ProcessedQuery],
        retrieve_k: int,
        source_lang: Optional[str],
        **retrieve_kwargs: Any,
    ):
        """Retrieve with the deterministic rewrite, plus at most one fallback retry.

        The fallback reuses the original question and the same source routing text,
        so a hard source scope holds for both attempts.
        """
        pq = processed_query
        base = pq.retrieval_query if pq is not None and pq.retrieval_query else user_query

        def _run(text: str):
            retrieval_text = self._retrieval_query_for_user_query(text, source_lang)
            embedder = retrieve_kwargs.get("embedder") or getattr(self.retriever, "embedder", None)
            cache_parts = {k: v for k, v in retrieve_kwargs.items() if k != "embedder"}
            cache_parts.update(
                text=retrieval_text, k=retrieve_k, lang=source_lang, routing=user_query, pq=repr(pq),
                embedder=query_embedding_cache.model_identity(getattr(embedder, "embed_model", embedder)),
            )
            cache_key = answer_cache.retrieval_cache.key(cache_parts)
            cached = answer_cache.retrieval_cache.get(cache_key)
            if cached is not None:
                if isinstance(cached[4], dict):
                    cached[4].update(retrieval_cache_hit=True, retrieval_ms=0)
                return cached
            fresh = self.retriever.retrieve(
                retrieval_text,
                retrieve_k,
                preferred_language=source_lang or "",
                processed_query=pq,
                routing_query=user_query,
                **retrieve_kwargs,
            )
            if any((c or "").strip() for c in fresh[0]):
                answer_cache.retrieval_cache.put(cache_key, fresh)
            return fresh

        result = _run(base)
        attempts_ms = [(result[4] or {}).get("retrieval_ms")]
        result_count = sum(1 for c in result[0] if (c or "").strip())
        decision = retrieval_policy.should_fallback(
            result[4], retrieval_query=base, original_query=user_query, result_count=result_count
        )
        fallback_used = False
        if decision.value:
            retry = _run(user_query)
            attempts_ms.append((retry[4] or {}).get("retrieval_ms"))
            retry_count = sum(1 for c in retry[0] if (c or "").strip())
            retry_top1 = (retry[4] or {}).get("top1_similarity") or 0
            first_top1 = (result[4] or {}).get("top1_similarity") or 0
            if retry_count > result_count or (retry_count and retry_top1 > first_top1):
                result = retry
                fallback_used = True
        meta = result[4] if isinstance(result[4], dict) else {}
        if pq is not None:
            meta.update(pq.to_meta())
        meta["fallback_used"] = fallback_used
        meta["fallback_decision"] = decision.to_meta()
        meta["retrieval_attempts_ms"] = attempts_ms
        if len(attempts_ms) > 1:
            meta["retrieval_ms"] = sum(int(ms or 0) for ms in attempts_ms)
        return result[0], result[1], result[2], result[3], meta

    def _evidence_decision(
        self,
        query: str,
        contexts: List[str],
        *,
        distances: Optional[List[float]] = None,
        lang: Optional[str] = None,
    ) -> "retrieval_policy.EvidenceDecision":
        if task_requests.is_ungrounded_task(query):
            return retrieval_policy.EvidenceDecision(False, "ungrounded_task")
        legacy_lacks = self._legacy_lacks_lexical_support(query, contexts)
        if not query_processing.is_enabled():
            return retrieval_policy.EvidenceDecision(not legacy_lacks, "legacy")
        sims = retrieval_policy.similarities_from_distances(distances or [])
        return retrieval_policy.evidence_sufficient(
            query,
            contexts,
            lang=lang,
            top_similarity=sims[0] if sims else None,
            legacy_supported=not legacy_lacks,
            ignore_terms=self._SEARCH_LEXICAL_STOPWORDS,
        )

    def _verify_answer(
        self,
        answer: str,
        used_passage_indices: Optional[List[int]],
        *,
        pq: Optional[ProcessedQuery],
        retrieval_meta: Dict[str, Any],
        user_query: str,
        combined_context: str,
        passage_metadatas: Optional[List[Any]],
        regenerate: Optional[Any] = None,
        next_step: Optional[str] = None,
    ) -> Tuple[str, Optional[List[int]], bool]:
        """Risk-gated deterministic verification; returns ``(answer, used_indices, replaced)``.

        ``regenerate(extra_instruction) -> (answer, used_indices)`` is called at most once;
        otherwise (or if it still fails) unsupported sentences are redacted when safe.
        A clarifying question (``next_step == "clarify"``) makes no claims and is not checked.
        """
        if next_step == answer_next_step.KIND_CLARIFY:
            retrieval_meta["verification"] = {"checked": False, "reason": answer_next_step.KIND_CLARIFY}
            return answer, used_passage_indices, False
        reason = answer_verification.should_verify(pq, retrieval_meta, query=user_query)
        if reason is None or self._is_out_of_context_response(answer):
            retrieval_meta["verification"] = {"checked": False, "reason": reason or "low_risk"}
            return answer, used_passage_indices, False

        def _check(text: str, indices: Optional[List[int]]):
            return answer_verification.verify_answer(
                text,
                [combined_context],
                query=user_query,
                hard_source_ids=retrieval_meta.get("hard_source_ids"),
                cited_metadatas=citation_trailer.cited_metadatas(passage_metadatas, indices),
            )

        verify_start = time.perf_counter()
        result = _check(answer, used_passage_indices)
        replaced = False
        if not result.passed and result.reason == "unsupported_place":
            answer = self.OUT_OF_CONTEXT_MSG
            used_passage_indices = []
            replaced = True
            result.redacted = True
        elif not result.passed and regenerate is not None:
            try:
                new_answer, new_indices = regenerate(answer_verification.strict_instruction(result))
            except Exception as exc:
                logger.info("Answer verification: regeneration failed (%s)", exc)
                new_answer, new_indices = "", None
            if (new_answer or "").strip() and not self._is_out_of_context_response(new_answer):
                retry = _check(new_answer, new_indices)
                if retry.passed or len(retry.unsupported) < len(result.unsupported):
                    answer, used_passage_indices, replaced = new_answer, new_indices, True
                    retry.regenerated = True
                    result = retry
        if not result.passed and result.reason != "unsupported_place":
            redacted = answer_verification.redact_unsupported(answer, result)
            if redacted:
                answer, replaced, result.redacted = redacted, True, True
        meta = result.to_meta()
        meta["trigger"] = reason
        meta["ms"] = _elapsed_ms_since(verify_start)
        retrieval_meta["verification"] = meta
        return answer, used_passage_indices, replaced

    @staticmethod
    def _dedupe_chat_contexts(
        contexts: List[str], metas: List[Any], limit: int
    ) -> Tuple[List[str], List[Any]]:
        """Collapse duplicate pages/re-ingests (same URL+chunk) before LLM context.

        At most ``CHAT_MAX_CHUNKS_PER_PAGE`` chunks of one page lead; further chunks of
        that page follow the other pages, so one long overview page cannot crowd the
        specific product page out of the (character-capped) context.
        """
        seen_keys: set = set()
        identity = hybrid_fusion.ChunkIdentity()
        per_page: Dict[str, int] = {}
        lead: List[Tuple[str, Dict[str, Any]]] = []
        deferred: List[Tuple[str, Dict[str, Any]]] = []
        for i, text in enumerate(contexts):
            meta = metas[i] if i < len(metas) else {}
            meta_d = meta if isinstance(meta, dict) else {}
            key = identity.key(Retriever._query_result_dedup_key(text, meta), text)
            if key in seen_keys:
                continue
            seen_keys.add(key)
            page = Retriever._normalize_url_for_dedupe(meta_d.get("url")) or str(meta_d.get("document_id") or key)
            per_page[page] = per_page.get(page, 0) + 1
            target = lead if per_page[page] <= CHAT_MAX_CHUNKS_PER_PAGE else deferred
            target.append((text, meta_d))
        chosen = (lead + deferred)[: max(0, limit)]
        return [c for c, _m in chosen], [m for _c, m in chosen]

    def _build_prompt(
        self,
        user_query: str,
        combined_context: str,
        top_k: int,
        generate_topk: bool,
        system_prompt: Optional[str] = None,
        language_code: Optional[str] = None,
        mode: str = "search",
        format_type: str = "markdown",
        chat_history: Optional[List[Dict[str, str]]] = None,
        cite_passages: bool = False,
        source_language_hint: str = "",
        next_step_instruction: str = "",
        length_instruction: str = "",
        fixed_language: bool = False,
        preference_instruction: str = "",
    ) -> str:
        refined_instruction = ""
        refined_format = ""
        if generate_topk:
            refined_instruction = (
                f"2. Provide EXACTLY {top_k} refined answers under REFINED_ANSWERS (1-2 sentences each). "
            )
            refined_format = f"""
REFINED_ANSWERS:
List EXACTLY {top_k} answers.
"""

        from .language_config import build_language_instruction, resolve_language_name

        fixed = fixed_language or mode == "chat"
        language_instruction = build_language_instruction(language_code, fixed=fixed)

        common_stop_words = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'could', 'may', 'might', 'must', 'can', 'if', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'i', 'you', 'he', 'she', 'it',
            'we', 'they', 'what', 'when', 'where', 'why', 'how', 'who', 'which'
        }
        info_seeking_words = {
            'address', 'location', 'email', 'phone', 'contact', 'price', 'cost',
            'about', 'describe', 'explain', 'tell', 'show', 'find', 'list',
            'services', 'team', 'founder', 'ceo', 'cto', 'employees', 'staff',
        }
        query_words = user_query.strip().split()
        query_lower_words = [w.lower() for w in query_words]
        meaningful_words = [w for w in query_lower_words if w not in common_stop_words]
        single_token_entity = len(query_words) == 1 and len(meaningful_words) == 1
        has_question_words = any(w in query_lower_words for w in ('who', 'what', 'where', 'when', 'why', 'how', 'which'))
        has_info_words = any(w in info_seeking_words for w in query_lower_words)
        query_lc = user_query.strip().lower()
        asks_full_form = (
            "full form" in query_lc
            or "expand " in query_lc
            or "expansion of" in query_lc
            or "stands for" in query_lc
        )
        asks_list = (
            "list " in query_lc
            or query_lc.startswith("list")
            or "give me list" in query_lc
            or "what are the" in query_lc
        )
        looks_like_doc_name = (
            len(query_words) <= 3 and
            len(meaningful_words) >= 1 and
            len(user_query) <= 50 and
            not any(char in user_query for char in ['?', ':', ';', '!']) and
            not single_token_entity and
            not has_question_words and
            not has_info_words
        )
        doc_name_instruction = ""
        if looks_like_doc_name:
            doc_name_instruction = (
                'IMPORTANT: User asks about a document by name. '
                'Provide COMPREHENSIVE details — full content summary, all key points, sections. '
                'Do NOT give a brief answer.\n\n'
            )

        grounding = (
            "IMPORTANT: Base your ENTIRE answer on the DOCUMENTS below. "
            "If documents contain EVEN PARTIAL information relevant to the question, answer using what is available — "
            "do NOT refuse. Only refuse when documents have absolutely zero relevant content. "
            "Do not use outside knowledge. Never reveal raw sensitive personal or financial identifiers."
        )
        if mode == "chat":
            grounding = (
                grounding
                + " If a retrieved span contains a number, date, mass, duration, or proper name "
                "that answers the question, copy that span into the answer verbatim; "
                "do not paraphrase it away."
            )

        # Single authoritative format block — no duplication or conflict
        if format_type == "html_long":
            format_instructions = (
                "FORMATTING: HTML only — no Markdown, no ###, no - bullets.\n"
                "Structure (adapt to question complexity — omit sections that add no value):\n"
                "1) Opening <p>: 1–2 short sentences that directly answer. Complete sentences only — "
                "never truncate mid-thought. Wrap the single precise answer span in <mark>...</mark> "
                "(exactly one <mark> per answer; choose the span from DOCUMENTS — do not invent fixed highlight words).\n"
                "2) Optional <h2>Section Title</h2> then "
                "<ul><li><strong>Label:</strong> plain detail without any further bold</li></ul>. "
                "When DOCUMENTS support it, include enough labeled bullets to fully cover the question "
                "(several points across relevant sections) so the answer does not look truncated.\n"
                "3) Required closing <p>: exactly 1–2 short complete sentences that wrap up the answer "
                "so it feels finished and trustworthy. Natural prose only — do not hardcode openers "
                "(e.g. do not always start with Overall). No <strong> or <mark> in this closing paragraph. "
                "Do NOT use <h2>Summary</h2>, a Summary heading, or a SUMMARY: label.\n"
                "BOLD POLICY: Use <strong> ONLY for short bullet labels before a colon "
                "(e.g. <strong>Label:</strong>). Never bold words or phrases inside sentences, "
                "paragraph bodies, or bullet detail text after the colon. "
                "Section titles use <h2>, not <strong>.\n"
                "ACCURACY: Use only DOCUMENTS. Do not invent features, numbers, policies, or claims. "
                "Prefer precise source details over vague filler. If DOCUMENTS only partially answer, "
                "state what is known completely rather than cutting early.\n"
                "LENGTH: Complete and meaningful — target ~150–350 words. "
                "Do not truncate mid-sentence or omit material facts from DOCUMENTS just to stay short; "
                "prefer a complete, accurate answer within the target. No fluff, no repetition, no padding."
            )
        elif format_type == "html_short":
            format_instructions = (
                "Answer in 3-4 short sentences (80-90 words total). "
                "Be direct — no headers, no lists, no filler. Wrap in <p>...</p>."
            )
        else:
            format_instructions = (
                "FORMATTING: Markdown only — no HTML. Use ### headers, - lists, **bold** for key terms.\n"
                "VERBOSITY: Scale answer length to question complexity. "
                "Simple factual questions → 2-4 sentences. Complex questions → use headers/lists. "
                "Always finish your last sentence completely. Never stop mid-word or mid-sentence."
            )

        has_custom_system_prompt = bool(system_prompt and system_prompt.strip())
        if has_custom_system_prompt:
            ooc_instruction = (
                "If context has absolutely NO relevant information, follow the SYSTEM PROMPT fallback "
                "instruction exactly. Do not output QUERY_OUT_OF_CONTEXT."
            )
        else:
            ooc_instruction = (
                f"CRITICAL: Output exactly '{self.OUT_OF_CONTEXT_SENTINEL}' ONLY when documents contain "
                f"zero relevant content for the question. If a document about the subject of the question "
                f"has related information, answer with what is available — even partial answers are better "
                f"than refusing."
            )

        relevance_guidelines = (
            "RELEVANCE GUIDELINES:\n"
            "- Focus on information directly related to the question.\n"
            "- Treat partial name matches as valid: if the user asks about 'NITSAN tech' and documents "
            "mention 'NITSAN', that IS relevant — answer using what you found.\n"
            "- DOCUMENTS may come from several different websites or files (see each passage's source). "
            "Answer only from passages about the company, website, or subject the user asked about. "
            "Never combine facts from different websites or organisations into one answer unless the "
            "user explicitly asks to compare them, and never attribute one site's facts to another.\n"
            "- Include partial or indirect answers only when they come from passages about that subject.\n"
            "- Extract and present clearly even if buried in context.\n"
            "- NEVER begin your answer with 'The provided documents do not contain' or similar phrases "
            "when the documents DO contain partial or related information.\n"
            "- If documents only partially cover the topic, lead with what IS known, then briefly note gaps.\n"
            "- Never write inline source markers in the answer body "
            "(no '(Source 1)', '(Sources 2, 3)', '[1]', '[S1]', 'Passage 2', 'CITE:1', or similar). "
            "Sources are shown separately in the UI."
        )
        if cite_passages:
            from .citation_trailer import prompt_instruction as _citation_prompt_instruction

            ooc_instruction = f"{ooc_instruction}\n{_citation_prompt_instruction()}"
        if next_step_instruction and mode == "chat":
            ooc_instruction = f"{ooc_instruction}\n{next_step_instruction}"
        if source_language_hint:
            ooc_instruction = f"{ooc_instruction}\n{source_language_hint.strip()}"
        if preference_instruction:
            ooc_instruction = f"{ooc_instruction}\n{preference_instruction.strip()}"
        from ..source_display_policy import user_query_asks_geographic_location

        asks_geographic_location = user_query_asks_geographic_location(user_query)
        intent_answering_rules = (
            "INTENT-FIRST ANSWERING RULES:\n"
            "- Follow the user's exact intent and requested output shape.\n"
            "- Keep answers precise and concise by default; avoid filler and repetition.\n"
            "- Use only information grounded in CONVERSATION HISTORY and/or DOCUMENTS.\n"
            "- Never invent cities, addresses, phone numbers, dates, prices, or proper names.\n"
            "- Take codes, article/model numbers and prices only from a row or line for the exact "
            "variant asked about (size, side, model) in a passage whose text, title or URL names "
            "the asked product. Never use a neighbouring variant's value, and never attribute a "
            "number from a passage naming a different product or no product. "
            "If that exact variant is not listed, say so.\n"
            "- If exact information is unavailable, say so briefly using only facts that "
            "explicitly appear in the documents — do not guess from unrelated pages.\n"
            "- A general policy is not a yes for a specific place, product or service it does "
            "not name: if no passage names the specific thing asked about, say you don't have "
            "information about it.\n"
            "- When the exact detail asked about is missing, say in one short sentence that you "
            "don't have that information for the item or topic (never turn a missing detail into "
            "a yes or a no), then give the closest facts you do have about that same item or "
            "topic (with its page link if one is shown), instead of only declining. Never fill "
            "the gap with general knowledge, typical values or advice the documents do not state.\n"
            "- VOICE: You are the website's own assistant talking to a visitor. Never refer to "
            "documents, context, passages, excerpts, sources or 'the provided information' "
            "(no 'in the documents', 'based on the context', 'the documents do not mention'). "
            "When something is not covered, say it naturally in first person, e.g. "
            "\"I don't have information about delivery to the USA.\""
        )
        unmentioned_rule = grounding_guard.unmentioned_instruction(
            user_query, combined_context, language_code
        )
        if unmentioned_rule:
            intent_answering_rules = f"{intent_answering_rules}\n{unmentioned_rule}"
        intent_shape_rules = ""
        if asks_full_form:
            intent_shape_rules = (
                "OUTPUT SHAPE: User asked for a full form/expansion. "
                "Return only the expanded form in a single line. "
                "Do not add explanation unless explicitly requested."
            )
        elif asks_list:
            intent_shape_rules = (
                "OUTPUT SHAPE: User asked for a list. "
                "Return a compact list, and include at most 1-2 brief related detail bullets in total."
            )
        elif asks_geographic_location:
            intent_shape_rules = (
                "OUTPUT SHAPE: User asked where something is located. "
                "The 'EVEN PARTIAL information / do NOT refuse' rule does not apply to the place itself. "
                "State only the city/region/address that DOCUMENTS explicitly associate with that entity. "
                "If no passage states a place for that entity, say you don't have its location "
                "and stop — do not add services, offerings, or other brand facts. "
                "Do not invent a country from the name. "
                "Do not infer a city from unrelated tourism, blog, or third-party pages. "
                "Do not append Link: lines or URLs."
            )
        if query_signals.asks_comparison(user_query):
            compare_rule = (
                "COMPARISON: First give each item's relevant value (price, size, spec) on its own "
                "line, then state the conclusion (which is cheaper, larger, ...) worked out from "
                "those values. The conclusion must agree with the numbers you listed."
            )
            intent_shape_rules = f"{intent_shape_rules}\n{compare_rule}" if intent_shape_rules else compare_rule

        if mode == "chat":
            persona = system_prompt or "You are a helpful AI chatbot."
            history_block = ""
            if chat_history:
                history_lines = []
                for turn in chat_history:
                    role = "User" if turn.get("type") == "user" else "Assistant"
                    content = (turn.get("content") or "").strip()
                    if content:
                        if language_code and role == "Assistant":
                            history_lines.append(
                                f"{role} (prior reply — reuse facts only, do not copy wording/language): {content}"
                            )
                        else:
                            history_lines.append(f"{role}: {content}")
                if history_lines:
                    history_block = "CONVERSATION HISTORY (most recent last):\n" + "\n".join(history_lines) + "\n\n"

            # Chat grounding: history is a valid answer source, not just context.
            # "Documents only" grounding breaks follow-up questions answered from prior turns.
            if history_block:
                chat_grounding = (
                    "IMPORTANT: Answer the latest question using DOCUMENTS and CONVERSATION HISTORY below. "
                    "If relevant facts are already present in CONVERSATION HISTORY, reuse those facts — "
                    "but NEVER paste a prior assistant reply verbatim when a LANGUAGE is configured; "
                    "rewrite the final answer fully in that LANGUAGE. "
                    "If CONVERSATION HISTORY is about a different topic than the current question, "
                    "ignore that history and answer only from DOCUMENTS. "
                    "Do not merge unrelated prior topics into the answer. "
                    "Do not use knowledge outside of the conversation and documents. "
                    "Never reveal raw sensitive personal or financial identifiers."
                )
            else:
                chat_grounding = grounding

            latest_question_policy = (
                "Answer only the latest question (Q); earlier turns are context, never questions "
                "to answer again, and do not add items or topics from earlier turns that Q does "
                "not ask about. PRIORITY ORDER: (1) Take facts from DOCUMENTS. (2) Reuse facts "
                "from CONVERSATION HISTORY only when they are about the same item or topic as Q, "
                "and always write the final answer in the configured LANGUAGE "
                "(never paste a prior assistant reply in another language). "
            )
            if has_custom_system_prompt:
                chat_answer_policy = (
                    f"{latest_question_policy}"
                    "When neither contains anything useful, use the SYSTEM PROMPT fallback response."
                )
            else:
                chat_answer_policy = (
                    f"{latest_question_policy}"
                    f"Only output exactly {self.OUT_OF_CONTEXT_SENTINEL} when NEITHER conversation "
                    "history NOR documents contain anything useful for the question."
                )
            from ..chat_answer_links import chat_source_url_prompt_instruction

            source_url_instruction = chat_source_url_prompt_instruction()
            # Put LANGUAGE immediately before the question so it outranks history language.
            language_tail = (language_instruction or "").strip()
            if language_tail and not language_tail.endswith("\n"):
                language_tail = f"{language_tail}\n"
            # Small models continue in the question's language unless reminded at the answer.
            answer_cue = (
                f"Answer language: {resolve_language_name(language_code)}.\nA:" if language_tail else "A:"
            )
            chat_format = (
                f"{format_instructions}\n{length_instruction}" if length_instruction else format_instructions
            )
            return f"""{persona}
{chat_grounding}
{chat_format}
{relevance_guidelines}
{intent_answering_rules}
{intent_shape_rules}
{source_url_instruction}
{chat_answer_policy}
{ooc_instruction}

{history_block}DOCUMENTS:
{combined_context}

{language_tail}Q: {user_query}
{answer_cue}"""

        # Search mode
        history_block = ""
        if chat_history:
            history_lines = []
            for turn in chat_history:
                role = "User" if turn.get("type") == "user" else "Assistant"
                content = (turn.get("content") or "").strip()
                if content:
                    history_lines.append(f"{role}: {content}")
            if history_lines:
                history_block = "PREVIOUS SEARCH HISTORY (most recent last):\n" + "\n".join(history_lines) + "\n\n"
        persona_block = f"{system_prompt}\n" if system_prompt else ""
        if format_type == "html_short":
            ai_overview_style = ""
        elif format_type == "html_long":
            ai_overview_style = (
                "ANSWER STYLE: Write in AI-overview style for fast readability.\n"
                "- Start with a short direct answer (1–2 sentences) and wrap the precise answer span in <mark>.\n"
                "- Then present enough key points as concise bullets with bold labels only "
                "(cover material facts from DOCUMENTS).\n"
                "- Include practical details only when supported by DOCUMENTS; never invent.\n"
                "- Always end with 1–2 closing sentences in a final <p> (no Summary heading).\n"
                "- Prefer a complete ~150–350 word answer over a truncated one.\n"
                "- Avoid fluff, repetition, generic filler, and mid-sentence bold."
            )
        else:
            ai_overview_style = (
                "ANSWER STYLE: Write in AI-overview style for fast readability.\n"
                "- Start with a short direct answer.\n"
                "- Then present key points as concise bullets.\n"
                "- Include practical details only when supported by DOCUMENTS.\n"
                "- Avoid fluff, repetition, and generic filler."
            )
        summary_scaffold = f"""
SUMMARY:
{refined_format}""" if not format_type.startswith("html") else ""
        search_answer_cue = (
            f"Answer language: {resolve_language_name(language_code)}.\n"
            if fixed and language_instruction
            else ""
        )

        return f"""{persona_block}{doc_name_instruction}{grounding}
{relevance_guidelines}
{intent_answering_rules}
{intent_shape_rules}
{ai_overview_style}
{format_instructions}{language_instruction}
{refined_instruction}{ooc_instruction}

{history_block}DOCUMENTS:
{combined_context}

Question: {user_query}
{search_answer_cue}{summary_scaffold}
"""

    def _parse_refined_answers(self, section: str) -> List[str]:
        answers: List[str] = []
        for line in section.splitlines():
            line = line.strip()
            if not line or line.lower() in {"none", "n/a"}:
                continue
            line = re.sub(r"^Top\s+Searches\s+Found\s+\d+:\s*", "", line, flags=re.IGNORECASE)
            line = re.sub(r"^\d+[\.\)]\s*", "", line)
            line = re.sub(r"^[-•*]\s*", "", line)
            line = re.sub(r"\[\d+\]", "", line)
            line = re.sub(r"CITE:\d+", "", line, flags=re.IGNORECASE)
            line = re.sub(
                r"(?:\*\*)?\s*[(\[]\s*sources?\s*[:#]?\s*\d+(?:\s*[,;&/]\s*\d+)*\s*[)\]](?:\*\*)?",
                "",
                line,
                flags=re.IGNORECASE,
            )
            line = re.sub(r"\s+", " ", line).strip()
            # Allow emoji-only or very short lines by relaxing filters
            if len(line) < 2:
                continue
            answers.append(line)
        return answers

    def _extract_urls_from_urls_section(self, urls_section: str) -> List[str]:
        urls: List[str] = []
        for line in urls_section.splitlines():
            line = line.strip()
            if not line or line.lower() in {"none", "n/a"}:
                continue
            url_pattern = r"https?://[^\s,]+|www\.[^\s,]+"
            for u in re.findall(url_pattern, line):
                nu = normalize_url(u)
                if nu:
                    urls.append(nu)
        return urls

    @staticmethod
    def _extract_custom_ooc_reply(system_prompt: Optional[str]) -> Optional[str]:
        """Best-effort extraction of explicit out-of-context reply from system prompt."""
        if not system_prompt:
            return None
        patterns = [
            r"respond\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
            r"reply\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
            r"respond\s+with:\s*['\"]([^'\"]+)['\"]",
        ]
        for pattern in patterns:
            match = re.search(pattern, system_prompt, flags=re.IGNORECASE)
            if match:
                return match.group(1).strip()
        return None

    @staticmethod
    def _resolve_custom_ooc_message(prompt: str) -> str:
        """Return plain text as-is; extract quoted text from respond-with patterns."""
        if not prompt:
            return RAG.OUT_OF_CONTEXT_MSG
        patterns = [
            r"respond\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
            r"reply\s+exactly\s+with:\s*['\"]([^'\"]+)['\"]",
            r"respond\s+with:\s*['\"]([^'\"]+)['\"]",
        ]
        for p in patterns:
            m = re.search(p, prompt, flags=re.IGNORECASE)
            if m:
                return m.group(1).strip()
        return prompt

    @staticmethod
    def _is_llm_no_answer_response(text: str) -> bool:
        """Return True if text is an LLM uncertainty / no-answer response."""
        if not text:
            return False
        for pattern in RAG._LLM_UNCERTAINTY_PATTERNS:
            if re.search(pattern, text, re.IGNORECASE):
                return True
        return False

    @staticmethod
    def apply_custom_no_answer_message(answer: str, custom_ooc_fallback: Optional[str] = None) -> str:
        """Replace LLM uncertainty response with custom OOC message if configured."""
        if not RAG._is_llm_no_answer_response(answer):
            return answer
        if custom_ooc_fallback:
            return RAG._resolve_custom_ooc_message(custom_ooc_fallback)
        return RAG.OUT_OF_CONTEXT_MSG

    @staticmethod
    def _out_of_context_user_message(custom: Optional[str] = None) -> str:
        """Return custom OOC message (resolved) or default OUT_OF_CONTEXT_MSG."""
        if custom:
            return RAG._resolve_custom_ooc_message(custom)
        return RAG.OUT_OF_CONTEXT_MSG

    MAX_TOP_K = 20
    
    # ---------- public query ----------
    def query(
        self,
        user_query: str,
        top_k: int = DEFAULT_TOP_K,
        max_tokens: Optional[int] = None,
        generate_topk: bool = False,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        language_code: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        use_reranker: Optional[bool] = None,
        mode: str = "search",
        format_type: str = "markdown",
        enable_keyword_fallback: bool = True,
        semantic_confidence_floor: Optional[float] = None,
        keyword_score_floor: Optional[float] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        embedder: Optional["EmbedData"] = None,
        collection_name: Optional[str] = None,
        use_cache: bool = True,
        processed_query: Optional[ProcessedQuery] = None,
        fixed_language: bool = False,
        item_context: Optional[Any] = None,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
    ) -> Dict[str, Any]:
        start_time_all = time.time()
        source_lang = language_preference.preferred_language(user_query, language_code)
        cache_variant = f"|srclang:v1:{source_lang or '-'}"
        if fixed_language:
            cache_variant += "|langfix"
        if system_prompt:
            cache_variant += f"|sp:{hashlib.sha256(system_prompt.strip().encode()).hexdigest()}"
        if llm_config:
            try:
                llm_cfg_str = json.dumps(llm_config, sort_keys=True, default=str)
            except Exception:
                llm_cfg_str = str(llm_config)
            cache_variant += f"|llm:{hashlib.sha256(llm_cfg_str.encode()).hexdigest()}"
        shaping = answer_cache.variant(processed_query, item_context, {
            "mode": mode, "threshold": similarity_threshold, "rerank": use_reranker,
            "keyword_fallback": enable_keyword_fallback, "semantic_floor": semantic_confidence_floor,
            "keyword_floor": keyword_score_floor, "language": language_code,
            "keyword_blend": keyword_blend,
        }, chat_history)
        use_cache = use_cache and shaping is not None
        cache_variant += shaping or ""
        redis_key, local_key = self._make_cache_keys(
            f"{user_query}{cache_variant}",
            top_k,
            max_tokens,
            generate_topk,
            user_id=user_id,
            project_id=project_id,
            collection_name=collection_name,
            format_type=format_type,
        )
        if not use_cache:
            redis_key = None

        cached = self._get_cached(redis_key, local_key) if use_cache else None
        if cached:
            _sim_floor = display_sources_min_chunk_similarity_pct()
            if _sim_floor > 0 and not _rag_cache_aligned_with_chunk_similarity(cached):
                logger.info(
                    "RAG query cache bypassed: DISPLAY_SOURCES_MIN_CHUNK_SIMILARITY_PCT=%s "
                    "requires aligned raw_chunk_similarity_pct with raw_contexts",
                    _sim_floor,
                )
            else:
                return cached

        if self._is_sensitive_query(item_answers.outside_item_names(item_context, user_query)):
            logger.info("Privacy guard: blocked sensitive extraction query")
            result = {
                "summary": self.PRIVACY_BLOCK_MSG,
                "top_k": {},
                "raw_contexts": [],
                "raw_contexts_metadatas": [],
                "raw_chunk_similarity_pct": [],
                "chunk_metadatas": [],
                "urls": [],
                "retrieval_meta": {
                    "tier_used": 0,
                    "confidence_score": 0,
                    "top1_similarity": 0,
                    "top3_mean_similarity": 0,
                    "lexical_overlap": 0,
                    "fallback_reason": "privacy_guard_blocked",
                },
            }
            result["stage_timings_ms"] = _build_stage_timings_ms(
                start_wall=start_time_all,
                retrieval_meta=result.get("retrieval_meta"),
            )
            return result

        if mode == "chat":
            # Use configured top_k for chat; never force to 1 (causes low-quality grounding)
            retrieve_k = max(top_k, 3)
        else:
            # Search mode: bounded expansion to control latency and preserve quality.
            if similarity_threshold is None:
                multiplier = 2 if top_k > 10 else 2
                retrieve_k = min(max(int(top_k * multiplier), top_k + 5), 20)
            else:
                multiplier = 3 if top_k > 10 else 2
                retrieve_k = min(max(int(top_k * multiplier), top_k + 8), 25)

        pq = self._resolve_processed_query(user_query, processed_query, source_lang)
        retrieved_contexts, retrieved_doc_ids, raw_contexts_metadatas, retrieved_distances, retrieval_meta = self._retrieve_for_query(
            user_query, pq, retrieve_k, source_lang,
            user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold,
            enable_keyword_fallback=enable_keyword_fallback,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            use_reranker=use_reranker,
            embedder=embedder,
            collection_name=collection_name,
            record_documents=item_answers.record_requests(item_context),
            rerank_candidates=rerank_candidates,
            keyword_blend=keyword_blend,
        )
        logger.info(f"⏱️ Retrieval took: {time.time() - start_time_all:.4f}s")
        non_empty_contexts = [c for c in retrieved_contexts if c.strip()]
        raw_contexts = non_empty_contexts.copy()
        non_empty_contexts = [self._redact_sensitive_text(c) for c in non_empty_contexts]
        raw_contexts = [self._redact_sensitive_text(c) for c in raw_contexts]
        
        # Log retrieval results for debugging
        logger.info(
            f"Retrieved {len(non_empty_contexts)} contexts for query '{user_query[:50]}...' "
            f"(requested {retrieve_k}, similarity_threshold={similarity_threshold})"
        )
        # Filter metadata to match non_empty_contexts
        raw_contexts_metadatas_filtered = []
        filtered_doc_ids = []
        filtered_distances = []
        for i, ctx in enumerate(retrieved_contexts):
            if ctx.strip():
                raw_contexts_metadatas_filtered.append(raw_contexts_metadatas[i] if i < len(raw_contexts_metadatas) else None)
                filtered_doc_ids.append(retrieved_doc_ids[i] if i < len(retrieved_doc_ids) else "unknown")
                filtered_distances.append(retrieved_distances[i] if i < len(retrieved_distances) else 1.0)

        # Use absolute (not normalized) scores so the display floor filters by real cosine similarity.
        raw_chunk_similarity_pct, _normalized_chunk_pct = chunk_relevance_pcts_from_distances(filtered_distances)

        # STRICT CONTEXT-ONLY POLICY:
        # Use retrieved contexts as primary signal to avoid false "no docs" results
        # when filtered count hits backend limits.
        if not non_empty_contexts and not item_answers.informs_answer(item_context):
            fallback_reason = (retrieval_meta.get("fallback_reason") or "").lower()
            summary_msg = (
                "The system is taking longer than expected. Please try again in a moment."
                if "timeout" in fallback_reason
                else self.OUT_OF_CONTEXT_MSG
            )
            result = {
                "summary": summary_msg,
                "top_k": {},
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                "chunk_metadatas": [],
                "urls": [],
                "retrieval_meta": retrieval_meta,
                "stage_timings_ms": _build_stage_timings_ms(
                    start_wall=start_time_all,
                    retrieval_meta=retrieval_meta,
                ),
            }
            self._set_cached(redis_key, local_key, result)
            return result

        # Fail-fast: when retrieved chunks share no distinctive query terms,
        # the LLM almost always emits QUERY_OUT_OF_CONTEXT after 10–30s.
        # Skip LLM for both search and chat (custom OOC from system prompt still applied).
        evidence = self._evidence_decision(
            user_query, non_empty_contexts, distances=filtered_distances, lang=source_lang
        )
        retrieval_meta["evidence_decision"] = evidence.to_meta()
        if mode in ("search", "chat") and not evidence.sufficient and not item_answers.informs_answer(item_context):
            summary_msg = (
                self._extract_custom_ooc_reply(system_prompt)
                if system_prompt
                else None
            ) or self.OUT_OF_CONTEXT_MSG
            logger.info("%s query: skipping LLM (no lexical support)", mode.capitalize())
            result = {
                "summary": summary_msg,
                "top_k": {},
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                "chunk_metadatas": [],
                "urls": [],
                "retrieval_meta": retrieval_meta,
                "stage_timings_ms": _build_stage_timings_ms(
                    start_wall=start_time_all,
                    retrieval_meta=retrieval_meta,
                    llm_generation_ms=0,
                ),
            }
            self._set_cached(redis_key, local_key, result)
            return result

        unique_doc_ids = list(dict.fromkeys(filtered_doc_ids))
        doc_id_to_index = {doc_id: i + 1 for i, doc_id in enumerate(unique_doc_ids)}

        contexts = []
        is_search_mode = (mode == "search")

        if not generate_topk:
            if is_search_mode:
                from .context_limit_config import llm_context_chunk_limit

                MAX_CONTEXTS_FOR_LLM = llm_context_chunk_limit(top_k)
                # Score by lexical overlap with query terms and dedupe aggressively.
                # This keeps search prompts focused on relevant context.
                query_terms = set(self.retriever._extract_keywords(user_query))
                scored_contexts: List[Tuple[float, int, str]] = []
                for i, ctx in enumerate(non_empty_contexts):
                    text = (ctx or "").strip()
                    if not text:
                        continue
                    lowered = text.lower()
                    overlap = sum(1 for t in query_terms if t in lowered)
                    dist_score = 0.0
                    if i < len(filtered_distances):
                        dist_score = max(0.0, 1.0 - filtered_distances[i])
                    # Prioritize lexical match, then semantic score.
                    score = (overlap * 2.0) + dist_score
                    scored_contexts.append((score, i, text))

                scored_contexts.sort(key=lambda x: x[0], reverse=True)
                seen_norm: set = set()
                contexts_to_use = []
                contexts_meta_to_use: List[Any] = []
                for _, idx, text in scored_contexts:
                    norm = re.sub(r"[\W_]+", " ", text.lower())
                    norm = re.sub(r"\s+", " ", norm).strip()[:280]
                    if norm in seen_norm:
                        continue
                    seen_norm.add(norm)
                    contexts_to_use.append(text)
                    contexts_meta_to_use.append(
                        raw_contexts_metadatas_filtered[idx]
                        if idx < len(raw_contexts_metadatas_filtered)
                        else {}
                    )
                    if len(contexts_to_use) >= MAX_CONTEXTS_FOR_LLM:
                        break
                if len(non_empty_contexts) > MAX_CONTEXTS_FOR_LLM:
                    logger.info(f"⚡ SPEED: Limiting LLM contexts to {len(contexts_to_use)} unique (cap {MAX_CONTEXTS_FOR_LLM}) for search mode")
            else:
                from .context_limit_config import llm_context_chunk_limit

                context_limit = llm_context_chunk_limit(top_k)
                contexts_to_use, contexts_meta_to_use = self._dedupe_chat_contexts(
                    non_empty_contexts, raw_contexts_metadatas_filtered, context_limit
                )
                if len(non_empty_contexts) > len(contexts_to_use):
                    logger.info(
                        f"📚 CONTEXT: Deduped chat LLM contexts to {len(contexts_to_use)} "
                        f"(from {len(non_empty_contexts)}, cap {context_limit}, top_k={top_k})"
                    )
            # Label passages [S1..Sn] so the model can report which ones it used.
            from ..chat_answer_links import source_url_line_for_context

            contexts = citation_trailer.label_passages(
                contexts_to_use, contexts_meta_to_use, source_url_line_for_context
            )
        else:
            from .context_limit_config import llm_context_chunk_limit

            context_limit = llm_context_chunk_limit(top_k)
            contexts_to_use = list(zip(non_empty_contexts, filtered_doc_ids, filtered_distances))[:context_limit]
            for idx, (ctx, doc_id, dist) in enumerate(contexts_to_use, 1):
                doc_idx = doc_id_to_index.get(doc_id, idx)
                score = max(0.0, 1.0 - dist)
                contexts.append(
                    f"[Document {doc_idx} (ID: {doc_id[:8]}...) - Relevance: {score:.2f} | CITE:{idx}]\n{ctx}"
                )

        # Chunk-aware truncation — never cut mid-chunk
        MAX_CONTEXT_CHARS = _env_int("RAG_MAX_CONTEXT_CHARS", 8000)
        total_chars = 0
        final_contexts = []
        for ctx in contexts:
            if total_chars + len(ctx) > MAX_CONTEXT_CHARS:
                break
            final_contexts.append(ctx)
            total_chars += len(ctx)
        if len(final_contexts) < len(contexts):
            logger.info(f"📚 CONTEXT: Kept {len(final_contexts)}/{len(contexts)} chunks within {MAX_CONTEXT_CHARS} char limit")
        combined_context = "\n\n".join(final_contexts) if final_contexts else "\n\n".join(contexts[:3])
        
        context_metadatas = (
            contexts_meta_to_use if (not generate_topk and "contexts_meta_to_use" in locals()) else raw_contexts_metadatas_filtered
        )
        cite_passages = not generate_topk
        llm_passage_metadatas: Optional[List[Any]] = (
            list(contexts_meta_to_use[: len(final_contexts) or min(3, len(contexts))])
            if cite_passages
            else None
        )
        used_passage_indices: Optional[List[int]] = None
        combined_context = item_answers.context_with_records(
            item_context, combined_context, llm_passage_metadatas
        )

        # Determine max_tokens: html_long needs more budget
        if max_tokens:
            max_tokens_val = max_tokens
        elif format_type == "html_long":
            max_tokens_val = 1200
        elif is_search_mode:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        else:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        completion_applies = answer_completion.applies(mode, format_type)
        provider_max_tokens = (
            answer_completion.hard_cap(max_tokens_val) if completion_applies else max_tokens_val
        )

        prompt = self._build_prompt(
            user_query, combined_context, top_k, generate_topk,
            system_prompt=system_prompt, language_code=language_code,
            mode=mode, format_type=format_type,
            chat_history=chat_history,
            cite_passages=cite_passages,
            source_language_hint=language_preference.mixed_language_hint(
                final_contexts, list(context_metadatas or [])[: len(final_contexts)], source_lang
            ),
            next_step_instruction=answer_next_step.chat_instruction(mode, pq),
            length_instruction=answer_completion.chat_instruction(mode, format_type, max_tokens_val),
            fixed_language=fixed_language,
            preference_instruction=feedback_memory_hook.preference_instruction(retrieval_meta),
        )

        logger.info(f"⏱️ Context prep took: {time.time() - start_time_all:.4f}s")
        start_time_llm = time.time()
        token_usage = None
        llm_generation_ms: Optional[int] = None
        llm_response = None

        logger.info(
            f"{'🔍 SEARCH' if is_search_mode else '💬 CHAT'}: Using {max_tokens_val} max_tokens "
            f"(provider cap {provider_max_tokens}, format_type={format_type})"
        )
        llm_kwargs = {"max_tokens": provider_max_tokens}
        closing_llm_kwargs: Dict[str, Any] = llm_kwargs
        provider: Optional[str] = None
        chat_model: Optional[str] = None
        # Always bind before the try so except / OOC recovery never hit UnboundLocalError.
        # Previously `llm` was only assigned inside the llm_config branch, so the default
        # self.llm path (and any failure before get_llm) crashed on fallback with:
        # "cannot access local variable 'llm' where it is not associated with a value".
        llm = self.llm

        try:
            # Determine LLM to use
            if llm_config:
                provider = llm_config.get("provider", "customllm").lower()
                # Use appropriate default model based on provider
                default_model = "gpt-oss:120b-cloud" if "custom" in provider or "ollama" in provider else "gpt-4"
                # Accept both chat_model (chat UI) and model (legacy / external callers)
                chat_model = (
                    llm_config.get("chat_model")
                    or llm_config.get("model")
                    or default_model
                )
                api_key = llm_config.get("api_key")
                endpoint = llm_config.get("endpoint")
                
                # Normalize provider for logic check
                if "google" in provider or "gemini" in provider:
                    provider = "gemini"
                
                # Dynamic LLM instantiation
                llm = LLMFactory.get_llm(
                    provider,
                    chat_model,
                    api_key,
                    allow_ollama_fallback=self._llm_allow_ollama_fallback(provider),
                    endpoint=endpoint,

                    api_version=llm_config.get("api_version"),
                )
                
                # SPEED OPTIMIZATION: Build generation parameters
                # For chat mode (generate_topk=False), FORCE best_of=1 or None to avoid 3x slowdown
                # Extract and convert generation parameters
                temperature = None
                if llm_config.get("temperature") is not None:
                    try:
                        temperature = float(llm_config.get("temperature"))
                    except (ValueError, TypeError):
                        pass
                
                top_p = None
                if llm_config.get("top_p") is not None:
                    try:
                        top_p = float(llm_config.get("top_p"))
                    except (ValueError, TypeError):
                        pass
                
                # CRITICAL: Disable best_of for chat mode to avoid 3x slowdown
                # best_of generates N responses and picks best - too slow for chat!
                best_of = None
                user_best_of = llm_config.get("best_of")
                if not generate_topk and user_best_of:  # Chat mode: disable best_of
                    logger.info(f"⚡ SPEED: Disabled best_of={user_best_of} for chat mode (would cause {user_best_of}x slowdown)")
                elif generate_topk and user_best_of:  # Search mode: allow best_of
                    try:
                        best_of = int(user_best_of)
                    except (ValueError, TypeError):
                        pass
                
                frequency_penalty = None
                if llm_config.get("frequency_penalty") is not None:
                    try:
                        frequency_penalty = float(llm_config.get("frequency_penalty"))
                    except (ValueError, TypeError):
                        pass
                
                presence_penalty = None
                if llm_config.get("presence_penalty") is not None:
                    try:
                        presence_penalty = float(llm_config.get("presence_penalty"))
                    except (ValueError, TypeError):
                        pass
                
                # Provider-specific parameter handling
                if provider == "gemini":
                    # Gemini expects generation parameters inside generation_config
                    from llama_index.llms.gemini import Gemini
                    
                    gemini_kwargs = {"generation_config": {"max_output_tokens": provider_max_tokens}}
                    if temperature is not None:
                        gemini_kwargs["generation_config"]["temperature"] = temperature
                    if top_p is not None:
                        gemini_kwargs["generation_config"]["top_p"] = top_p
                    closing_llm_kwargs = gemini_kwargs

                    llm_response = self._complete_with_transient_retry(
                        llm,
                        prompt,
                        provider=provider,
                        kwargs=gemini_kwargs,
                    )
                else:
                    # Standard providers (Ollama, OpenAI, etc.) - pass all parameters
                    if temperature is not None:
                        llm_kwargs["temperature"] = temperature
                    if top_p is not None:
                        llm_kwargs["top_p"] = top_p
                    # Skip best_of for chat mode (it causes 3x slowdown)
                    # if best_of is not None and best_of > 1:
                    #     llm_kwargs["best_of"] = best_of  # Disabled for speed
                    if frequency_penalty is not None:
                        llm_kwargs["frequency_penalty"] = frequency_penalty
                    if presence_penalty is not None:
                        llm_kwargs["presence_penalty"] = presence_penalty
                    
                    llm_response = self._complete_with_transient_retry(
                        llm,
                        prompt,
                        provider=provider,
                        kwargs=llm_kwargs,
                    )
            else:
                # Default behavior (Ollama) - no extra parameters
                llm = self.llm
                llm_response = llm.complete(prompt, **llm_kwargs)
                
            raw_response = getattr(llm_response, "text", "") or ""
            llm_generation_ms = max(0, int((time.time() - start_time_llm) * 1000))
            logger.info(f"⏱️ LLM generation took: {time.time() - start_time_llm:.4f}s")
            if settings.debug:
                logger.debug(f"🔍 Raw LLM Response: {raw_response[:500]}...")  # only in debug mode
            logger.info(f"⏱️ Total RAG time: {time.time() - start_time_all:.4f}s")

            # Extract token usage per provider
            token_usage = {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}
            try:
                raw = getattr(llm_response, "raw", None)
                # Normalize: some providers return object, convert to dict
                if raw and not isinstance(raw, dict):
                    try:
                        raw = dict(raw)
                    except Exception:
                        try:
                            raw = vars(raw)
                        except Exception:
                            raw = {}
                raw = raw or {}

                # OpenAI / Mistral / Anthropic shape: {"usage": {...}}
                usage = raw.get("usage") or {}
                if not isinstance(usage, dict):
                    try:
                        usage = vars(usage)
                    except Exception:
                        usage = {}
                if usage:
                    pt = usage.get("prompt_tokens") or usage.get("input_tokens")
                    ct = usage.get("completion_tokens") or usage.get("output_tokens")
                    tt = usage.get("total_tokens") or (((pt or 0) + (ct or 0)) or None)
                    token_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}

                # Gemini shape: {"usage_metadata": {...}}
                if not any(token_usage.values()):
                    um = raw.get("usage_metadata") or {}
                    if not isinstance(um, dict):
                        try:
                            um = vars(um)
                        except Exception:
                            um = {}
                    if um:
                        pt = um.get("prompt_token_count")
                        ct = um.get("candidates_token_count")
                        tt = um.get("total_token_count")
                        token_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}

                logger.info(f"💰 Token usage: {token_usage}")
            except Exception as e:
                logger.warning(f"Failed to extract token usage: {e}")
        except Exception as e:
            logger.error(
                f"LLM FAILED to complete query. Error: {e}"
            )
            summary_text = self._fallback_answer_after_llm_failure(
                user_query=user_query,
                non_empty_contexts=non_empty_contexts,
                retrieval_meta=retrieval_meta,
                mode=mode,
                format_type=format_type,
                max_tokens=max_tokens,
                exc=e,
                llm=llm,
                language_code=language_code,
                llm_kwargs=llm_kwargs,
                provider=provider,
                model=chat_model,
            )
            result = {
                "summary": summary_text,
                "top_k": {},
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                "chunk_metadatas": [],
                "urls": [],
                "retrieval_meta": retrieval_meta,
                "stage_timings_ms": _build_stage_timings_ms(
                    start_wall=start_time_all,
                    retrieval_meta=retrieval_meta,
                    llm_generation_ms=max(0, int((time.time() - start_time_llm) * 1000)),
                ),
                "llm_failed": True,
            }
            self._set_cached(redis_key, local_key, result)
            return result

        # ----- parse LLM output -----
        next_step_kind: Optional[str] = None
        if mode == "chat":
            raw_response, next_step_kind = answer_next_step.split_next_step(raw_response)
        if cite_passages:
            raw_response, used_passage_indices = citation_trailer.parse_and_strip(raw_response)
            if not raw_response.strip() and used_passage_indices == []:
                raw_response = self.OUT_OF_CONTEXT_SENTINEL
        out_of_context_detected = self._is_out_of_context_response(raw_response)
        item_override = item_answers.guard_answer(
            item_context, raw_response, llm_passage_metadatas,
            refused=out_of_context_detected, retrieval_meta=retrieval_meta,
        ) if out_of_context_detected else None
        if item_override is not None:
            next_step_kind = None
            summary_text, used_passage_indices = item_override
            refined_answers = []
            urls_from_llm = []
        elif out_of_context_detected:
            next_step_kind = None
            summary_text = ""
            if mode in ("search", "chat") and not self._search_lacks_lexical_support(
                user_query, non_empty_contexts
            ):
                summary_text = self._complete_ooc_recovery(
                    llm,
                    user_query,
                    non_empty_contexts,
                    format_type=format_type,
                    language_code=language_code,
                    max_tokens=max_tokens,
                    llm_kwargs=llm_kwargs,
                )
            if not summary_text:
                summary_text = self._resolve_ooc_answer(
                    raw_response,
                    user_query=user_query,
                    non_empty_contexts=non_empty_contexts,
                    retrieval_meta=retrieval_meta,
                    mode=mode,
                    format_type=format_type,
                    system_prompt=system_prompt,
                    max_tokens=max_tokens,
                )
            # Recovery answers come from unlabelled contexts — let source heuristics decide.
            if cite_passages:
                used_passage_indices = [] if self._is_out_of_context_response(summary_text) else None
            refined_answers: List[str] = []
            urls_from_llm: List[str] = []
        else:
            summary_section = self._extract_section(
                raw_response, "SUMMARY:", ["REFINED_ANSWERS", "RELEVANT_URLS"]
            )
            summary_text = self._clean_response_text(summary_section, format_type=format_type)
            if not summary_text.strip():
                summary_text = self._clean_response_text(raw_response, format_type=format_type)
            if completion_applies and answer_completion.was_truncated(
                getattr(llm_response, "raw", None),
                (token_usage or {}).get("completion_tokens"),
                provider_max_tokens,
            ):
                completion_start = time.perf_counter()
                summary_text, retrieval_meta["answer_completion"] = answer_completion.complete_truncated(
                    summary_text,
                    llm=llm,
                    user_query=user_query,
                    llm_kwargs=closing_llm_kwargs,
                )
                retrieval_meta["answer_completion_ms"] = _elapsed_ms_since(completion_start)

            refined_section = (
                self._extract_section(
                    raw_response, "REFINED_ANSWERS", ["RELEVANT_URLS"]
                )
                if generate_topk
                else ""
            )
            refined_answers = (
                self._parse_refined_answers(refined_section) if refined_section else []
            )

            urls_section = self._extract_section(
                raw_response, "RELEVANT_URLS", []
            )
            urls_from_llm = (
                self._extract_urls_from_urls_section(urls_section)
                if urls_section
                else []
            )

            regen_step: Dict[str, Optional[str]] = {}

            def _regenerate(extra_instruction: str):
                regen = getattr(llm.complete(prompt + extra_instruction, **llm_kwargs), "text", "") or ""
                regen_indices: Optional[List[int]] = None
                regen, regen_step["kind"] = answer_next_step.split_next_step(regen)
                if cite_passages:
                    regen, regen_indices = citation_trailer.parse_and_strip(regen)
                regen_summary = self._extract_section(
                    regen, "SUMMARY:", ["REFINED_ANSWERS", "RELEVANT_URLS"]
                ) or regen
                return self._clean_response_text(regen_summary, format_type=format_type), regen_indices

            summary_text, used_passage_indices, _verified_replaced = self._verify_answer(
                summary_text,
                used_passage_indices,
                pq=pq,
                retrieval_meta=retrieval_meta,
                user_query=user_query,
                combined_context=combined_context,
                passage_metadatas=llm_passage_metadatas,
                regenerate=_regenerate,
                next_step=next_step_kind,
            )
            if (retrieval_meta.get("verification") or {}).get("regenerated"):
                next_step_kind = regen_step.get("kind")
            item_override = item_answers.guard_answer(
                item_context, summary_text, llm_passage_metadatas,
                refused=self._is_out_of_context_response(summary_text), retrieval_meta=retrieval_meta,
            )
            if item_override is not None:
                summary_text, used_passage_indices = item_override
                next_step_kind = None
            else:
                summary_text = item_answers.complete_answer(item_context, summary_text)
            answer_next_step.finalize_meta(retrieval_meta, next_step_kind, summary_text, mode=mode)

        # ----- align refined answers with URLs/metadata -----
        # Process more refined_answers initially to account for deduplication
        # Use top_k * 5 to ensure we have enough unique results after deduplication
        max_refined = min(len(refined_answers), top_k * 5)
        cleaned_answers = refined_answers[:max_refined]
        chunk_urls: List[str] = []
        chunk_metadatas: List[Optional[Dict[str, Any]]] = []

        for i in range(len(cleaned_answers)):
            meta = context_metadatas[i] if i < len(context_metadatas) else None
            if meta:
                url = normalize_url(meta.get("url", "") or "")
            else:
                url = ""
            if not url and i < len(urls_from_llm):
                url = urls_from_llm[i]
            chunk_urls.append(url)
            chunk_metadatas.append(meta)

        # Deduplicate by URL+title combination - but keep processing until we have top_k unique results
        dedup_answers: List[str] = []
        dedup_urls: List[str] = []
        dedup_meta: List[Optional[Dict[str, Any]]] = []
        seen_url_title_combos: set = set()  # Track URL+title combinations to prevent duplicates

        # Process all cleaned_answers to find enough unique results (don't stop early)
        for ans, url, meta in zip(cleaned_answers, chunk_urls, chunk_metadatas):
            if len(dedup_answers) >= top_k:
                break
                
            norm_url = url.rstrip("/").lower() if url else ""
            norm_title = ""
            if meta:
                norm_title = (meta.get("title", "") or "").lower().strip()
            
            # Create a unique key from URL+title combination
            # This prevents the same URL+title from appearing multiple times
            url_title_key = f"{norm_url}|{norm_title}" if (norm_url or norm_title) else f"no_meta_{len(dedup_answers)}"
            
            # Check for duplicates by URL+title combination
            is_duplicate = False
            if url_title_key in seen_url_title_combos:
                is_duplicate = True
            
            if is_duplicate:
                continue
                
            dedup_answers.append(ans)
            dedup_urls.append(url)
            dedup_meta.append(meta)
            seen_url_title_combos.add(url_title_key)

        # Fill from raw_contexts/snippets if we still don't have enough
        # Continue deduplication when filling to avoid duplicates
        if len(dedup_answers) < top_k:
            for idx, ctx in enumerate(raw_contexts):
                if len(dedup_answers) >= top_k:
                    break
                    
                # Use raw_contexts_metadatas_filtered which is aligned with raw_contexts
                meta = raw_contexts_metadatas_filtered[idx] if idx < len(raw_contexts_metadatas_filtered) else None
                url = normalize_url(meta.get("url", "") or "") if meta else ""
                
                # Check for duplicates using URL+title combination
                norm_url = url.rstrip("/").lower() if url else ""
                norm_title = (meta.get("title", "") or "").lower().strip() if meta else ""
                url_title_key = f"{norm_url}|{norm_title}" if (norm_url or norm_title) else f"no_meta_fill_{idx}"
                
                if url_title_key in seen_url_title_combos:
                    continue  # Skip duplicate URL+title combinations
                
                snippet = self._extract_meaningful_snippet(
                    ctx, user_query, max_length=350
                )
                if not snippet:
                    continue
                    
                dedup_answers.append(snippet)
                dedup_meta.append(meta)
                dedup_urls.append(url)
                seen_url_title_combos.add(url_title_key)

        # Return all unique results found (up to top_k, but return all if we have fewer)
        # This ensures the search endpoint has all available unique results to work with
        num_results = min(len(dedup_answers), top_k)
        top_k_dict = {
            f"Top Searches Found {i + 1}": ans
            for i, ans in enumerate(dedup_answers[:num_results])
        }

        result = {
            "summary": summary_text,
            "top_k": top_k_dict,
            "raw_contexts": raw_contexts,
            "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
            "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
            "urls": dedup_urls[:num_results],
            "chunk_metadatas": dedup_meta[:num_results],
            "llm_passage_metadatas": llm_passage_metadatas,
            "used_passage_indices": used_passage_indices,
            "retrieval_meta": retrieval_meta,
            "token_usage": token_usage,
            "stage_timings_ms": _build_stage_timings_ms(
                start_wall=start_time_all,
                retrieval_meta=retrieval_meta,
                llm_generation_ms=llm_generation_ms,
            ),
        }

        self._set_cached(redis_key, local_key, result)
        return result

    async def chat_query_async(self, query: str, stream: bool = True):
        if self.llm is None:
            raise RuntimeError("LLM client not initialized")
        res = await asyncio.to_thread(
            self.query, query, top_k=self.retriever.default_top_k, generate_topk=False
        )
        return res["summary"]

    def stream_query(
        self,
        user_query: str,
        top_k: int = DEFAULT_TOP_K,
        max_tokens: Optional[int] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        language_code: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        use_reranker: Optional[bool] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        semantic_confidence_floor: Optional[float] = None,
        keyword_score_floor: Optional[float] = None,
        embedder: Optional["EmbedData"] = None,
        collection_name: Optional[str] = None,
        mode: str = "chat",
        format_type: str = "markdown",
        enable_keyword_fallback: bool = True,
        use_cache: bool = True,
        processed_query: Optional[ProcessedQuery] = None,
        fixed_language: bool = False,
        item_context: Optional[Any] = None,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
    ):
        """
        Generator that yields (chunk_text, meta_dict) tuples.
        meta_dict is non-None only on the final sentinel chunk (done=True).
        Retrieval happens up-front; then tokens stream from the LLM.
        """
        start_time_all = time.time()

        source_lang = language_preference.preferred_language(user_query, language_code)
        cache_variant = f"|srclang:v1:{source_lang or '-'}"
        if fixed_language:
            cache_variant += "|langfix"
        if system_prompt:
            cache_variant += f"|sp:{hashlib.sha256(system_prompt.strip().encode()).hexdigest()}"
        if llm_config:
            try:
                llm_cfg_str = json.dumps(llm_config, sort_keys=True, default=str)
            except Exception:
                llm_cfg_str = str(llm_config)
            cache_variant += f"|llm:{hashlib.sha256(llm_cfg_str.encode()).hexdigest()}"
        if chat_history:
            try:
                hist_str = json.dumps(chat_history[-4:], sort_keys=True, default=str)
            except Exception:
                hist_str = str(chat_history[-4:])
            cache_variant += f"|hist:{hashlib.sha256(hist_str.encode()).hexdigest()}"
        shaping = answer_cache.variant(processed_query, item_context, {
            "mode": mode, "threshold": similarity_threshold, "rerank": use_reranker,
            "keyword_fallback": enable_keyword_fallback, "semantic_floor": semantic_confidence_floor,
            "keyword_floor": keyword_score_floor, "language": language_code,
            "keyword_blend": keyword_blend,
        }, chat_history)
        use_cache = use_cache and shaping is not None
        cache_variant += shaping or ""
        redis_key, local_key = self._make_cache_keys(
            f"stream:{user_query}{cache_variant}",
            top_k,
            max_tokens,
            False,
            user_id=user_id,
            project_id=project_id,
            collection_name=collection_name,
            format_type=format_type,
        )
        if not use_cache:
            redis_key = None
        cached = self._get_cached(redis_key, local_key) if use_cache else None
        if cached and isinstance(cached, dict) and (cached.get("summary") or "").strip():
            summary = cached["summary"]
            yield (summary, None)
            yield (
                "",
                {
                    "done": True,
                    "retrieval_meta": cached.get("retrieval_meta") or {},
                    "token_usage": cached.get("token_usage"),
                    "raw_contexts": cached.get("raw_contexts") or [],
                    "raw_contexts_metadatas": cached.get("raw_contexts_metadatas") or [],
                    "raw_chunk_similarity_pct": cached.get("raw_chunk_similarity_pct") or [],
                    "full_text": summary,
                    "stage_timings_ms": _build_stage_timings_ms(
                        start_wall=start_time_all,
                        retrieval_meta=cached.get("retrieval_meta"),
                        llm_generation_ms=0,
                        streaming_ms=0,
                    ),
                    "from_cache": True,
                    "llm_passage_metadatas": cached.get("llm_passage_metadatas"),
                    "used_passage_indices": cached.get("used_passage_indices"),
                },
            )
            return

        if self._is_sensitive_query(item_answers.outside_item_names(item_context, user_query)):
            yield (
                self.PRIVACY_BLOCK_MSG,
                {
                    "done": True,
                    "retrieval_meta": {},
                    "token_usage": None,
                    "raw_chunk_similarity_pct": [],
                    "stage_timings_ms": _build_stage_timings_ms(start_wall=start_time_all),
                },
            )
            return

        retrieve_k = max(top_k, 3)
        if mode != "chat":
            if similarity_threshold is None:
                retrieve_k = min(max(int(top_k * 2), top_k + 5), 20)
            else:
                multiplier = 3 if top_k > 10 else 2
                retrieve_k = min(max(int(top_k * multiplier), top_k + 8), 25)

        pq = self._resolve_processed_query(user_query, processed_query, source_lang)
        retrieved_contexts, retrieved_doc_ids, raw_contexts_metadatas, retrieved_distances, retrieval_meta = self._retrieve_for_query(
            user_query, pq, retrieve_k, source_lang,
            user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold,
            enable_keyword_fallback=enable_keyword_fallback,
            use_reranker=use_reranker,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            embedder=embedder,
            collection_name=collection_name,
            record_documents=item_answers.record_requests(item_context),
            rerank_candidates=rerank_candidates,
            keyword_blend=keyword_blend,
        )
        logger.info(f"⏱️ Stream retrieval took: {time.time() - start_time_all:.4f}s")

        non_empty_contexts = [self._redact_sensitive_text(c) for c in retrieved_contexts if c.strip()]
        raw_contexts = non_empty_contexts.copy()
        raw_contexts_metadatas_filtered = [
            raw_contexts_metadatas[i] if i < len(raw_contexts_metadatas) else None
            for i, c in enumerate(retrieved_contexts) if c.strip()
        ]
        filtered_distances_stream = [
            retrieved_distances[i] if i < len(retrieved_distances) else 1.0
            for i, c in enumerate(retrieved_contexts) if c.strip()
        ]
        # Use absolute (not normalized) scores so the display floor filters by real cosine similarity.
        raw_chunk_similarity_pct, _normalized_chunk_pct_stream = chunk_relevance_pcts_from_distances(
            filtered_distances_stream
        )

        if not non_empty_contexts and not item_answers.informs_answer(item_context):
            yield (
                self.OUT_OF_CONTEXT_MSG,
                {
                    "done": True,
                    "retrieval_meta": retrieval_meta,
                    "token_usage": None,
                    "raw_contexts": raw_contexts,
                    "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                    "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                    "full_text": self.OUT_OF_CONTEXT_MSG,
                    "stage_timings_ms": _build_stage_timings_ms(
                        start_wall=start_time_all,
                        retrieval_meta=retrieval_meta,
                    ),
                },
            )
            return

        # Fail-fast: when retrieved chunks share no distinctive query
        # terms, the LLM almost always emits QUERY_OUT_OF_CONTEXT after 10–30s.
        # Skip LLM for both search and chat (custom OOC from system prompt still applied).
        evidence = self._evidence_decision(
            user_query, non_empty_contexts, distances=filtered_distances_stream, lang=source_lang
        )
        retrieval_meta["evidence_decision"] = evidence.to_meta()
        if mode in ("search", "chat") and not evidence.sufficient and not item_answers.informs_answer(item_context):
            resolved = (
                self._extract_custom_ooc_reply(system_prompt)
                if system_prompt
                else None
            ) or self.OUT_OF_CONTEXT_MSG
            logger.info(
                "%s stream: skipping LLM (no lexical support). resolved_len=%s",
                mode.capitalize(),
                len(resolved or ""),
            )
            stage_timings = _build_stage_timings_ms(
                start_wall=start_time_all,
                retrieval_meta=retrieval_meta,
                llm_generation_ms=0,
                streaming_ms=0,
            )
            yield (resolved, None)
            yield (
                "",
                {
                    "done": True,
                    "retrieval_meta": retrieval_meta,
                    "token_usage": None,
                    "raw_contexts": raw_contexts,
                    "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                    "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                    "full_text": resolved,
                    "stage_timings_ms": stage_timings,
                    "answer_replaced": True,
                    "llm_skipped": True,
                },
            )
            return

        from .context_limit_config import llm_context_chunk_limit

        is_search_mode = mode == "search"
        from ..chat_answer_links import source_url_line_for_context

        if is_search_mode:
            MAX_CONTEXTS_FOR_LLM = llm_context_chunk_limit(top_k)
            query_terms = set(self.retriever._extract_keywords(user_query))
            scored_contexts: List[Tuple[float, int, str]] = []
            for i, ctx in enumerate(non_empty_contexts):
                text = (ctx or "").strip()
                if not text:
                    continue
                lowered = text.lower()
                overlap = sum(1 for t in query_terms if t in lowered)
                dist_score = 0.0
                if i < len(filtered_distances_stream):
                    dist_score = max(0.0, 1.0 - filtered_distances_stream[i])
                score = (overlap * 2.0) + dist_score
                scored_contexts.append((score, i, text))

            scored_contexts.sort(key=lambda x: x[0], reverse=True)
            seen_norm: set = set()
            contexts_to_use: List[str] = []
            contexts_meta_to_use: List[Any] = []
            for _, idx, text in scored_contexts:
                norm = re.sub(r"[\W_]+", " ", text.lower())
                norm = re.sub(r"\s+", " ", norm).strip()[:280]
                if norm in seen_norm:
                    continue
                seen_norm.add(norm)
                contexts_to_use.append(text)
                contexts_meta_to_use.append(
                    raw_contexts_metadatas_filtered[idx]
                    if idx < len(raw_contexts_metadatas_filtered)
                    else {}
                )
                if len(contexts_to_use) >= MAX_CONTEXTS_FOR_LLM:
                    break
            if len(non_empty_contexts) > MAX_CONTEXTS_FOR_LLM:
                logger.info(
                    "Stream search: limiting LLM contexts to %d (cap %d)",
                    len(contexts_to_use),
                    MAX_CONTEXTS_FOR_LLM,
                )
        else:
            context_limit = llm_context_chunk_limit(top_k)
            contexts_to_use, contexts_meta_to_use = self._dedupe_chat_contexts(
                non_empty_contexts, raw_contexts_metadatas_filtered, context_limit
            )
            if len(non_empty_contexts) > len(contexts_to_use):
                logger.info(
                    f"📚 CONTEXT: Deduped stream LLM contexts to {len(contexts_to_use)} "
                    f"(from {len(non_empty_contexts)}, cap {context_limit}, top_k={top_k})"
                )
        contexts = citation_trailer.label_passages(
            contexts_to_use, contexts_meta_to_use, source_url_line_for_context
        )

        MAX_CONTEXT_CHARS = _env_int("RAG_MAX_CONTEXT_CHARS", 8000)
        total_chars = 0
        final_contexts = []
        for ctx in contexts:
            if total_chars + len(ctx) > MAX_CONTEXT_CHARS:
                break
            final_contexts.append(ctx)
            total_chars += len(ctx)
        combined_context = "\n\n".join(final_contexts) if final_contexts else "\n\n".join(contexts[:3])
        llm_passage_metadatas = list(
            contexts_meta_to_use[: len(final_contexts) or min(3, len(contexts))]
        )
        combined_context = item_answers.context_with_records(
            item_context, combined_context, llm_passage_metadatas
        )

        # Emit retrieval metadata early so the route can send sources before LLM tokens arrive.
        yield (
            "",
            {
                "retrieval_ready": True,
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                "query_language": source_lang,
            },
        )

        if max_tokens:
            max_tokens_val = max_tokens
        elif format_type == "html_long":
            max_tokens_val = 1200
        elif is_search_mode:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        else:
            max_tokens_val = max_tokens or _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        completion_applies = answer_completion.applies(mode, format_type)
        provider_max_tokens = (
            answer_completion.hard_cap(max_tokens_val) if completion_applies else max_tokens_val
        )

        prompt = self._build_prompt(
            user_query, combined_context, top_k, False,
            system_prompt=system_prompt, language_code=language_code,
            mode=mode, format_type=format_type,
            chat_history=chat_history,
            cite_passages=True,
            source_language_hint=language_preference.mixed_language_hint(
                final_contexts, llm_passage_metadatas, source_lang
            ),
            next_step_instruction=answer_next_step.chat_instruction(mode, pq),
            length_instruction=answer_completion.chat_instruction(mode, format_type, max_tokens_val),
            fixed_language=fixed_language,
            preference_instruction=feedback_memory_hook.preference_instruction(retrieval_meta),
        )
        used_passage_indices: Optional[List[int]] = None
        next_step_kind: Optional[str] = None

        llm_kwargs = {"max_tokens": provider_max_tokens}
        stream_provider: Optional[str] = None
        stream_chat_model: Optional[str] = None

        try:
            if llm_config:
                provider = llm_config.get("provider", "ollama").lower()
                if "google" in provider or "gemini" in provider:
                    provider = "gemini"
                chat_model = (
                    llm_config.get("chat_model")
                    or llm_config.get("model")
                    or "gpt-oss:120b-cloud"
                )
                stream_provider = provider
                stream_chat_model = chat_model
                api_key = llm_config.get("api_key")
                endpoint = llm_config.get("endpoint")
                llm = LLMFactory.get_llm(
                    provider,
                    chat_model,
                    api_key,
                    allow_ollama_fallback=self._llm_allow_ollama_fallback(provider),
                    endpoint=endpoint,

                    api_version=llm_config.get("api_version"),
                )
                temperature = llm_config.get("temperature")
                if temperature is not None:
                    try:
                        llm_kwargs["temperature"] = float(temperature)
                    except (ValueError, TypeError):
                        pass
                top_p = llm_config.get("top_p")
                if top_p is not None:
                    try:
                        llm_kwargs["top_p"] = float(top_p)
                    except (ValueError, TypeError):
                        pass
                frequency_penalty = llm_config.get("frequency_penalty")
                if frequency_penalty is not None:
                    try:
                        llm_kwargs["frequency_penalty"] = float(frequency_penalty)
                    except (ValueError, TypeError):
                        pass
                presence_penalty = llm_config.get("presence_penalty")
                if presence_penalty is not None:
                    try:
                        llm_kwargs["presence_penalty"] = float(presence_penalty)
                    except (ValueError, TypeError):
                        pass
            else:
                llm = self.llm

            full_text = ""
            last_chunk = None
            stream_start = time.perf_counter()
            stream_exc: Optional[BaseException] = None
            stream_timed_out = False

            # Produce LLM tokens in a background thread and consume with timeouts so
            # a hung Mistral/remote LLM API never blocks the SSE stream indefinitely.
            _stream_q: "queue.Queue[Any]" = queue.Queue()
            _STREAM_SENTINEL = object()

            def _stream_producer() -> None:
                try:
                    for _chunk in llm.stream_complete(prompt, **llm_kwargs):
                        _stream_q.put(_chunk)
                except Exception as _exc:
                    _stream_q.put(_exc)
                finally:
                    _stream_q.put(_STREAM_SENTINEL)

            _stream_thread = threading.Thread(target=_stream_producer, daemon=True)
            _stream_thread.start()

            _first_token = True
            trailer_filter = citation_trailer.CitationTrailerFilter(
                hold_tokens=(self.OUT_OF_CONTEXT_SENTINEL,)
            )
            while True:
                _timeout = LLM_STREAM_FIRST_TOKEN_TIMEOUT_S if _first_token else LLM_STREAM_INTER_TOKEN_TIMEOUT_S
                try:
                    chunk = _stream_q.get(timeout=_timeout)
                except queue.Empty:
                    label = "first token" if _first_token else "inter-token"
                    logger.warning("LLM stream %s timeout (%.0fs) — aborting", label, _timeout)
                    stream_timed_out = True
                    break
                if chunk is _STREAM_SENTINEL:
                    break
                if isinstance(chunk, Exception):
                    logger.warning("LLM stream error: %s", chunk)
                    stream_exc = chunk
                    break
                _first_token = False
                last_chunk = chunk
                delta = chunk.delta or ""
                if delta:
                    tentative = full_text + delta
                    # Swallow OOC sentinel tokens — never paint QUERY_OUT_OF_CONTEXT.
                    if self.OUT_OF_CONTEXT_SENTINEL in tentative:
                        full_text = tentative
                        logger.info("OOC sentinel detected mid-stream — stopping LLM early")
                        break
                    full_text = tentative
                    visible = trailer_filter.feed(delta)
                    if visible:
                        yield (visible, None)

            pending_visible = trailer_filter.flush()
            if mode == "chat":
                full_text, next_step_kind = answer_next_step.split_next_step(full_text)
            full_text, used_passage_indices = citation_trailer.parse_and_strip(full_text)
            if not full_text.strip() and used_passage_indices == []:
                full_text = self.OUT_OF_CONTEXT_SENTINEL
            if pending_visible and not self._is_out_of_context_response(full_text):
                yield (pending_visible, None)

            # Extract token usage from final chunk if available
            token_usage = {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}
            try:
                if last_chunk:
                    raw = getattr(last_chunk, "raw", None) or {}
                    if not isinstance(raw, dict):
                        try:
                            raw = dict(raw)
                        except Exception:
                            raw = {}
                    # Mistral stream events nest usage under ``data``.
                    usage = raw.get("usage") or getattr(raw.get("data"), "usage", None) or {}
                    if not isinstance(usage, dict):
                        try:
                            usage = vars(usage)
                        except Exception:
                            usage = {}
                    if usage:
                        pt = usage.get("prompt_tokens") or usage.get("input_tokens")
                        ct = usage.get("completion_tokens") or usage.get("output_tokens")
                        tt = usage.get("total_tokens") or (((pt or 0) + (ct or 0)) or None)
                        token_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}
            except Exception:
                pass

            streaming_ms = _elapsed_ms_since(stream_start)

            # OOC: either recover a short streamed HTML answer (entity match) or
            # return friendly copy — never dump raw chunks into Search Test.
            from ..llm_error_messages import is_llm_provider_infra_error

            answer_replaced = False
            llm_failed = False
            fallback_exc: Optional[BaseException] = stream_exc
            if fallback_exc is None and stream_timed_out:
                fallback_exc = TimeoutError("LLM stream timed out")

            if not (full_text or "").strip():
                # Timeout / provider failure with no tokens, but retrieval succeeded.
                fallback_text = self._fallback_answer_after_llm_failure(
                    user_query=user_query,
                    non_empty_contexts=non_empty_contexts,
                    retrieval_meta=retrieval_meta,
                    mode=mode,
                    format_type=format_type,
                    max_tokens=max_tokens_val,
                    exc=fallback_exc,
                    llm=llm,
                    language_code=language_code,
                    llm_kwargs=llm_kwargs,
                    provider=stream_provider,
                    model=stream_chat_model,
                )
                llm_failed = True
                if fallback_text.strip():
                    full_text = fallback_text
                    answer_replaced = True
                    used_passage_indices = None
                    yield (full_text, None)
            item_override = item_answers.guard_answer(
                item_context, full_text, llm_passage_metadatas,
                refused=True, retrieval_meta=retrieval_meta,
            ) if self._is_out_of_context_response(full_text) else None
            if item_override is not None:
                full_text, used_passage_indices = item_override
                answer_replaced = True
                next_step_kind = None
                yield (full_text, None)
            elif self._is_out_of_context_response(full_text):
                from ..llm_error_messages import (
                    format_llm_error_for_user,
                    is_llm_auth_error,
                )

                recovered_text = ""
                skip_recovery = fallback_exc is not None and (
                    is_llm_provider_infra_error(fallback_exc)
                    or is_llm_auth_error(fallback_exc)
                )
                if (
                    not skip_recovery
                    and mode in ("search", "chat")
                    and not self._search_lacks_lexical_support(
                        user_query, non_empty_contexts
                    )
                ):
                    recovery_contexts = self._top_contexts_for_search_recovery(
                        user_query, non_empty_contexts, limit=3
                    )
                    if recovery_contexts:
                        recovery_prompt = self._build_search_recovery_prompt(
                            user_query,
                            recovery_contexts,
                            format_type=format_type,
                            language_code=language_code,
                        )
                        recovery_max = min(int(max_tokens_val or 400), 450)
                        recovery_kwargs = dict(llm_kwargs)
                        recovery_kwargs["max_tokens"] = recovery_max
                        logger.info(
                            "%s stream: OOC with entity support — streaming recovery (%d ctx)",
                            mode.capitalize(),
                            len(recovery_contexts),
                        )
                        try:
                            for _chunk in llm.stream_complete(
                                recovery_prompt, **recovery_kwargs
                            ):
                                rdelta = getattr(_chunk, "delta", None) or ""
                                if not rdelta:
                                    continue
                                if self.OUT_OF_CONTEXT_SENTINEL in (
                                    recovered_text + rdelta
                                ):
                                    recovered_text = recovered_text + rdelta
                                    break
                                recovered_text += rdelta
                                yield (rdelta, None)
                        except Exception as recovery_err:
                            logger.warning(
                                "Search OOC recovery stream failed: %s", recovery_err
                            )
                            if is_llm_provider_infra_error(recovery_err) or is_llm_auth_error(
                                recovery_err
                            ):
                                recovered_text = format_llm_error_for_user(
                                    recovery_err,
                                    provider=stream_provider,
                                    model=stream_chat_model,
                                )

                if (
                    recovered_text.strip()
                    and not self._is_out_of_context_response(recovered_text)
                ):
                    # Provider/infra messages stay plain text.
                    if (
                        "rate limit" in recovered_text.lower()
                        or recovered_text.startswith("The configured")
                        or recovered_text.startswith("The AI service")
                        or recovered_text.startswith("We couldn't reach")
                    ):
                        full_text = recovered_text.strip()
                    else:
                        full_text = self._clean_response_text(
                            recovered_text, format_type=format_type
                        )
                else:
                    if skip_recovery and fallback_exc is not None:
                        full_text = format_llm_error_for_user(
                            fallback_exc,
                            provider=stream_provider,
                            model=stream_chat_model,
                        )
                    else:
                        full_text = self._resolve_ooc_answer(
                            full_text,
                            user_query=user_query,
                            non_empty_contexts=non_empty_contexts,
                            retrieval_meta=retrieval_meta,
                            mode=mode,
                            format_type=format_type,
                            system_prompt=system_prompt,
                            max_tokens=max_tokens_val,
                        )
                answer_replaced = True
                used_passage_indices = [] if self._is_out_of_context_response(full_text) else None

            answer_completed = False
            if (
                completion_applies
                and not answer_replaced
                and answer_completion.was_truncated(
                    getattr(last_chunk, "raw", None),
                    token_usage.get("completion_tokens"),
                    provider_max_tokens,
                )
            ):
                completion_start = time.perf_counter()
                full_text, retrieval_meta["answer_completion"] = answer_completion.complete_truncated(
                    full_text,
                    llm=llm,
                    user_query=user_query,
                    llm_kwargs=llm_kwargs,
                )
                retrieval_meta["answer_completion_ms"] = _elapsed_ms_since(completion_start)
                answer_completed = True

            verification_replaced = False
            if not answer_replaced:
                full_text, used_passage_indices, verification_replaced = self._verify_answer(
                    full_text,
                    used_passage_indices,
                    pq=pq,
                    retrieval_meta=retrieval_meta,
                    user_query=user_query,
                    combined_context=combined_context,
                    passage_metadatas=llm_passage_metadatas,
                    next_step=next_step_kind,
                )
                answer_replaced = verification_replaced
                item_override = item_answers.guard_answer(
                    item_context, full_text, llm_passage_metadatas,
                    refused=False, retrieval_meta=retrieval_meta,
                )
                if item_override is not None:
                    full_text, used_passage_indices = item_override
                    answer_replaced = verification_replaced = True
                    next_step_kind = None
                else:
                    completed = item_answers.complete_answer(item_context, full_text)
                    if completed != full_text:
                        full_text, answer_replaced = completed, True
                answer_next_step.finalize_meta(retrieval_meta, next_step_kind, full_text, mode=mode)

            stage_timings = _build_stage_timings_ms(
                start_wall=start_time_all,
                retrieval_meta=retrieval_meta,
                llm_generation_ms=streaming_ms,
                streaming_ms=streaming_ms,
            )
            logger.info(f"⏱️ Stream total took: {time.time() - start_time_all:.4f}s, tokens: {token_usage}")
            cache_payload = {
                "summary": full_text,
                "top_k": {},
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                "chunk_metadatas": [],
                "urls": [],
                "retrieval_meta": retrieval_meta,
                "token_usage": token_usage,
                "stage_timings_ms": stage_timings,
                "llm_passage_metadatas": llm_passage_metadatas,
                "used_passage_indices": used_passage_indices,
                "llm_failed": llm_failed,
            }
            self._set_cached(redis_key, local_key, cache_payload)
            yield (
                "",
                {
                    "done": True,
                    "retrieval_meta": retrieval_meta,
                    "token_usage": token_usage,
                    "raw_contexts": raw_contexts,
                    "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                    "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                    "full_text": full_text,
                    "stage_timings_ms": stage_timings,
                    "answer_replaced": answer_replaced,
                    "verification_replaced": verification_replaced,
                    "answer_completed": answer_completed,
                    "llm_passage_metadatas": llm_passage_metadatas,
                    "used_passage_indices": used_passage_indices,
                },
            )
        except Exception as e:
            logger.error(f"LLM stream_query failed: {e}")
            stream_ms = None
            if "stream_start" in locals():
                stream_ms = _elapsed_ms_since(stream_start)
            fallback_text = self._fallback_answer_after_llm_failure(
                user_query=user_query,
                non_empty_contexts=non_empty_contexts,
                retrieval_meta=retrieval_meta,
                mode=mode,
                format_type=format_type,
                max_tokens=max_tokens if "max_tokens_val" not in locals() else max_tokens_val,
                exc=e,
                llm=llm if "llm" in locals() else None,
                language_code=language_code if "language_code" in locals() else None,
                llm_kwargs=llm_kwargs if "llm_kwargs" in locals() else None,
                provider=stream_provider if "stream_provider" in locals() else None,
                model=stream_chat_model if "stream_chat_model" in locals() else None,
            )
            yield (
                fallback_text,
                {
                    "done": True,
                    "retrieval_meta": retrieval_meta,
                    "token_usage": None,
                    "raw_contexts": raw_contexts,
                    "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                    "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
                    "full_text": fallback_text,
                    "stage_timings_ms": _build_stage_timings_ms(
                        start_wall=start_time_all,
                        retrieval_meta=retrieval_meta,
                        llm_generation_ms=stream_ms,
                        streaming_ms=stream_ms,
                    ),
                    "answer_replaced": True,
                },
            )

    def retrieve_for_compare(
        self,
        user_query: str,
        top_k: int = 5,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        format_type: str = "html_long",
        max_tokens: Optional[int] = None,
        embedder: Optional["EmbedData"] = None,
        collection_name: Optional[str] = None,
        live_item_ids: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        """Shared retrieval for compare feature. Retrieve once; fan-out to N LLMs."""
        if self._is_sensitive_query(user_query):
            return {"error": "privacy_blocked", "prompt": None, "raw_contexts_metadatas": [], "retrieval_meta": {}, "max_tokens_val": 800}

        multiplier = 8 if similarity_threshold else 5
        retrieve_k = max(int(top_k * multiplier), 75)
        retrieved_contexts, retrieved_doc_ids, raw_contexts_metadatas, retrieved_distances, retrieval_meta = self.retriever.retrieve(
            user_query, retrieve_k, user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold,
            enable_keyword_fallback=True,
            embedder=embedder,
            collection_name=collection_name,
        )

        paired: List[Tuple[str, Any, float]] = []
        for i, ctx in enumerate(retrieved_contexts):
            if not (ctx or "").strip():
                continue
            meta = raw_contexts_metadatas[i] if i < len(raw_contexts_metadatas) else None
            if not chunk_references_live_item(meta, live_item_ids):
                continue
            dist = retrieved_distances[i] if i < len(retrieved_distances) else 1.0
            paired.append((self._redact_sensitive_text(ctx), meta, dist))

        if not paired:
            return {
                "error": "no_contexts",
                "prompt": None,
                "raw_contexts_metadatas": [],
                "retrieval_meta": retrieval_meta,
                "max_tokens_val": 800,
            }

        MAX_CONTEXTS = 15
        query_terms = set(self.retriever._extract_keywords(user_query))
        scored: List[Tuple[float, str, Any]] = []
        for text, meta, dist in paired:
            lowered = text.lower()
            overlap = sum(1 for t in query_terms if t in lowered)
            dist_score = max(0.0, 1.0 - dist)
            scored.append((overlap * 2.0 + dist_score, text, meta))
        scored.sort(key=lambda x: x[0], reverse=True)

        seen_norm: set = set()
        contexts_to_use: List[str] = []
        metas_to_use: List[Any] = []
        for _, text, meta in scored:
            norm = re.sub(r"[\W_]+", " ", text.lower())
            norm = re.sub(r"\s+", " ", norm).strip()[:280]
            if norm in seen_norm:
                continue
            seen_norm.add(norm)
            contexts_to_use.append(text)
            metas_to_use.append(meta)
            if len(contexts_to_use) >= MAX_CONTEXTS:
                break

        contexts = [f"--- Passage {i+1} ---\n{ctx}" for i, ctx in enumerate(contexts_to_use)]
        total_chars = 0
        final_contexts: List[str] = []
        for ctx in contexts:
            if total_chars + len(ctx) > 6000:
                break
            final_contexts.append(ctx)
            total_chars += len(ctx)
        combined_context = "\n\n".join(final_contexts) if final_contexts else "\n\n".join(contexts[:3])

        prompt = self._build_prompt(user_query, combined_context, top_k, False, mode="search", format_type=format_type)
        max_tokens_val = max_tokens or (1600 if format_type == "html_long" else 800)
        return {
            "prompt": prompt,
            "raw_contexts_metadatas": metas_to_use,
            "retrieval_meta": retrieval_meta,
            "max_tokens_val": max_tokens_val,
        }

    def generate_for_compare(
        self,
        pre_retrieved: Dict[str, Any],
        llm_config: Dict[str, Any],
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        """LLM generation on pre-retrieved context for compare. Returns {summary, token_usage}."""
        prompt = pre_retrieved["prompt"]
        max_tokens_val = max_tokens or pre_retrieved.get("max_tokens_val", 1600)
        llm_kwargs: Dict[str, Any] = {"max_tokens": max_tokens_val}
        token_usage: Dict[str, Any] = {"prompt_tokens": None, "completion_tokens": None, "total_tokens": None}

        provider = llm_config.get("provider", "customllm").lower()
        default_model = "gpt-oss:120b-cloud" if "custom" in provider or "ollama" in provider else "gpt-4"
        chat_model = llm_config.get("chat_model", default_model)
        api_key = llm_config.get("api_key")
        endpoint = llm_config.get("endpoint")
        if "google" in provider or "gemini" in provider:
            provider = "gemini"

        llm = LLMFactory.get_llm(
            provider,
            chat_model,
            api_key,
            allow_ollama_fallback=RAG._llm_allow_ollama_fallback(provider),
            endpoint=endpoint,

            api_version=llm_config.get("api_version"),
        )

        def _safe_float(val):
            try: return float(val)
            except: return None

        temperature = _safe_float(llm_config.get("temperature"))
        top_p = _safe_float(llm_config.get("top_p"))
        frequency_penalty = _safe_float(llm_config.get("frequency_penalty"))
        presence_penalty = _safe_float(llm_config.get("presence_penalty"))

        if provider == "gemini":
            gemini_kwargs: Dict[str, Any] = {"generation_config": {"max_output_tokens": max_tokens_val}}
            if temperature is not None:
                gemini_kwargs["generation_config"]["temperature"] = temperature
            if top_p is not None:
                gemini_kwargs["generation_config"]["top_p"] = top_p
            llm_response = llm.complete(prompt, **gemini_kwargs)
        else:
            if temperature is not None:
                llm_kwargs["temperature"] = temperature
            if top_p is not None:
                llm_kwargs["top_p"] = top_p
            if frequency_penalty is not None:
                llm_kwargs["frequency_penalty"] = frequency_penalty
            if presence_penalty is not None:
                llm_kwargs["presence_penalty"] = presence_penalty
            llm_response = llm.complete(prompt, **llm_kwargs)

        raw_response = getattr(llm_response, "text", "") or ""

        try:
            raw = getattr(llm_response, "raw", None)
            if raw and not isinstance(raw, dict):
                try: raw = dict(raw)
                except: raw = vars(raw)
            raw = raw or {}
            usage = raw.get("usage") or {}
            if not isinstance(usage, dict):
                try: usage = vars(usage)
                except: usage = {}
            if usage:
                pt = usage.get("prompt_tokens") or usage.get("input_tokens")
                ct = usage.get("completion_tokens") or usage.get("output_tokens")
                tt = usage.get("total_tokens") or (((pt or 0) + (ct or 0)) or None)
                token_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}
            if not any(token_usage.values()):
                um = raw.get("usage_metadata") or {}
                if not isinstance(um, dict):
                    try: um = vars(um)
                    except: um = {}
                if um:
                    pt = um.get("prompt_token_count")
                    ct = um.get("candidates_token_count")
                    tt = um.get("total_token_count")
                    token_usage = {"prompt_tokens": pt, "completion_tokens": ct, "total_tokens": tt}
        except Exception as e:
            logger.warning(f"generate_for_compare token extraction failed: {e}")

        return {"summary": raw_response, "token_usage": token_usage}

    @staticmethod
    def prompt_for_url_selection(
        query: str, answer: str, candidate_urls: List[str]
    ) -> str:
        if not candidate_urls:
            return ""

        url_list = "\n".join(
            [f"{idx + 1}. {url}" for idx, url in enumerate(candidate_urls)]
        )
        return f"""Given a user query and the generated answer, determine which URL from the list best matches the user's intent.

User Query: "{query}"

Generated Answer: "{answer[:800]}"

Available URLs:
{url_list}

Try not to select the same URL twice.

Which URL number (1-{len(candidate_urls)}) best matches the user's query intent?
Respond with ONLY the number (1-{len(candidate_urls)})."""


# ---------------- RAG Pipeline Wrapper ----------------
class RAGPipeline:
    """
    Public wrapper used by main.py / rag_api.py etc.
    """

    def __init__(
        self,
        embed_model: str = DEFAULT_EMBEDDING_MODEL,
        llm_model: str = "gpt-oss:120b-cloud",
    ):
        self.embedder = EmbedData(embed_model)
        self.vdb = VectorDB()
        self.retriever = Retriever(self.vdb, self.embedder)
        self.rag = RAG(self.retriever, llm_model)
        self._warmup_embedding_model()

    def _warmup_embedding_model(self):
        """Pre-load embedding model into Ollama so first query doesn't pay cold-start penalty."""
        try:
            self.embedder.embed(["warmup"])
            logger.info("Embedding model warmed up successfully.")
        except Exception as e:
            logger.warning(f"Embedding warmup failed (non-critical): {e}")

    def _embedder_for(
        self,
        provider: Optional[str],
        model: Optional[str],
        api_key: Optional[str],
        endpoint: Optional[str] = None,
        api_version: Optional[str] = None,
    ) -> EmbedData:
        """Resolve to a project-specific embedder (or fall back to the default)."""
        if not provider and not model:
            return self.embedder
        raw_embedder = get_raw_embedder(
            provider, model, api_key, endpoint=endpoint, api_version=api_version
        )
        return EmbedData.from_embedder(raw_embedder)

    def ingest_file(
        self,
        filepath: str,
        document_id: Optional[str] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        try:
            prepared = self.prepare_ingest(
                filepath=filepath,
                document_id=document_id,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                embedding_api_key=embedding_api_key,
                embedding_endpoint=embedding_endpoint,
                embedding_api_version=embedding_api_version,
            )
            if prepared is None:
                return {"chunks": 0, "status": "No text extracted"}

            self.write_prepared_ingest(
                texts=prepared["texts"],
                embeddings=prepared["embeddings"],
                filepath=filepath,
                document_id=prepared["document_id"],
                chunk_metadata=prepared["chunk_metadata"],
                user_id=user_id,
                project_id=project_id,
                collection_name=collection_name_for(project_id, embedding_provider, embedding_model),
                collection_metric=get_embedding_meta(embedding_provider, embedding_model).metric,
            )
            return {"chunks": prepared["chunks"], "status": "Indexed"}
        except Exception as e:
            logger.error(f"Failed to ingest {os.path.basename(filepath)} into RAG: {e}")
            raise

    def prepare_ingest(
        self,
        filepath: str,
        document_id: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
        on_progress: Optional[EmbedProgressFn] = None,
        chunk_profile: Optional[str] = None,
        pdf_page_from: Optional[int] = None,
        pdf_page_to: Optional[int] = None,
        pdf_strip_chrome: bool = False,
        extract_engine: Optional[str] = None,
        pdf_strip_header: Optional[bool] = None,
        pdf_strip_footer: Optional[bool] = None,
        ocr_model: Optional[str] = None,
        split_config: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        parsed = self.prepare_parse(
            filepath,
            document_id=document_id,
            chunk_profile=chunk_profile,
            pdf_page_from=pdf_page_from,
            pdf_page_to=pdf_page_to,
            pdf_strip_chrome=pdf_strip_chrome,
            extract_engine=extract_engine,
            pdf_strip_header=pdf_strip_header,
            pdf_strip_footer=pdf_strip_footer,
            ocr_model=ocr_model,
            split_config=split_config,
        )
        if parsed is None:
            return None
        embeddings = self.embed_prepared(
            parsed["texts"],
            parsed["chunk_metadata"],
            embedding_provider=embedding_provider,
            embedding_model=embedding_model,
            embedding_api_key=embedding_api_key,
            embedding_endpoint=embedding_endpoint,
            embedding_api_version=embedding_api_version,
            on_progress=on_progress,
        )
        parsed["embeddings"] = embeddings
        return parsed

    def prepare_parse(
        self,
        filepath: str,
        document_id: Optional[str] = None,
        chunk_profile: Optional[str] = None,
        pdf_page_from: Optional[int] = None,
        pdf_page_to: Optional[int] = None,
        pdf_strip_chrome: bool = False,
        extract_engine: Optional[str] = None,
        pdf_strip_header: Optional[bool] = None,
        pdf_strip_footer: Optional[bool] = None,
        ocr_model: Optional[str] = None,
        split_config: Optional[Any] = None,
    ) -> Optional[Dict[str, Any]]:
        logger.info("ingest stage=parser file=%s", os.path.basename(filepath))
        texts, chunk_metadata = extract_text_from_file(
            filepath,
            chunk_profile=chunk_profile,
            page_from=pdf_page_from,
            page_to=pdf_page_to,
            strip_chrome=bool(pdf_strip_chrome),
            extract_engine=extract_engine,
            strip_header=pdf_strip_header,
            strip_footer=pdf_strip_footer,
            ocr_model=ocr_model,
            split_config=split_config,
        )
        logger.info("ingest stage=chunker profile=%s chunks=%s", chunk_profile or "default", len(texts or []))
        if not texts:
            logger.warning(f"No text extracted from file: {filepath}")
            return None
        chunk_metadata = chunk_context.annotate(chunk_metadata, len(texts))

        resolved_document_id = document_id
        if resolved_document_id is None:
            filename = os.path.basename(filepath)
            if "_" in filename:
                potential_id = filename.split("_")[0]
                try:
                    uuid.UUID(potential_id)
                    resolved_document_id = potential_id
                except ValueError:
                    resolved_document_id = str(uuid.uuid4())
            else:
                resolved_document_id = str(uuid.uuid4())
        return {
            "texts": texts,
            "chunk_metadata": chunk_metadata,
            "document_id": resolved_document_id,
            "chunks": len(texts),
        }

    def embed_prepared(
        self,
        texts: List[str],
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
        on_progress: Optional[EmbedProgressFn] = None,
    ) -> List[List[float]]:
        embedder = self._embedder_for(
            embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version
        )
        _report_embed_progress(on_progress, 0, len(texts))
        return embedder.embed(
            chunk_context.embedding_texts(texts, chunk_metadata or []), on_progress=on_progress
        )

    def write_prepared_ingest(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        filepath: str,
        document_id: str,
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        collection_metric: str = "cosine",
    ) -> None:
        self.vdb.ingest(
            texts,
            embeddings,
            document_id=document_id,
            source_file=filepath,
            chunk_metadata=chunk_metadata,
            user_id=user_id,
            project_id=project_id,
            collection_name=collection_name,
            collection_metric=collection_metric,
        )

    def replace_prepared_ingest(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        filepath: str,
        document_id: str,
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        collection_metric: str = "cosine",
    ) -> None:
        """Swap a document's chunks atomically (readers never see a gap)."""
        self.vdb.replace_document(
            texts,
            embeddings,
            document_id=document_id,
            source_file=filepath,
            chunk_metadata=chunk_metadata,
            user_id=user_id,
            project_id=project_id,
            collection_name=collection_name,
            collection_metric=collection_metric,
        )

    def delete_document_embeddings(self, document_id: str, collection_name: Optional[str] = None) -> bool:
        return self.vdb.delete_by_document_id(document_id, collection_name=collection_name)

    def delete_by_source_file_exact(
        self, source_file_basename: str, collection_name: Optional[str] = None
    ) -> bool:
        return self.vdb.delete_by_source_file_exact(source_file_basename, collection_name=collection_name)

    def delete_by_source_file_pattern(self, pattern: str, collection_name: Optional[str] = None) -> bool:
        """Delete embeddings by source_file pattern (e.g., 'crawl_export_{source_id}_%')"""
        return self.vdb.delete_by_source_file_pattern(pattern, collection_name=collection_name)

    def delete_project_embeddings(self, project_id: str, collection_name: Optional[str] = None) -> bool:
        return self.vdb.delete_by_project_id(project_id, collection_name=collection_name)

    def clear_query_cache(self) -> None:
        self.rag.clear_query_cache()

    def generate_suggestions(
        self,
        project_id: str,
        user_id: Optional[int] = None,
        limit: int = 4,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
    ) -> List[str]:
        """
        Generate auto-generated query suggestions using LLM based on project embeddings.
        """
        try:
            # Query the vector DB for project-specific documents
            # Get a diverse sample of documents to analyze
            sample_query = "main topics and key information"
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
            query_vector = embedder.embed_model.get_text_embedding(sample_query)
            target_collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
            
            # Build where clause with project_id and user_id filters
            conditions = []
            if project_id:
                conditions.append({"project_id": str(project_id)})
            if user_id is not None:
                conditions.append({"user_id": user_id})
            
            if not conditions:
                logger.warning("No filters provided for suggestions - need project_id or user_id")
                return []
            
            where_clause = conditions[0] if len(conditions) == 1 else {"$and": conditions}
            
            # Query with project_id filter
            query_args = {
                "query_embeddings": [query_vector],
                "n_results": min(limit * 5, 30),  # Get more results for LLM to analyze
                "include": ["documents", "metadatas"],
                "where": where_clause
            }
            
            try:
                res = self.vdb.get_collection(target_collection_name).query(**query_args)
                documents = res.get("documents", [[]])[0]
                metadatas = res.get("metadatas", [[]])[0]
                logger.info(f"Query returned {len(documents) if documents else 0} documents for project {project_id}, user {user_id}")
            except Exception as e:
                logger.warning(f"No documents found for project {project_id}, user {user_id}: {e}", exc_info=True)
                return []
            
            if not documents or len(documents) == 0:
                logger.info(f"No documents found for project {project_id}, user {user_id} - returning empty suggestions")
                return []
            
            # Combine document content for LLM analysis
            # Take first 2000 characters from multiple documents
            combined_content = []
            total_chars = 0
            max_chars = 2000
            
            for i, doc_text in enumerate(documents[:10]):  # Analyze up to 10 documents
                if total_chars >= max_chars:
                    break
                # Take first portion of document
                doc_excerpt = doc_text[:min(300, max_chars - total_chars)]
                if doc_excerpt.strip():
                    combined_content.append(doc_excerpt.strip())
                    total_chars += len(doc_excerpt)
            
            if not combined_content:
                return []
            
            # Prepare context for LLM
            context_text = "\n\n".join(combined_content[:5])  # Use top 5 document excerpts
            
            # Use LLM to generate relevant questions based on the content
            prompt = f"""Based on the following content from embedded documents, generate {limit} relevant and specific questions that users might ask about this content.

Content:
{context_text}

Requirements:
- Generate exactly {limit} questions
- Questions should be specific and relevant to the content
- Questions should be natural and user-friendly
- Each question should be on a separate line
- Start each question with a question word (What, How, Why, When, Where, Who, Which)
- Do not include numbering or bullet points
- Do not include any explanations or additional text

Questions:"""

            try:
                logger.info(f"Calling LLM to generate {limit} suggestions based on {len(combined_content)} document excerpts")
                llm_response = self.rag.llm.complete(prompt, max_tokens=200)
                raw_response = getattr(llm_response, "text", "") or ""
                if settings.debug:
                    logger.debug(f"LLM response length: {len(raw_response)} characters")
                
                if not raw_response or not raw_response.strip():
                    logger.warning("LLM returned empty response")
                    return []
                
                # Parse questions from LLM response
                suggestions = []
                for line in raw_response.strip().split('\n'):
                    line = line.strip()
                    if not line:
                        continue
                    # Remove numbering/bullets if present
                    line = re.sub(r'^[\d\.\-\*\)\]]+\s*', '', line)
                    # Remove quotes if present
                    line = line.strip('"\'')
                    
                    if line and line.endswith('?'):
                        suggestions.append(line)
                    elif line and any(line.startswith(qw) for qw in ['What', 'How', 'Why', 'When', 'Where', 'Who', 'Which']):
                        # Add question mark if missing
                        if not line.endswith('?'):
                            line = line + '?'
                        suggestions.append(line)
                
                logger.info(f"Parsed {len(suggestions)} raw suggestions from LLM response")
                
                # Filter and clean suggestions
                cleaned_suggestions = []
                seen = set()
                for s in suggestions:
                    s_clean = s.strip()
                    # Remove duplicates and very short questions
                    if s_clean and len(s_clean) > 10 and s_clean.lower() not in seen:
                        cleaned_suggestions.append(s_clean)
                        seen.add(s_clean.lower())
                        if len(cleaned_suggestions) >= limit:
                            break
                
                logger.info(f"Returning {len(cleaned_suggestions)} cleaned suggestions")
                
                if len(cleaned_suggestions) >= limit:
                    return cleaned_suggestions[:limit]
                
                # If we got some suggestions but not enough, return what we have
                if cleaned_suggestions:
                    return cleaned_suggestions
                
                logger.warning(f"No valid suggestions parsed from LLM response. Raw response: {raw_response[:200]}")
                
            except Exception as e:
                logger.error(f"LLM failed to generate suggestions: {e}", exc_info=True)
                # Fall back to empty list if LLM fails
                return []
            
            # If we reach here, return empty list
            return []
            
        except Exception as e:
            logger.warning(f"Error generating suggestions: {e}")
            return []

    def query(
        self,
        query: str,
        top_k: int = DEFAULT_TOP_K,
        max_tokens: Optional[int] = None,
        generate_topk: bool = True,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        language_code: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        use_reranker: Optional[bool] = None,
        mode: str = "search",
        format_type: str = "markdown",
        enable_keyword_fallback: bool = True,
        semantic_confidence_floor: Optional[float] = None,
        keyword_score_floor: Optional[float] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        embedder: Optional[EmbedData] = None,
        collection_name: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
        use_cache: bool = True,
        processed_query: Optional[ProcessedQuery] = None,
        fixed_language: bool = False,
        item_context: Optional[Any] = None,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
    ):
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
        if collection_name is None and (embedding_provider or embedding_model):
            collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
        extra: Dict[str, Any] = {"processed_query": processed_query} if processed_query is not None else {}
        if fixed_language:
            extra["fixed_language"] = True
        if item_context is not None:
            extra["item_context"] = item_context
        if rerank_candidates is not None:
            extra["rerank_candidates"] = rerank_candidates
        extra["keyword_blend"] = keyword_blend
        return self.rag.query(
            query,
            top_k=top_k,
            max_tokens=max_tokens,
            generate_topk=generate_topk,
            user_id=user_id,
            project_id=project_id,
            system_prompt=system_prompt,
            llm_config=llm_config,
            language_code=language_code,
            similarity_threshold=similarity_threshold,
            use_reranker=use_reranker,
            mode=mode,
            format_type=format_type,
            enable_keyword_fallback=enable_keyword_fallback,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            chat_history=chat_history,
            embedder=embedder,
            collection_name=collection_name,
            use_cache=use_cache,
            **extra,
        )

    def retrieve_only(
        self,
        query: str,
        project_id: str,
        top_k: int = DEFAULT_TOP_K,
        similarity_threshold: Optional[float] = None,
        use_reranker: bool = False,
        enable_keyword_fallback: bool = True,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
    ) -> Dict[str, Any]:
        embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
        coll_name = (
            collection_name_for(project_id, embedding_provider, embedding_model)
            if (embedding_provider or embedding_model)
            else None
        )
        docs, _ids, metas, dists, retrieval_meta = self.retriever.retrieve(
            query=query,
            project_id=project_id,
            top_k=top_k,
            similarity_threshold=similarity_threshold,
            use_reranker=use_reranker,
            enable_keyword_fallback=enable_keyword_fallback,
            embedder=embedder,
            collection_name=coll_name,
            rerank_candidates=rerank_candidates,
            keyword_blend=keyword_blend,
        )
        results = [
            {
                "text": doc,
                "score": max(0, round((1.0 - dist) * 100)),
                "rank": i + 1,
                "metadata": meta or {},
            }
            for i, (doc, meta, dist) in enumerate(zip(docs, metas, dists))
        ]
        return {"results": results, "retrieval_meta": retrieval_meta}

    async def chat_query_async(self, query: str, stream: bool = False):
        return await self.rag.chat_query_async(query, stream=stream)

    def stream_query(
        self,
        user_query: str,
        top_k: int = DEFAULT_TOP_K,
        max_tokens: Optional[int] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        system_prompt: Optional[str] = None,
        llm_config: Optional[Dict[str, Any]] = None,
        language_code: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        use_reranker: Optional[bool] = None,
        chat_history: Optional[List[Dict[str, str]]] = None,
        semantic_confidence_floor: Optional[float] = None,
        keyword_score_floor: Optional[float] = None,
        embedder: Optional[EmbedData] = None,
        collection_name: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
        mode: str = "chat",
        format_type: str = "markdown",
        enable_keyword_fallback: bool = True,
        use_cache: bool = True,
        processed_query: Optional[ProcessedQuery] = None,
        fixed_language: bool = False,
        item_context: Optional[Any] = None,
        rerank_candidates: Optional[int] = None,
        keyword_blend: Optional[float] = None,
    ):
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
        if collection_name is None and (embedding_provider or embedding_model):
            collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
        extra: Dict[str, Any] = {"processed_query": processed_query} if processed_query is not None else {}
        if fixed_language:
            extra["fixed_language"] = True
        if item_context is not None:
            extra["item_context"] = item_context
        if rerank_candidates is not None:
            extra["rerank_candidates"] = rerank_candidates
        extra["keyword_blend"] = keyword_blend
        return self.rag.stream_query(
            user_query=user_query,
            top_k=top_k,
            max_tokens=max_tokens,
            user_id=user_id,
            project_id=project_id,
            system_prompt=system_prompt,
            llm_config=llm_config,
            language_code=language_code,
            similarity_threshold=similarity_threshold,
            use_reranker=use_reranker,
            chat_history=chat_history,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            embedder=embedder,
            collection_name=collection_name,
            mode=mode,
            format_type=format_type,
            enable_keyword_fallback=enable_keyword_fallback,
            use_cache=use_cache,
            **extra,
        )

    def retrieve_for_compare(
        self,
        query: str,
        top_k: int = 5,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        similarity_threshold: Optional[float] = None,
        format_type: str = "html_long",
        max_tokens: Optional[int] = None,
        embedder: Optional[EmbedData] = None,
        collection_name: Optional[str] = None,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
        embedding_endpoint: Optional[str] = None,
        embedding_api_version: Optional[str] = None,
        live_item_ids: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key, embedding_endpoint, embedding_api_version)
        if collection_name is None and (embedding_provider or embedding_model):
            collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
        return self.rag.retrieve_for_compare(
            query, top_k=top_k, user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold, format_type=format_type,
            max_tokens=max_tokens, embedder=embedder, collection_name=collection_name,
            live_item_ids=live_item_ids,
        )

    def generate_for_compare(
        self,
        pre_retrieved: Dict[str, Any],
        llm_config: Dict[str, Any],
        max_tokens: Optional[int] = None,
    ) -> Dict[str, Any]:
        return self.rag.generate_for_compare(pre_retrieved, llm_config, max_tokens=max_tokens)
