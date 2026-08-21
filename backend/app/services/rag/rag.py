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
from typing import List, Dict, Optional, Any, Tuple, Set
from pathlib import Path

import chromadb
from chromadb.config import Settings as ChromaSettings
import redis
import asyncio
import concurrent.futures

from llama_index.embeddings.ollama import OllamaEmbedding
from llama_index.llms.ollama import Ollama

from .source_display_config import display_sources_min_chunk_similarity_pct


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

# --- Configuration ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

PROJECT_ROOT = Path(os.getcwd())


def _default_vdb_path() -> Path:
    try:
        from ..chroma_repair import resolve_rag_chroma_db_path

        return resolve_rag_chroma_db_path()
    except Exception:
        return PROJECT_ROOT / "rag_db_local"


VDB_PATH = _default_vdb_path()
EMBED_BATCH_SIZE = 32
# Hosted embedding APIs enforce per-input and per-request token (and sometimes item) limits.
# Reindex sends full crawled pages; batching must stay within vendor caps or requests fail.
DEFAULT_TOP_K = 5


def _rag_chroma_http_mode() -> bool:
    """Match CHROMA_MODE in vector_db: http → remote Chroma sidecar."""
    from ..infra_env import chroma_http_enabled

    return chroma_http_enabled()


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


def _rag_http_chroma_client():
    from ..infra_env import chroma_host, chroma_port, chroma_ssl

    host = chroma_host()
    port = chroma_port()
    ssl = chroma_ssl()
    # Pass host/port explicitly in Settings so chromadb 1.x doesn't read CHROMA_SERVER_HOST
    # from the environment (Docker default "chromadb") and raise a host-mismatch ValueError.
    settings = ChromaSettings(chroma_server_host=host, chroma_server_http_port=port)
    return chromadb.HttpClient(host=host, port=port, ssl=ssl, settings=settings)

# --- Tiered Retrieval Constants (configurable, override per-request within bounded limits) ---
TIER1_TOP1_SIM_FLOOR: float = 0.16      # semantic top-1 similarity minimum (lowered: 0.22→0.16)
TIER1_TOP3_MEAN_FLOOR: float = 0.20     # semantic top-3 mean minimum (lowered: 0.28→0.20)
TIER1_LEXICAL_OVERLAP_FLOOR: float = 0.10  # fraction of query keywords that must appear in top chunks (0.15→0.10)
TIER1_DUPLICATE_RATIO_MAX: float = 0.70    # max allowed near-duplicate chunk ratio
TIER2_KEYWORD_SCORE_FLOOR: float = 0.20    # minimum keyword aggregate score to accept Tier 2 result (0.35→0.20)
TIER2_MAX_FETCH_CHUNKS: int = _env_int("TIER2_MAX_FETCH_CHUNKS", 300)  # cap on chunks fetched from ChromaDB for keyword pass
TIER2_LARGE_COLLECTION_THRESHOLD: int = _env_int("TIER2_LARGE_COLLECTION_THRESHOLD", 5000)  # vector count above which keyword fetch is reduced
TIER2_LARGE_COLLECTION_FETCH_CHUNKS: int = _env_int("TIER2_LARGE_COLLECTION_FETCH_CHUNKS", 100)  # keyword fetch for large collections
KEYWORD_RETRIEVAL_TIMEOUT_SECONDS: float = _env_float("KEYWORD_RETRIEVAL_TIMEOUT_SECONDS", 4.0)  # tighter budget for keyword branch in parallel mode
RETRIEVAL_TIMEOUT_SECONDS: float = _env_float("RETRIEVAL_TIMEOUT_SECONDS", 10.0)  # timeout for embedding + vector query calls

# Hard deadline for the LLM streaming loop: if no token arrives within this many
# seconds on first chunk (or between tokens), we abort cleanly.
LLM_STREAM_FIRST_TOKEN_TIMEOUT_S: float = _env_float("LLM_STREAM_FIRST_TOKEN_TIMEOUT_S", 25.0)
LLM_STREAM_INTER_TOKEN_TIMEOUT_S: float = _env_float("LLM_STREAM_INTER_TOKEN_TIMEOUT_S", 15.0)

# TTL for cached collection.count() results (seconds). Avoids a Chroma HTTP round-trip
# on every query while still detecting large new ingests within a minute.
_COLLECTION_SIZE_CACHE_TTL: float = 60.0
_collection_size_cache: Dict[str, Tuple[int, float]] = {}
_collection_size_cache_lock: threading.Lock = threading.Lock()

# --- Hybrid retrieval constants ---
RRF_K: int = 60                             # RRF dampening constant (60 is the canonical default)
CE_RERANK_CANDIDATES: int = 30              # max fused candidates to feed the cross-encoder reranker
CE_RERANK_MIN_CANDIDATES: int = 5           # skip rerank when fused pool is too small

# When the LLM emits OOC but Tier-1 retrieval returned chunks, use extractive fallback
# if top-1 similarity (as %) is at least this. 70% was too strict (many false refusals).
EXTRACTIVE_FALLBACK_MIN_CONFIDENCE_PCT: int = 52


# ---------------- Embedding ----------------
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
    ) -> List[List[float]]:
        """Split embedding calls so each request respects vendor token/item caps (reindex-safe)."""
        clamped = [t[:max_input_chars] if len(t) > max_input_chars else t for t in contexts]
        embeddings: List[List[float]] = []
        batch: List[str] = []
        batch_tokens = 0
        pause_sec = self._batch_pause_seconds()

        def flush() -> None:
            nonlocal batch, batch_tokens
            if not batch:
                return
            embeddings.extend(self._get_text_embedding_batch_with_retry(batch))
            batch = []
            batch_tokens = 0
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

    def embed(self, contexts: List[str]) -> List[List[float]]:
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
            )

        # OpenAI: 8192 tokens/input, 300k tokens/request, max 2048 inputs/request.
        if OpenAIEmbedding is not None and isinstance(self.embed_model, OpenAIEmbedding):
            return self._embed_with_api_limits(
                contexts,
                max_input_chars=32_000,
                max_batch_tokens=280_000,
                max_batch_items=2048,
            )

        # Gemini (llama-index): models in our registry use ~2048 tokens/input; keep batches modest.
        if GeminiEmbedding is not None and isinstance(self.embed_model, GeminiEmbedding):
            return self._embed_with_api_limits(
                contexts,
                max_input_chars=8_000,
                max_batch_tokens=200_000,
                max_batch_items=250,
            )

        # Ollama / local: count-based batching only (large context; no shared HTTP batch cap).
        embeddings: List[List[float]] = []
        for batch in batch_iterate(contexts, EMBED_BATCH_SIZE):
            embeddings.extend(
                self.embed_model.get_text_embedding_batch(batch, show_progress=False)
            )
        return embeddings


