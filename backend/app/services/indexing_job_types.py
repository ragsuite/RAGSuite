"""Background job types that write embeddings to the vector store (share ingest caps)."""

from ..models import BackgroundJobType

DOCUMENT_PIPELINE_JOB_TYPES: tuple[str, ...] = (
    BackgroundJobType.DOCUMENT_INGEST.value,
    BackgroundJobType.DOCUMENT_PARSE.value,
    BackgroundJobType.DOCUMENT_EMBED.value,
)

INDEXING_JOB_TYPES: tuple[str, ...] = (
    *DOCUMENT_PIPELINE_JOB_TYPES,
    BackgroundJobType.CRAWL_INGEST_BATCH.value,
    BackgroundJobType.REINDEX.value,
)

__all__ = ["DOCUMENT_PIPELINE_JOB_TYPES", "INDEXING_JOB_TYPES"]
