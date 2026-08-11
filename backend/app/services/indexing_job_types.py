"""Background job types that write embeddings to Chroma (share ingest caps)."""

from ..models import BackgroundJobType

INDEXING_JOB_TYPES: tuple[str, ...] = (
    BackgroundJobType.DOCUMENT_INGEST.value,
    BackgroundJobType.CRAWL_INGEST_BATCH.value,
    BackgroundJobType.REINDEX.value,
)

__all__ = ["INDEXING_JOB_TYPES"]