# ---------------- Vector DB ----------------
class ChromaVDB:
    def __init__(self, db_path=VDB_PATH):
        db_path = Path(db_path) if not isinstance(db_path, Path) else db_path

        self._http_mode = _rag_chroma_http_mode()

        if not self._http_mode:
            db_path.mkdir(parents=True, exist_ok=True, mode=0o755)

            if not os.access(db_path, os.W_OK):
                try:
                    os.chmod(db_path, 0o755)
                    logger.info(f"Fixed permissions for database directory: {db_path}")
                except Exception as e:
                    logger.error(f"Cannot set write permissions on {db_path}: {e}")
                    raise PermissionError(
                        f"Database directory {db_path} is not writable. Please check permissions."
                    )

            self.db_path = db_path
            self.client = chromadb.PersistentClient(path=str(db_path))
        else:
            # Remote Chroma (e.g. Coder chromadb agent); ingestion/query already send embeddings explicitly.
            self.db_path = db_path
            self.client = _rag_http_chroma_client()

        # Per-(provider, model) collections are routed through this cache. The
        # legacy default model keeps writing to ``rag_collection`` so that
        # historical data remains visible without any migration.
        self._collections: Dict[str, Any] = {}
        self._collections_lock = threading.Lock()
        self.collection = self._get_or_create("rag_collection", metric="cosine")

    def _get_or_create(self, name: str, metric: str = "cosine"):
        """Fetch (and cache) a Chroma collection by name with the given distance metric."""
        cached = self._collections.get(name)
        if cached is not None:
            return cached
        with self._collections_lock:
            cached = self._collections.get(name)
            if cached is not None:
                return cached
            coll = self.client.get_or_create_collection(
                name=name,
                metadata={"hnsw:space": metric or "cosine"},
            )
            self._collections[name] = coll
            return coll

    def get_collection(self, name: Optional[str] = None, metric: str = "cosine"):
        """Public accessor. Returns the default ``rag_collection`` when ``name`` is None."""
        if not name:
            return self.collection
        return self._get_or_create(name, metric=metric)

    def list_known_collections(self) -> List[str]:
        try:
            return [c.name for c in self.client.list_collections()]
        except Exception as exc:
            logger.warning(f"Failed to list Chroma collections: {exc}")
            return list(self._collections.keys())

    def _fix_permissions_if_readonly(self):
        db_dir = self.db_path
        logger.error(f"Database is readonly. Checking permissions on: {db_dir}")
        if not db_dir.exists():
            raise PermissionError(
                f"Database directory does not exist or is readonly. Path: {db_dir}"
            )
        try:
            for root, dirs, files in os.walk(db_dir):
                os.chmod(root, 0o755)
                for d in dirs:
                    os.chmod(os.path.join(root, d), 0o755)
                for f in files:
                    os.chmod(os.path.join(root, f), 0o644)
            logger.info(f"Fixed permissions for database files in {db_dir}")
        except Exception as perm_error:
            logger.error(f"Failed to fix database permissions: {perm_error}")
            raise PermissionError(
                f"Database directory {db_dir} is readonly. "
                f"Please run: chmod -R 755 {db_dir} or check file ownership."
            )

    def delete_by_document_id(self, document_id: str, collection_name: Optional[str] = None) -> bool:
        """Delete by document_id. When ``collection_name`` is None we delete across
        every known collection so the caller doesn't need to know which model
        owns the chunks (used when the user removes a document outright)."""
        targets: List[str] = []
        if collection_name:
            targets = [collection_name]
        else:
            try:
                targets = self.list_known_collections() or ["rag_collection"]
            except Exception:
                targets = ["rag_collection"]

        any_ok = False
        for name in targets:
            try:
                coll = self.get_collection(name)
                coll.delete(where={"document_id": document_id})
                any_ok = True
            except Exception as e:
                logger.error(
                    f"Error deleting embeddings for {document_id} from collection {name}: {e}"
                )
        if any_ok:
            logger.info(
                f"Deleted embeddings for document_id={document_id} across {len(targets)} collection(s)"
            )
        return any_ok

    def get_chunks_by_document_id(self, document_id: str) -> List[dict]:
        """Return all chunks for a document across all known collections, sorted by chunk_index."""
        targets: List[str]
        try:
            targets = self.list_known_collections() or ["rag_collection"]
        except Exception:
            targets = ["rag_collection"]

        seen_ids: set = set()
        chunks: List[dict] = []
        for name in targets:
            try:
                coll = self.get_collection(name)
                result = coll.get(
                    where={"document_id": document_id},
                    include=["documents", "metadatas"],
                )
                ids = result.get("ids") or []
                texts = result.get("documents") or []
                metas = result.get("metadatas") or []
                for cid, text, meta in zip(ids, texts, metas):
                    if cid not in seen_ids:
                        seen_ids.add(cid)
                        chunks.append({"text": text or "", "metadata": meta or {}})
            except Exception as e:
                logger.warning("get_chunks_by_document_id failed for collection %s: %s", name, e)

        chunks.sort(key=lambda c: c["metadata"].get("chunk_index", 0))
        return chunks

    def delete_by_source_file_exact(
        self, source_file_basename: str, collection_name: Optional[str] = None
    ) -> bool:
        """Delete chunks whose metadata source_file equals the basename (no full scan)."""
        targets: List[str] = (
            [collection_name]
            if collection_name
            else (self.list_known_collections() or ["rag_collection"])
        )
        any_ok = False
        for name in targets:
            try:
                coll = self.get_collection(name)
                coll.delete(where={"source_file": source_file_basename})
                any_ok = True
            except Exception as e:
                logger.error(
                    "Error deleting embeddings for source_file=%s in %s: %s",
                    source_file_basename,
                    name,
                    e,
                )
        if any_ok:
            logger.info(
                "Deleted embeddings for source_file=%s across %s collection(s)",
                source_file_basename,
                len(targets),
            )
        return any_ok

    def delete_by_source_file_pattern(self, pattern: str, collection_name: Optional[str] = None) -> bool:
        """
        Delete embeddings by source_file pattern (e.g., 'crawl_export_{source_id}_%').
        When ``collection_name`` is None the deletion is applied across every
        known collection. ChromaDB does not support pattern matching in where
        clauses so we filter in Python after fetching ids+metadatas.
        """
        targets: List[str] = [collection_name] if collection_name else (self.list_known_collections() or ["rag_collection"])
        pattern_prefix = pattern.replace("%", "")
        all_ok = True

        for name in targets:
            try:
                coll = self.get_collection(name)
                all_results = coll.get(limit=100000, include=["metadatas"])
                if not all_results or not all_results.get("ids"):
                    continue

                matching_ids: List[str] = []
                metadatas = all_results.get("metadatas", []) or []
                ids = all_results.get("ids", []) or []
                for idx, metadata in enumerate(metadatas):
                    if metadata and "source_file" in metadata:
                        source_file = metadata.get("source_file", "")
                        if source_file.startswith(pattern_prefix):
                            matching_ids.append(ids[idx])

                if not matching_ids:
                    continue

                coll.delete(ids=matching_ids)
                logger.info(
                    f"Deleted {len(matching_ids)} embeddings for source_file pattern '{pattern}' in {name}"
                )
            except Exception as e:
                logger.error(
                    f"Error deleting embeddings for source_file pattern {pattern} in {name}: {e}"
                )
                all_ok = False

        return all_ok

    def delete_by_project_id(self, project_id: str, collection_name: Optional[str] = None) -> bool:
        """Delete project's vectors. By default sweeps every known collection."""
        targets: List[str] = [collection_name] if collection_name else (self.list_known_collections() or ["rag_collection"])
        any_ok = False
        for name in targets:
            try:
                coll = self.get_collection(name)
                coll.delete(where={"project_id": str(project_id)})
                any_ok = True
            except Exception as e:
                logger.error(
                    f"Error deleting embeddings for project_id {project_id} in {name}: {e}"
                )
        if any_ok:
            logger.info(
                f"Deleted embeddings for project_id={project_id} across {len(targets)} collection(s)"
            )
        return any_ok

    @staticmethod
    def _sanitize_chroma_metadata(meta: Dict[str, Any]) -> Dict[str, Any]:
        """Sanitize metadata to ensure all values are ChromaDB-compatible types."""
        sanitized: Dict[str, Any] = {}
        for key, value in meta.items():
            key_str = str(key)
            if value is None:
                sanitized[key_str] = ""
            elif isinstance(value, (str, int, float, bool)):
                if isinstance(value, str) and len(value) > 1000:
                    sanitized[key_str] = value[:1000]
                else:
                    sanitized[key_str] = value
            else:
                sanitized[key_str] = str(value)[:1000]
        return sanitized

    def _chroma_ingest_batch_size(self) -> int:
        configured = int(getattr(settings, "chroma_ingest_batch_size", 0) or 0)
        if configured > 0:
            return configured
        client_max = 5000
        try:
            if hasattr(self.client, "get_max_batch_size"):
                client_max = int(self.client.get_max_batch_size())
            else:
                client_max = int(getattr(self.client, "max_batch_size", 5000))
        except Exception:
            pass
        # HTTP Chroma rejects large JSON bodies (~10MB); count-only batching is unsafe.
        if self._http_mode:
            return max(1, min(50, client_max))
        return max(1, min(5000, client_max))

    @staticmethod
    def _is_chroma_payload_too_large(exc: Exception) -> bool:
        msg = str(exc).lower()
        return (
            "payload too large" in msg
            or "content length exceeded" in msg
            or "request entity too large" in msg
        )

    def _build_chunk_metadatas(
        self,
        batch_documents: List[str],
        *,
        batch_start: int,
        document_id: str,
        source_file: str,
        chunk_metadata: Optional[List[Dict[str, Any]]],
        user_id: Optional[int],
        project_id: Optional[str],
    ) -> List[Dict[str, Any]]:
        metadatas: List[Dict[str, Any]] = []
        for idx, doc_text in enumerate(batch_documents):
            chunk_idx = batch_start + idx
            if chunk_metadata and chunk_idx < len(chunk_metadata):
                meta = dict(chunk_metadata[chunk_idx])
                meta["document_id"] = str(document_id)
                meta["source_file"] = str(os.path.basename(source_file))[:500]
                if user_id is not None:
                    meta["user_id"] = int(user_id)
                if project_id is not None:
                    meta["project_id"] = str(project_id)
            else:
                url_pattern = r"https?://[^\s,<>'\")]+|www\.[^\s,<>'\")]+"
                found_urls = re.findall(url_pattern, doc_text)
                url = normalize_url(found_urls[0]) if found_urls else ""
                if not url.startswith(("http://", "https://", "file://")):
                    url = f"file://{os.path.basename(source_file)}"
                title = os.path.splitext(os.path.basename(source_file))[0]
                meta = {
                    "document_id": str(document_id),
                    "source_file": str(os.path.basename(source_file))[:500],
                    "title": str(_as_primitive(title))[:500] if title else "",
                    "url": str(_as_primitive(url))[:1000] if url else "",
                    "keywords": "",
                    "chunk_index": int(chunk_idx),
                }
                if user_id is not None:
                    meta["user_id"] = int(user_id)
                if project_id is not None:
                    meta["project_id"] = str(project_id)
            metadatas.append(self._sanitize_chroma_metadata(meta))
        return metadatas

    def _chroma_add_with_retries(
        self,
        target_collection,
        *,
        batch_documents: List[str],
        batch_embeddings: List[List[float]],
        batch_ids: List[str],
        metadatas: List[Dict[str, Any]],
        collection_metric: str,
        source_file: str,
        batch_label: str,
    ) -> None:
        max_retries = 3
        retry_delay = 0.5
        last_error: Optional[Exception] = None

        for attempt in range(max_retries):
            try:
                target_collection.add(
                    documents=batch_documents,
                    embeddings=batch_embeddings,
                    ids=batch_ids,
                    metadatas=metadatas,
                )
                logger.info(
                    f"Ingested {batch_label} ({len(batch_documents)} chunks) from "
                    f"{os.path.basename(source_file)} -> {target_collection.name}"
                )
                return
            except Exception as e:
                last_error = e
                error_str = str(e).lower()

                if self._is_chroma_payload_too_large(e):
                    if len(batch_documents) <= 1:
                        raise
                    mid = len(batch_documents) // 2
                    logger.warning(
                        f"Chroma payload too large for {len(batch_documents)} chunks; "
                        f"splitting into {mid} + {len(batch_documents) - mid}"
                    )
                    self._chroma_add_with_retries(
                        target_collection,
                        batch_documents=batch_documents[:mid],
                        batch_embeddings=batch_embeddings[:mid],
                        batch_ids=batch_ids[:mid],
                        metadatas=metadatas[:mid],
                        collection_metric=collection_metric,
                        source_file=source_file,
                        batch_label=f"{batch_label} (split 1/2)",
                    )
                    self._chroma_add_with_retries(
                        target_collection,
                        batch_documents=batch_documents[mid:],
                        batch_embeddings=batch_embeddings[mid:],
                        batch_ids=batch_ids[mid:],
                        metadatas=metadatas[mid:],
                        collection_metric=collection_metric,
                        source_file=source_file,
                        batch_label=f"{batch_label} (split 2/2)",
                    )
                    return

                if "readonly" in error_str:
                    self._fix_permissions_if_readonly()
                elif "compaction" in error_str or "metadata segment" in error_str:
                    logger.warning(
                        f"ChromaDB compaction error on attempt {attempt + 1}/{max_retries}, "
                        f"retrying in {retry_delay}s..."
                    )
                    time.sleep(retry_delay * (attempt + 1))
                    try:
                        target_collection = self.client.get_or_create_collection(
                            name=target_collection.name,
                            metadata={"hnsw:space": collection_metric or "cosine"},
                        )
                        self._collections[target_collection.name] = target_collection
                        if target_collection.name == "rag_collection":
                            self.collection = target_collection
                    except Exception as reset_error:
                        logger.warning(f"Failed to reset collection: {reset_error}")
                else:
                    logger.error(f"Error ingesting {batch_label}: {e}")
                    raise

                if attempt == max_retries - 1:
                    logger.error(
                        f"Failed to ingest {batch_label} after {max_retries} attempts: {last_error}"
                    )
                    raise last_error

    def ingest(
        self,
        texts: List[str],
        embeddings: List[List[float]],
        document_id: str,
        source_file: str,
        chunk_metadata: Optional[List[Dict[str, Any]]] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
        collection_metric: str = "cosine",
    ):
        target_collection = self.get_collection(collection_name, metric=collection_metric)
        batch_size = self._chroma_ingest_batch_size()
        total_items = min(len(texts), len(embeddings))
        if len(texts) != len(embeddings):
            logger.warning(
                f"Text/embedding length mismatch for ingest: texts={len(texts)}, "
                f"embeddings={len(embeddings)}. Using first {total_items} items."
            )

        for batch_start in range(0, total_items, batch_size):
            batch_end = min(batch_start + batch_size, total_items)
            batch_documents = texts[batch_start:batch_end]
            batch_embeddings = embeddings[batch_start:batch_end]
            batch_ids = [str(uuid.uuid4()) for _ in range(batch_end - batch_start)]
            metadatas = self._build_chunk_metadatas(
                batch_documents,
                batch_start=batch_start,
                document_id=document_id,
                source_file=source_file,
                chunk_metadata=chunk_metadata,
                user_id=user_id,
                project_id=project_id,
            )
            batch_num = batch_start // batch_size + 1
            self._chroma_add_with_retries(
                target_collection,
                batch_documents=batch_documents,
                batch_embeddings=batch_embeddings,
                batch_ids=batch_ids,
                metadatas=metadatas,
                collection_metric=collection_metric,
                source_file=source_file,
                batch_label=f"batch {batch_num}",
            )

        logger.info(
            f"Successfully ingested all {total_items} chunks from "
            f"{os.path.basename(source_file)} with document_id: {document_id}"
        )

    def query(
        self,
        embedding: List[float],
        top_k: int = DEFAULT_TOP_K,
        source_file: Optional[str] = None,
        document_id: Optional[str] = None,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
    ):
        from .singleton import chroma_read_lock

        target_collection = self.get_collection(collection_name)
        query_args: Dict[str, Any] = {
            "query_embeddings": [embedding],
            "n_results": top_k,
            "include": ["documents", "distances", "metadatas"],
        }
        conditions: List[Dict[str, Any]] = []
        if source_file:
            conditions.append({"source_file": source_file})
        if document_id:
            conditions.append({"document_id": document_id})
        if user_id is not None:
            conditions.append({"user_id": user_id})
        if project_id is not None:
            # Ensure project_id is always a string for ChromaDB
            conditions.append({"project_id": str(project_id)})
        
        # ChromaDB requires $and operator when multiple conditions exist
        if len(conditions) == 1:
            query_args["where"] = conditions[0]
        elif len(conditions) > 1:
            query_args["where"] = {"$and": conditions}

        with chroma_read_lock(collection_name):
            res = target_collection.query(**query_args)
        documents = res.get("documents", [[]])[0]
        metadatas = res.get("metadatas", [[]])[0]
        distances = res.get("distances", [[]])[0]
        document_ids = [m.get("document_id", "unknown") if m else "unknown" for m in metadatas]
        return documents, document_ids, metadatas, distances

    def count(
        self,
        user_id: Optional[int] = None,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> int:
        """Count documents with optional filters for user_id and project_id.

        When ``collection_name`` is omitted this targets the default
        ``rag_collection`` so behavior matches the pre-refactor world. Callers
        that need a per-model count should pass the collection explicitly.
        """
        try:
            target_collection = self.get_collection(collection_name)
            if user_id is None and project_id is None:
                # No filters - count all documents in the target collection
                return int(target_collection.count())

            # Build where clause for filtered count
            conditions: List[Dict[str, Any]] = []
            if user_id is not None:
                conditions.append({"user_id": user_id})
            if project_id is not None:
                conditions.append({"project_id": str(project_id)})

            if len(conditions) == 1:
                where_clause = conditions[0]
            elif len(conditions) > 1:
                where_clause = {"$and": conditions}
            else:
                return int(target_collection.count())

            # Avoid fetching huge ID sets (can trigger SQLite variable limits).
            # For call sites that only need "has docs?" semantics, existence check is enough.
            result = target_collection.get(where=where_clause, limit=1, include=[])
            ids = result.get("ids", [])
            return 1 if ids else 0
        except Exception as e:
            logger.warning(
                "Error counting documents with filters "
                f"(user_id={user_id}, project_id={project_id}, collection={collection_name}): {e}"
            )
            # Fallback: return 0 if filtering fails (safer than returning total count)
            return 0

    def count_filtered_exact(
        self,
        project_id: Optional[str] = None,
        collection_name: Optional[str] = None,
    ) -> int:
        """Return the exact number of vectors for a project in a collection.

        Used by the embedding-status endpoint where we want a real number, not
        the 0/1 existence check that ``count()`` returns. Falls back to the
        existence check if the precise count is too expensive to compute.
        """
        try:
            target_collection = self.get_collection(collection_name)
            if not project_id:
                return int(target_collection.count())

            # Per-project collections (proj_<uuid>__…) only hold one project's
            # vectors — collection.count() is exact and avoids paginated gets
            # that made embedding-status hang for large indexes.
            coll_name = (collection_name or getattr(target_collection, "name", "") or "").strip()
            if coll_name.startswith("proj_"):
                return int(target_collection.count())

            # Shared/legacy collections still need a filtered walk.
            total = 0
            offset = 0
            batch = 2000
            while True:
                result = target_collection.get(
                    where={"project_id": str(project_id)},
                    include=[],
                    limit=batch,
                    offset=offset,
                )
                ids = result.get("ids", []) or []
                total += len(ids)
                if len(ids) < batch:
                    break
                offset += len(ids)
            return total
        except Exception as exc:
            logger.warning(
                f"count_filtered_exact failed for project_id={project_id} collection={collection_name}: {exc}"
            )
            return 0


# ---------------- Retriever ----------------
class Retriever:
    def __init__(self, vdb: ChromaVDB, embedder: EmbedData, default_top_k: int = DEFAULT_TOP_K):
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
    def _extract_keywords(query: str) -> List[str]:
        """Extract high-value non-stop-word tokens (min 3 chars) from query."""
        stop_words = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'could', 'may', 'might', 'must', 'can', 'if', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'i', 'you', 'he', 'she', 'it',
            'we', 'they', 'what', 'when', 'where', 'why', 'how', 'who', 'which',
            'this', 'that', 'these', 'those', 'and', 'or', 'but', 'not', 'no',
            'so', 'yet', 'both', 'either', 'neither', 'just', 'also', 'very',
        }
        tokens = re.findall(r'\b\w+\b', query.lower())
        seen: set = set()
        result: List[str] = []
        for t in tokens:
            if t not in stop_words and len(t) >= 3 and t not in seen:
                seen.add(t)
                result.append(t)
        return result[:10]

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
    ) -> Tuple[List[str], List[str], List[Any], List[float]]:
        """
        Tier 2 keyword retrieval.
        Fetches project-scoped chunks from ChromaDB (max TIER2_MAX_FETCH_CHUNKS),
        scores them by keyword match, and returns the top_k qualifying results.
        Returns same 4-tuple shape as ChromaVDB.query().
        """
        keywords = self._extract_keywords(query)
        if not keywords:
            return [], [], [], []

        score_floor = keyword_score_floor if keyword_score_floor is not None else TIER2_KEYWORD_SCORE_FLOOR

        conditions: List[Dict[str, Any]] = []
        if user_id is not None:
            conditions.append({"user_id": user_id})
        if project_id is not None:
            conditions.append({"project_id": str(project_id)})

        fetch_kwargs: Dict[str, Any] = {
            "limit": min(fetch_limit or TIER2_MAX_FETCH_CHUNKS, TIER2_MAX_FETCH_CHUNKS),
            "include": ["documents", "metadatas"],
        }
        if len(conditions) == 1:
            fetch_kwargs["where"] = conditions[0]
        elif len(conditions) > 1:
            fetch_kwargs["where"] = {"$and": conditions}

        from .singleton import chroma_read_lock

        with chroma_read_lock(collection_name):
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

    @staticmethod
    def _chunk_dedup_key(doc: str, meta: Any) -> str:
        """Stable identity for a chunk across the two retrieval lists.

        Prefer (document_id, chunk_index) when both are present in metadata; fall
        back to a hash of the leading characters so semantic and keyword hits on
        the same chunk collapse to a single fused row.
        """
        if isinstance(meta, dict):
            doc_id = meta.get("document_id")
            chunk_idx = meta.get("chunk_index")
            if doc_id is not None and chunk_idx is not None:
                return f"{doc_id}:{chunk_idx}"
        body = (doc or "")[:200].strip().lower()
        return hashlib.sha1(body.encode("utf-8")).hexdigest()

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
          - semantic: 1 - cosine_distance (chromadb cosine metric; lower dist = more similar)
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
        ce = get_cross_encoder()
        if ce is None:
            return docs, doc_ids, metas, distances, False

        try:
            pairs = [(query, d or "") for d in docs]
            raw_scores = ce.predict(pairs, show_progress_bar=False, convert_to_numpy=True)
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
    ):
        retrieve_start = time.perf_counter()
        k = top_k or self.default_top_k
        active_embedder = embedder or self.embedder

        file_extensions = ['.pdf', '.txt', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.csv', '.md']
        looks_like_filename = any(query.lower().endswith(ext) for ext in file_extensions) or \
                             any(ext in query.lower() for ext in file_extensions)

        common_stop_words = {
            'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should',
            'could', 'may', 'might', 'must', 'can', 'if', 'in', 'on', 'at', 'to',
            'for', 'of', 'with', 'by', 'from', 'as', 'i', 'you', 'he', 'she', 'it',
            'we', 'they', 'what', 'when', 'where', 'why', 'how', 'who', 'which'
        }

        query_words = query.strip().split()
        meaningful_words = [word.lower() for word in query_words if word.lower() not in common_stop_words]
        q_lower = query.strip().lower()

        # Natural-language questions (with or without "?") are not "open document X".
        _question_prefixes = (
            "what is ", "what are ", "what was ", "who is ", "who are ",
            "how is ", "how are ", "how do ", "how does ", "how can ",
            "why is ", "why are ", "where is ", "where are ", "when is ",
            "when did ", "which is ", "can you ", "tell me ", "explain ",
        )
        looks_like_question = (
            "?" in query
            or any(q_lower.startswith(p) for p in _question_prefixes)
        )

        # Single-token queries (e.g. brand names "nitsan", "t3planet") are entity search,
        # not "open the document called X". Treating them as filenames mis-frames the LLM prompt.
        single_token_entity = len(query_words) == 1 and len(meaningful_words) == 1
        looks_like_doc_name = (
            len(query_words) <= 3 and
            len(meaningful_words) >= 1 and
            len(query) <= 50 and
            not looks_like_filename and
            not looks_like_question and
            not any(char in query for char in [':', ';', '!'])
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

        def _run_semantic():
            query_vector = active_embedder.embed_model.get_text_embedding(enhanced_query)
            return self.vdb.query(
                query_vector,
                top_k=k,
                source_file=source_file,
                document_id=document_id,
                user_id=user_id,
                project_id=project_id,
                collection_name=collection_name,
            )

        keyword_fetch_limit = min(max(k * 30, 250), TIER2_MAX_FETCH_CHUNKS)
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
            if collection_size >= TIER2_LARGE_COLLECTION_THRESHOLD:
                keyword_fetch_limit = min(keyword_fetch_limit, TIER2_LARGE_COLLECTION_FETCH_CHUNKS)
                logger.info(
                    "VectorService: large collection (%s vectors) — keyword fetch capped to %s",
                    collection_size,
                    keyword_fetch_limit,
                )
        except Exception as exc:
            logger.debug("VectorService: collection size check skipped: %s", exc)

        def _run_keyword():
            if not enable_keyword_fallback:
                return [], [], [], []
            return self._keyword_retrieve(
                query,
                k,
                user_id,
                project_id,
                keyword_score_floor,
                fetch_limit=keyword_fetch_limit,
                collection_name=collection_name,
            )

        executor = concurrent.futures.ThreadPoolExecutor(max_workers=2)
        try:
            sem_future = executor.submit(_run_semantic)
            kw_future = executor.submit(_run_keyword)

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
                logger.warning(
                    "VectorService: Semantic side timeout",
                    extra={"tier": 1, "reason": sem_reason},
                )
            except Exception as exc:
                sem_failed = True
                sem_reason = "embed_error"
                logger.warning(
                    f"VectorService: Semantic side error ({exc})",
                    extra={"tier": 1, "reason": sem_reason},
                )

            try:
                kw_result = kw_future.result(timeout=KEYWORD_RETRIEVAL_TIMEOUT_SECONDS)
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
        finally:
            executor.shutdown(wait=False, cancel_futures=True)

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
        if not sem_docs and not kw_docs:
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
            }
            _stamp_retrieval_meta_timings(tier3_meta, retrieve_start)
            return [], [], [], [], tier3_meta

        # === Backwards-compat: keyword fallback explicitly disabled ===
        # When the caller opts out of keyword, return semantic results unchanged
        # (no RRF, no rerank). Preserves the old `enable_keyword_fallback=False`
        # contract that some chat paths depend on.
        if not enable_keyword_fallback:
            sims = [max(0.0, 1.0 - d) for d in sem_dists] if sem_dists else []
            kw_off_meta = {
                "tier_used": 1 if sem_docs else 3,
                "confidence_score": round(sims[0] * 100) if sims else 0,
                "top1_similarity": round(tier1_conf.get("top1_sim", 0.0) * 100),
                "top3_mean_similarity": round(tier1_conf.get("top3_mean_sim", 0.0) * 100),
                "lexical_overlap": round(tier1_conf.get("lexical_overlap", 1.0) * 100),
                "fallback_reason": "ok" if sem_docs else (sem_reason or "no_docs"),
                "semantic_count": len(sem_docs),
                "keyword_count": 0,
                "fused_count": len(sem_docs),
                "reranked": False,
            }
            _stamp_retrieval_meta_timings(kw_off_meta, retrieve_start)
            return sem_docs, sem_ids, sem_metas, sem_dists, kw_off_meta

        # === Hybrid Score Fusion (cosine similarity + keyword coverage, weighted) ===
        if kw_docs:
            fused_docs, fused_ids, fused_metas, fused_dists = self._hybrid_fuse(
                (sem_docs, sem_ids, sem_metas, sem_dists),
                (kw_docs, kw_ids, kw_metas, kw_dists),
                top_k=k,
            )
            logger.info(
                "VectorService: Hybrid fusion (cosine+keyword) → %d chunks "
                "(sem=%d kw=%d)",
                len(fused_docs), len(sem_docs), len(kw_docs),
            )
        else:
            fused_docs, fused_ids, fused_metas, fused_dists = sem_docs, sem_ids, sem_metas, sem_dists

        # === Optional cross-encoder rerank (gated by use_reranker flag) ===
        reranked = False
        rerank_skipped_reason = None
        rerank_ms: Optional[int] = None
        t_rerank = time.perf_counter()
        if use_reranker and fused_docs and len(fused_docs) >= CE_RERANK_MIN_CANDIDATES:
            ce_input_n = min(len(fused_docs), CE_RERANK_CANDIDATES)
            (
                rerank_docs, rerank_ids, rerank_metas, rerank_dists, did_rerank
            ) = self._cross_encoder_rerank(
                query,
                fused_docs[:ce_input_n],
                fused_ids[:ce_input_n],
                fused_metas[:ce_input_n],
                fused_dists[:ce_input_n],
                top_k=k,
            )
            if did_rerank:
                fused_docs, fused_ids, fused_metas, fused_dists = (
                    rerank_docs, rerank_ids, rerank_metas, rerank_dists
                )
                reranked = True
                rerank_ms = _elapsed_ms_since(t_rerank)
                logger.info(
                    f"VectorService: Cross-encoder rerank applied to {ce_input_n} candidates"
                )
        elif use_reranker and fused_docs and len(fused_docs) < CE_RERANK_MIN_CANDIDATES:
            rerank_skipped_reason = "low_candidates"
            logger.info(
                "VectorService: Cross-encoder rerank skipped "
                f"(fused_count={len(fused_docs)} < min={CE_RERANK_MIN_CANDIDATES})"
            )
        elif use_reranker and not fused_docs:
            rerank_skipped_reason = "no_candidates"

        # === Build retrieval_meta ===
        # tier_used stays an integer for backwards compatibility with the LLM
        # extractive-fallback path (RAG.query reads this and switches on 1 vs 2).
        # 1 = semantic-driven result, 2 = keyword-only fallback, 3 = empty pool.
        sims = [max(0.0, 1.0 - d) for d in fused_dists] if fused_dists else []
        tier_used = 1 if sem_docs else 2
        retrieval_meta = {
            "tier_used": tier_used,
            "confidence_score": round(sims[0] * 100) if sims else 0,
            "top1_similarity": round(tier1_conf.get("top1_sim", 0.0) * 100),
            "top3_mean_similarity": round(tier1_conf.get("top3_mean_sim", 0.0) * 100),
            "lexical_overlap": round(tier1_conf.get("lexical_overlap", 1.0) * 100),
            "fallback_reason": "ok" if sem_docs else sem_reason,
            "semantic_count": len(sem_docs),
            "keyword_count": len(kw_docs),
            "fused_count": len(fused_docs),
            "reranked": reranked,
            "rerank_skipped_reason": rerank_skipped_reason,
        }
        _stamp_retrieval_meta_timings(retrieval_meta, retrieve_start, rerank_ms)
        return fused_docs, fused_ids, fused_metas, fused_dists, retrieval_meta


def _elapsed_ms_since(start: float) -> int:
    return max(0, int((time.perf_counter() - start) * 1000))


def _stamp_retrieval_meta_timings(
    meta: Dict[str, Any],
    retrieve_start: float,
    rerank_ms: Optional[int] = None,
) -> None:
    """Attach retrieval_ms / reranking_ms to retrieval_meta (mutates meta)."""
    if rerank_ms is not None and rerank_ms > 0:
        meta["reranking_ms"] = rerank_ms
        meta["retrieval_ms"] = max(0, _elapsed_ms_since(retrieve_start) - rerank_ms)
    else:
        meta["reranking_ms"] = None
        meta["retrieval_ms"] = _elapsed_ms_since(retrieve_start)


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
        self.retriever = retriever
        self.llm = Ollama(model=llm_model, request_timeout=timeout, keep_alive="1h", context_window=8192)
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
        if local_key in self._query_cache:
            logger.info(f"Cache hit (Local) for query.")
            return self._query_cache[local_key]

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
                    return result
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
        if summary.startswith("LLM failed to respond"):
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

        self._query_cache[local_key] = result
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

    def _extract_meaningful_snippet(
        self, context: str, query: str = "", max_length: int = 350
    ) -> str:
        if not context or not context.strip():
            return ""

        cleaned = re.sub(r"\[Document \d+.*?\]", "", context)
        cleaned = re.sub(r"CITE:\d+", "", cleaned)
        cleaned = re.sub(r"\[\d+\]", "", cleaned).strip()
        if not cleaned:
            return ""

        if len(cleaned) <= max_length:
            return cleaned

        query_terms = [t for t in query.lower().split() if len(t) > 2] if query else []
        sentences = re.split(r"[.!?]\s+", cleaned)
        best_sentence = None
        best_score = 0

        for s in sentences:
            s = s.strip()
            if len(s) < 20:
                continue
            score = sum(1 for t in query_terms if t in s.lower()) if query_terms else 0
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
        message (search) or optional extractive fallback (chat with strong retrieval).
        Search never dumps raw chunks into the user-facing answer.
        """
        if not self._is_out_of_context_response(raw_response):
            return raw_response

        meta = retrieval_meta or {}
        retrieval_confidence = int(meta.get("confidence_score", 0) or 0)
        tier_used = int(meta.get("tier_used", 1) or 1)

        if mode == "search":
            # Never dump raw retrieved chunks into Search Test / widget answers.
            use_extractive_fallback = False
        else:
            # Chat: only extractive when retrieval is strong — weak ZIP-noise
            # hits must not become fake answers.
            min_conf = max(EXTRACTIVE_FALLBACK_MIN_CONFIDENCE_PCT, 70)
            use_extractive_fallback = (
                bool(non_empty_contexts)
                and tier_used == 1
                and retrieval_confidence >= min_conf
            )

        logger.info(
            "LLM returned out-of-context. tier=%s, confidence=%s%%. extractive_fallback=%s mode=%s",
            tier_used,
            retrieval_confidence,
            use_extractive_fallback,
            mode,
        )

        cleaned_raw = raw_response.replace(self.OUT_OF_CONTEXT_SENTINEL, "").strip()
        if system_prompt and cleaned_raw and not self._is_out_of_context_response(cleaned_raw):
            return self._clean_response_text(cleaned_raw, format_type=format_type)
        if system_prompt and not cleaned_raw:
            return self._extract_custom_ooc_reply(system_prompt) or self.OUT_OF_CONTEXT_MSG

        if use_extractive_fallback:
            fallback = self._build_context_fallback_answer(
                user_query, non_empty_contexts, max_tokens=max_tokens
            )
            if fallback and not self._is_out_of_context_response(fallback):
                logger.info("Extractive fallback applied after OOC signal.")
                return self._clean_response_text(fallback, format_type=format_type)
            # Last resort: return top snippets even with weak lexical overlap.
            snippets: List[str] = []
            for ctx in non_empty_contexts[:3]:
                cleaned_ctx = re.sub(r"\[Document\s+\d+.*?\]|\s*CITE:\d+", "", ctx).strip()
                if cleaned_ctx:
                    snippets.append(cleaned_ctx[:700])
            if snippets:
                logger.info("Snippet fallback applied after OOC signal.")
                return self._clean_response_text("\n\n".join(snippets), format_type=format_type)

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

    def _search_lacks_lexical_support(self, query: str, contexts: List[str]) -> bool:
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
        scored: List[Tuple[int, str]] = []
        for ctx in contexts:
            text = (ctx or "").strip()
            if not text:
                continue
            lowered = text.lower()
            score = sum(1 for t in terms if t in lowered) if terms else 0
            if score <= 0:
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
            "You are a search assistant. Answer the user using ONLY the sources below.\n"
            "The sources are relevant — synthesize a helpful, natural answer.\n"
            "Do NOT output QUERY_OUT_OF_CONTEXT. Do NOT refuse. Do NOT paste raw source text.\n"
            f"{format_block}\n"
            f"{language_instruction}\n\n"
            f"SOURCES:\n{joined}\n\n"
            f"QUESTION: {user_query}\n"
            "ANSWER:"
        )

    def _complete_search_ooc_recovery(
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
        """One-shot recovery when search LLM emitted OOC but entity terms matched."""
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
            logger.warning("Search OOC recovery complete failed: %s", exc)
            return ""
        if not text or self._is_out_of_context_response(text):
            return ""
        return self._clean_response_text(text, format_type=format_type)

    def _build_context_fallback_answer(
        self,
        query: str,
        contexts: List[str],
        max_tokens: Optional[int] = None,
    ) -> str:
        """
        Build a lightweight extractive fallback when LLM incorrectly emits
        out-of-context despite retrieved chunks being available.
        """
        if not contexts:
            return self.OUT_OF_CONTEXT_MSG

        # Respect response length settings: larger token budget should produce
        # a longer fallback answer.
        is_long_response = bool(max_tokens and max_tokens >= 1000)
        max_snippets = 10 if is_long_response else 3
        snippet_len = 1100 if is_long_response else 320

        query_terms = {t for t in re.findall(r"\w+", query.lower()) if len(t) > 2}
        scored_contexts: List[Tuple[int, str]] = []
        for ctx in contexts:
            snippet = self._extract_meaningful_snippet(ctx, query=query, max_length=snippet_len)
            if not snippet:
                continue
            snippet_lower = snippet.lower()
            score = sum(1 for term in query_terms if term in snippet_lower)
            scored_contexts.append((score, snippet))

        if not scored_contexts:
            return self.OUT_OF_CONTEXT_MSG

        # Prefer snippets with lexical overlap; keep stable ordering for ties.
        # A single distinctive term (e.g. "nitsan") is enough — requiring 2+
        # caused false OOC when the query was short/focused.
        scored_contexts.sort(key=lambda x: x[0], reverse=True)
        if scored_contexts[0][0] < 1:
            return self.OUT_OF_CONTEXT_MSG
        selected: List[str] = []
        seen = set()
        for _, snippet in scored_contexts:
            # Stronger dedupe: normalize punctuation + whitespace so repeated
            # chunks with tiny formatting differences do not flood the fallback.
            key = re.sub(r"[\W_]+", " ", snippet.lower())
            key = re.sub(r"\s+", " ", key).strip()[:260]
            if key in seen:
                continue
            seen.add(key)
            selected.append(snippet)
            if len(selected) >= max_snippets:
                break
        if not selected:
            return self.OUT_OF_CONTEXT_MSG

        # Long mode should not look like a short summary list. Build a richer,
        # sectioned markdown answer from retrieved evidence.
        if is_long_response:
            lines = ["### Detailed answer from retrieved context"]
            lines.append(
                "I found relevant material in your indexed documents. Below is a consolidated long-form answer based only on the retrieved context."
            )
            lines.append("")

            for idx, snippet in enumerate(selected, 1):
                lines.append(f"#### Key point {idx}")
                lines.append(snippet)
                lines.append("")

            lines.append("### Notes")
            lines.append(
                "- This response is generated from retrieved chunks because the model returned an out-of-context signal."
            )
            lines.append(
                "- If you need a more precise answer (for example contact/address), add documents that contain explicit contact details."
            )
            return "\n".join(lines).strip()

        # Short mode: keep concise snippet list.
        lines = ["### Answer from retrieved context"]
        for snippet in selected:
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
    ) -> str:
        """
        When the LLM fails/times out but retrieval already found contexts,
        prefer an evidence-based answer over a hard failure string.
        """
        from ..llm_error_messages import format_llm_error_for_user

        contexts = [c for c in (non_empty_contexts or []) if (c or "").strip()]
        if contexts:
            if mode == "search":
                # Search fallback must stay strict and concise: avoid noisy raw snippets.
                if self._search_lacks_lexical_support(user_query, contexts):
                    return self.OUT_OF_CONTEXT_MSG

                recovery_contexts = self._top_contexts_for_search_recovery(
                    user_query, contexts, limit=3
                )
                if not recovery_contexts:
                    return self.OUT_OF_CONTEXT_MSG

                snippets: List[str] = []
                for ctx in recovery_contexts:
                    snippet = self._extract_meaningful_snippet(
                        ctx, query=user_query, max_length=260
                    )
                    if not snippet:
                        continue
                    cleaned = re.sub(r"\s+", " ", snippet).strip()
                    if cleaned:
                        snippets.append(cleaned)
                if not snippets:
                    return self.OUT_OF_CONTEXT_MSG

                # Build display-format-native fallback to avoid raw markdown artifacts in html mode.
                lead = "I found relevant information in your indexed sources."
                if format_type == "html_long":
                    items = "".join(
                        f"<li><strong>Detail:</strong> {s}</li>" for s in snippets[:3]
                    )
                    marked_lead = f"<mark>{lead}</mark>"
                    answer = (
                        f"<p>{marked_lead}</p>"
                        f"<h2>Key Details</h2><ul>{items}</ul>"
                        "<p>These points are drawn from your indexed sources and cover the main "
                        "details available for this question.</p>"
                    )
                else:
                    bullets = "\n".join(f"- {s}" for s in snippets[:3])
                    answer = f"### Answer from retrieved context\n{bullets}"
                return self._clean_response_text(answer, format_type=format_type)

            # Chat: prefer extractive evidence when query terms appear in retrieved chunks.
            if not self._search_lacks_lexical_support(user_query, contexts):
                extractive = self._build_context_fallback_answer(
                    user_query, contexts, max_tokens=max_tokens
                )
                if (
                    extractive
                    and extractive.strip()
                    and extractive.strip() != self.OUT_OF_CONTEXT_MSG
                    and not self._is_out_of_context_response(extractive)
                ):
                    logger.info(
                        "LLM failure fallback: using extractive answer (mode=%s, contexts=%d)",
                        mode,
                        len(contexts),
                    )
                    return self._clean_response_text(extractive, format_type=format_type)

                # Last resort: top cleaned snippets so Search still answers with sources.
                snippets: List[str] = []
                for ctx in contexts[:3]:
                    cleaned_ctx = re.sub(
                        r"\[Document\s+\d+.*?\]|\s*CITE:\d+", "", ctx
                    ).strip()
                    if cleaned_ctx:
                        snippets.append(cleaned_ctx[:700])
                if snippets:
                    logger.info(
                        "LLM failure fallback: using snippet answer (mode=%s)",
                        mode,
                    )
                    return self._clean_response_text(
                        "\n\n".join(snippets), format_type=format_type
                    )

        if exc is not None:
            return format_llm_error_for_user(exc)
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
    def _retrieval_query_for_user_query(user_query: str) -> str:
        """
        Expand geographic location questions so hybrid retrieval prefers HQ/address chunks
        over generic brand mentions. The LLM still sees the original user question.
        """
        q = (user_query or "").strip()
        if not q:
            return q
        if re.search(
            r"(?i)\b(where|wo)\b.{0,100}\b("
            r"located|location|gelegen|liegt|ansässig|ansassig|based|"
            r"headquarter|headquarters|hq|office|standort|adresse|address"
            r")\b"
            r"|\b(headquarter|headquarters|office location|standort|adresse)\b",
            q,
        ):
            return f"{q} headquarters office address city based in"
        return q

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

        from .language_config import build_language_instruction

        language_instruction = build_language_instruction(language_code)

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
                f"zero relevant content for the question. If ANY document has ANY related information, "
                f"answer with what is available — even partial answers are better than refusing."
            )

        relevance_guidelines = (
            "RELEVANCE GUIDELINES:\n"
            "- Focus on information directly related to the question.\n"
            "- Treat partial name matches as valid: if the user asks about 'NITSAN tech' and documents "
            "mention 'NITSAN', that IS relevant — answer using what you found.\n"
            "- Include partial or indirect answers if relevant.\n"
            "- Extract and present clearly even if buried in context.\n"
            "- NEVER begin your answer with 'The provided documents do not contain' or similar phrases "
            "when the documents DO contain partial or related information.\n"
            "- If documents only partially cover the topic, lead with what IS known, then briefly note gaps.\n"
            "- Never write inline source markers in the answer body "
            "(no '(Source 1)', '(Sources 2, 3)', '[1]', 'CITE:1', or similar). "
            "Sources are shown separately in the UI."
        )
        asks_geographic_location = bool(
            re.search(
                r"(?i)\b(where|wo)\b.{0,100}\b("
                r"located|location|gelegen|liegt|ansässig|ansassig|based|"
                r"headquarter|headquarters|hq|office|standort|adresse|address"
                r")\b"
                r"|\b(headquarter|headquarters|hq|office location|company location|"
                r"standort|adresse|registered office|corporate office)\b",
                query_lc,
            )
        )
        intent_answering_rules = (
            "INTENT-FIRST ANSWERING RULES:\n"
            "- Follow the user's exact intent and requested output shape.\n"
            "- Keep answers precise and concise by default; avoid filler and repetition.\n"
            "- Use only information grounded in CONVERSATION HISTORY and/or DOCUMENTS.\n"
            "- Never invent cities, addresses, phone numbers, dates, prices, or proper names.\n"
            "- If exact information is unavailable, say so briefly using only facts that "
            "explicitly appear in the documents — do not guess from unrelated pages."
        )
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
                "State only the city/region/address that DOCUMENTS explicitly associate with that entity. "
                "If documents do not state the location, say the location is not specified in the documents. "
                "Do not infer a city from unrelated tourism, blog, or third-party pages. "
                "Do not append Link: lines or URLs."
            )

        if mode == "chat":
            persona = system_prompt or "You are a helpful AI assistant."
            history_block = ""
            if chat_history:
                history_lines = []
                for turn in chat_history:
                    role = "User" if turn.get("type") == "user" else "Assistant"
                    content = (turn.get("content") or "").strip()
                    if content:
                        history_lines.append(f"{role}: {content}")
                if history_lines:
                    history_block = "CONVERSATION HISTORY (most recent last):\n" + "\n".join(history_lines) + "\n\n"

            # Chat grounding: history is a valid answer source, not just context.
            # "Documents only" grounding breaks follow-up questions answered from prior turns.
            if history_block:
                chat_grounding = (
                    "IMPORTANT: Answer using CONVERSATION HISTORY and DOCUMENTS below. "
                    "If the answer is already present in CONVERSATION HISTORY, use it directly — "
                    "do NOT require it to also appear in DOCUMENTS. "
                    "If CONVERSATION HISTORY is about a different topic than the current question, "
                    "ignore that history and answer only from DOCUMENTS. "
                    "Do not merge unrelated prior topics into the answer. "
                    "Do not use knowledge outside of the conversation and documents. "
                    "Never reveal raw sensitive personal or financial identifiers."
                )
            else:
                chat_grounding = grounding

            if has_custom_system_prompt:
                chat_answer_policy = (
                    "PRIORITY ORDER: (1) Check CONVERSATION HISTORY — if the answer is there, use it. "
                    "(2) Check DOCUMENTS for supporting or additional information. "
                    "When neither contains anything useful, use the SYSTEM PROMPT fallback response."
                )
            else:
                chat_answer_policy = (
                    "PRIORITY ORDER: (1) Check CONVERSATION HISTORY — if the answer is there, use it. "
                    "(2) Check DOCUMENTS for supporting or additional information. "
                    f"Only output exactly {self.OUT_OF_CONTEXT_SENTINEL} when NEITHER conversation "
                    "history NOR documents contain anything useful for the question."
                )
            from ..chat_answer_links import chat_source_url_prompt_instruction

            source_url_instruction = chat_source_url_prompt_instruction()
            return f"""{persona}
{chat_grounding}{language_instruction}
{format_instructions}
{relevance_guidelines}
{intent_answering_rules}
{intent_shape_rules}
{source_url_instruction}
{chat_answer_policy}
{ooc_instruction}

{history_block}DOCUMENTS:
{combined_context}

Q: {user_query}
A:"""

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
{summary_scaffold}
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
    ) -> Dict[str, Any]:
        start_time_all = time.time()
        cache_variant = ""
        if system_prompt:
            cache_variant += f"|sp:{hashlib.sha256(system_prompt.strip().encode()).hexdigest()}"
        if llm_config:
            try:
                llm_cfg_str = json.dumps(llm_config, sort_keys=True, default=str)
            except Exception:
                llm_cfg_str = str(llm_config)
            cache_variant += f"|llm:{hashlib.sha256(llm_cfg_str.encode()).hexdigest()}"
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

        cached = self._get_cached(redis_key, local_key)
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

        if self._is_sensitive_query(user_query):
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
        
        retrieved_contexts, retrieved_doc_ids, raw_contexts_metadatas, retrieved_distances, retrieval_meta = self.retriever.retrieve(
            self._retrieval_query_for_user_query(user_query), retrieve_k, user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold,
            enable_keyword_fallback=enable_keyword_fallback,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            use_reranker=use_reranker,
            embedder=embedder,
            collection_name=collection_name,
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
        if not non_empty_contexts:
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
        if mode in ("search", "chat") and self._search_lacks_lexical_support(
            user_query, non_empty_contexts
        ):
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
                contexts_to_use = non_empty_contexts[:context_limit]
                contexts_meta_to_use = raw_contexts_metadatas_filtered[:context_limit]
                if len(non_empty_contexts) > context_limit:
                    logger.info(
                        f"📚 CONTEXT: Limiting LLM contexts to {context_limit} for chat mode "
                        f"(top_k={top_k})"
                    )
            # Add lightweight separators so LLM can distinguish chunk boundaries
            from ..chat_answer_links import source_url_line_for_context

            contexts = []
            for i, ctx in enumerate(contexts_to_use):
                meta = (
                    contexts_meta_to_use[i]
                    if i < len(contexts_meta_to_use)
                    else {}
                )
                url_line = source_url_line_for_context(meta)
                header = f"--- Passage {i + 1} ---"
                contexts.append(f"{header}\n{url_line}{ctx}" if url_line else f"{header}\n{ctx}")
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

        prompt = self._build_prompt(
            user_query, combined_context, top_k, generate_topk,
            system_prompt=system_prompt, language_code=language_code,
            mode=mode, format_type=format_type,
            chat_history=chat_history,
        )

        logger.info(f"⏱️ Context prep took: {time.time() - start_time_all:.4f}s")
        start_time_llm = time.time()
        token_usage = None
        llm_generation_ms: Optional[int] = None

        # Determine max_tokens: html_long needs more budget
        if max_tokens:
            max_tokens_val = max_tokens
        elif format_type == "html_long":
            max_tokens_val = 1200
        elif is_search_mode:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        else:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        logger.info(f"{'🔍 SEARCH' if is_search_mode else '💬 CHAT'}: Using {max_tokens_val} max_tokens (format_type={format_type})")
        llm_kwargs = {"max_tokens": max_tokens_val}

        try:
            # Determine LLM to use
            if llm_config:
                provider = llm_config.get("provider", "customllm").lower()
                # Use appropriate default model based on provider
                default_model = "gpt-oss:120b-cloud" if "custom" in provider or "ollama" in provider else "gpt-4"
                chat_model = llm_config.get("chat_model", default_model)
                api_key = llm_config.get("api_key")
                
                # Normalize provider for logic check
                if "google" in provider or "gemini" in provider:
                    provider = "gemini"
                
                # Dynamic LLM instantiation
                llm = LLMFactory.get_llm(provider, chat_model, api_key)
                
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
                    
                    gemini_kwargs = {"generation_config": {"max_output_tokens": max_tokens_val}}
                    if temperature is not None:
                        gemini_kwargs["generation_config"]["temperature"] = temperature
                    if top_p is not None:
                        gemini_kwargs["generation_config"]["top_p"] = top_p
                    
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
                llm_response = self.llm.complete(prompt, **llm_kwargs)
                
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
            }
            self._set_cached(redis_key, local_key, result)
            return result

        # ----- parse LLM output -----
        out_of_context_detected = self._is_out_of_context_response(raw_response)
        if out_of_context_detected:
            summary_text = ""
            if mode == "search" and not self._search_lacks_lexical_support(
                user_query, non_empty_contexts
            ):
                summary_text = self._complete_search_ooc_recovery(
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
            refined_answers: List[str] = []
            urls_from_llm: List[str] = []
        else:
            summary_section = self._extract_section(
                raw_response, "SUMMARY:", ["REFINED_ANSWERS", "RELEVANT_URLS"]
            )
            summary_text = self._clean_response_text(summary_section, format_type=format_type)
            if not summary_text.strip():
                summary_text = self._clean_response_text(raw_response, format_type=format_type)

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
    ):
        """
        Generator that yields (chunk_text, meta_dict) tuples.
        meta_dict is non-None only on the final sentinel chunk (done=True).
        Retrieval happens up-front; then tokens stream from the LLM.
        """
        start_time_all = time.time()

        cache_variant = ""
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
        cached = self._get_cached(redis_key, local_key)
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
                },
            )
            return

        if self._is_sensitive_query(user_query):
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

        retrieved_contexts, retrieved_doc_ids, raw_contexts_metadatas, retrieved_distances, retrieval_meta = self.retriever.retrieve(
            self._retrieval_query_for_user_query(user_query), retrieve_k, user_id=user_id, project_id=project_id,
            similarity_threshold=similarity_threshold,
            enable_keyword_fallback=enable_keyword_fallback,
            use_reranker=use_reranker,
            semantic_confidence_floor=semantic_confidence_floor,
            keyword_score_floor=keyword_score_floor,
            embedder=embedder,
            collection_name=collection_name,
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

        if not non_empty_contexts:
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
        if mode in ("search", "chat") and self._search_lacks_lexical_support(
            user_query, non_empty_contexts
        ):
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
            contexts = []
            for i, ctx in enumerate(contexts_to_use):
                meta = (
                    contexts_meta_to_use[i]
                    if i < len(contexts_meta_to_use)
                    else {}
                )
                url_line = source_url_line_for_context(meta)
                header = f"--- Passage {i + 1} ---"
                contexts.append(f"{header}\n{url_line}{ctx}" if url_line else f"{header}\n{ctx}")
        else:
            context_limit = llm_context_chunk_limit(top_k)
            contexts_to_use = non_empty_contexts[:context_limit]
            contexts_meta_to_use = raw_contexts_metadatas_filtered[:context_limit]
            if len(non_empty_contexts) > context_limit:
                logger.info(
                    f"📚 CONTEXT: Limiting stream LLM contexts to {context_limit} (top_k={top_k})"
                )
            contexts = []
            for i, ctx in enumerate(contexts_to_use):
                meta = (
                    contexts_meta_to_use[i]
                    if i < len(contexts_meta_to_use)
                    else {}
                )
                url_line = source_url_line_for_context(meta)
                header = f"--- Passage {i + 1} ---"
                contexts.append(f"{header}\n{url_line}{ctx}" if url_line else f"{header}\n{ctx}")

        MAX_CONTEXT_CHARS = _env_int("RAG_MAX_CONTEXT_CHARS", 8000)
        total_chars = 0
        final_contexts = []
        for ctx in contexts:
            if total_chars + len(ctx) > MAX_CONTEXT_CHARS:
                break
            final_contexts.append(ctx)
            total_chars += len(ctx)
        combined_context = "\n\n".join(final_contexts) if final_contexts else "\n\n".join(contexts[:3])

        # Emit retrieval metadata early so the route can send sources before LLM tokens arrive.
        yield (
            "",
            {
                "retrieval_ready": True,
                "raw_contexts": raw_contexts,
                "raw_contexts_metadatas": raw_contexts_metadatas_filtered,
                "raw_chunk_similarity_pct": raw_chunk_similarity_pct,
            },
        )

        prompt = self._build_prompt(
            user_query, combined_context, top_k, False,
            system_prompt=system_prompt, language_code=language_code,
            mode=mode, format_type=format_type,
            chat_history=chat_history,
        )

        if max_tokens:
            max_tokens_val = max_tokens
        elif format_type == "html_long":
            max_tokens_val = 1200
        elif is_search_mode:
            max_tokens_val = _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        else:
            max_tokens_val = max_tokens or _env_int("RAG_DEFAULT_MAX_TOKENS", 400)
        llm_kwargs = {"max_tokens": max_tokens_val}

        try:
            if llm_config:
                provider = llm_config.get("provider", "ollama").lower()
                if "google" in provider or "gemini" in provider:
                    provider = "gemini"
                chat_model = llm_config.get("chat_model", "gpt-oss:120b-cloud")
                api_key = llm_config.get("api_key")
                llm = LLMFactory.get_llm(provider, chat_model, api_key)
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
            while True:
                _timeout = LLM_STREAM_FIRST_TOKEN_TIMEOUT_S if _first_token else LLM_STREAM_INTER_TOKEN_TIMEOUT_S
                try:
                    chunk = _stream_q.get(timeout=_timeout)
                except queue.Empty:
                    label = "first token" if _first_token else "inter-token"
                    logger.warning("LLM stream %s timeout (%.0fs) — aborting", label, _timeout)
                    break
                if chunk is _STREAM_SENTINEL:
                    break
                if isinstance(chunk, Exception):
                    logger.warning("LLM stream error: %s", chunk)
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
                    yield (delta, None)

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
            except Exception:
                pass

            streaming_ms = _elapsed_ms_since(stream_start)

            # OOC: either recover a short streamed HTML answer (entity match) or
            # return friendly copy — never dump raw chunks into Search Test.
            answer_replaced = False
            if not (full_text or "").strip():
                # Timeout / provider failure with no tokens, but retrieval succeeded.
                fallback_text = self._fallback_answer_after_llm_failure(
                    user_query=user_query,
                    non_empty_contexts=non_empty_contexts,
                    retrieval_meta=retrieval_meta,
                    mode=mode,
                    format_type=format_type,
                    max_tokens=max_tokens_val,
                    exc=None,
                )
                if fallback_text.strip():
                    full_text = fallback_text
                    answer_replaced = True
                    yield (full_text, None)
            if self._is_out_of_context_response(full_text):
                recovered_text = ""
                if mode == "search" and not self._search_lacks_lexical_support(
                    user_query, non_empty_contexts
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
                            "Search stream: OOC with entity support — streaming recovery (%d ctx)",
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

                if (
                    recovered_text.strip()
                    and not self._is_out_of_context_response(recovered_text)
                ):
                    full_text = self._clean_response_text(
                        recovered_text, format_type=format_type
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

        def _meta_is_live(meta: Any) -> bool:
            if live_item_ids is None:
                return True
            if not isinstance(meta, dict):
                return False
            for key in ("document_id", "crawl_source_id", "source_id"):
                val = meta.get(key)
                if val and str(val).strip():
                    return str(val) in live_item_ids
            return False

        paired: List[Tuple[str, Any, float]] = []
        for i, ctx in enumerate(retrieved_contexts):
            if not (ctx or "").strip():
                continue
            meta = raw_contexts_metadatas[i] if i < len(raw_contexts_metadatas) else None
            if not _meta_is_live(meta):
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
        if "google" in provider or "gemini" in provider:
            provider = "gemini"

        llm = LLMFactory.get_llm(provider, chat_model, api_key)

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
        db_path: Optional[str] = None,
    ):
        self.embedder = EmbedData(embed_model)
        resolved_path = db_path if db_path is not None else str(_default_vdb_path())
        self.vdb = ChromaVDB(db_path=resolved_path)
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

    def _embedder_for(self, provider: Optional[str], model: Optional[str], api_key: Optional[str]) -> EmbedData:
        """Resolve to a project-specific embedder (or fall back to the default)."""
        if not provider and not model:
            return self.embedder
        raw_embedder = get_raw_embedder(provider, model, api_key)
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
    ) -> Dict[str, Any]:
        try:
            prepared = self.prepare_ingest(
                filepath=filepath,
                document_id=document_id,
                embedding_provider=embedding_provider,
                embedding_model=embedding_model,
                embedding_api_key=embedding_api_key,
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
    ) -> Optional[Dict[str, Any]]:
        texts, chunk_metadata = extract_text_from_file(filepath)
        if not texts:
            logger.warning(f"No text extracted from file: {filepath}")
            return None

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

        embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
        embeddings = embedder.embed(texts)
        return {
            "texts": texts,
            "embeddings": embeddings,
            "chunk_metadata": chunk_metadata,
            "document_id": resolved_document_id,
            "chunks": len(texts),
        }

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
    ) -> List[str]:
        """
        Generate auto-generated query suggestions using LLM based on project embeddings.
        """
        try:
            # Query the vector DB for project-specific documents
            # Get a diverse sample of documents to analyze
            sample_query = "main topics and key information"
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
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
    ):
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
        if collection_name is None and (embedding_provider or embedding_model):
            collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
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
        )

    def retrieve_only(
        self,
        query: str,
        project_id: str,
        top_k: int = DEFAULT_TOP_K,
        similarity_threshold: Optional[float] = None,
        use_reranker: bool = False,
        enable_keyword_fallback: bool = True,
        embedding_provider: Optional[str] = None,
        embedding_model: Optional[str] = None,
        embedding_api_key: Optional[str] = None,
    ) -> Dict[str, Any]:
        embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
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
        mode: str = "chat",
        format_type: str = "markdown",
        enable_keyword_fallback: bool = True,
    ):
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
        if collection_name is None and (embedding_provider or embedding_model):
            collection_name = collection_name_for(project_id, embedding_provider, embedding_model)
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
        live_item_ids: Optional[Set[str]] = None,
    ) -> Dict[str, Any]:
        if embedder is None and (embedding_provider or embedding_model):
            embedder = self._embedder_for(embedding_provider, embedding_model, embedding_api_key)
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
