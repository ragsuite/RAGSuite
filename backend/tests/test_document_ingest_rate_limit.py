"""Document ingest must propagate embedding rate limits for job retry."""
from unittest.mock import MagicMock

import pytest

from app.services.document_ingest_orchestration import ingest_document_to_all_targets_sync
from app.services.embed_rate_limit import EmbeddingRateLimitError


def test_ingest_document_propagates_embedding_rate_limit(monkeypatch):
    target = MagicMock()
    target.source = "search"
    target.provider = "mistral"
    target.model = "mistral-embed"
    target.api_key = "key"
    target.collection = "coll"

    monkeypatch.setattr(
        "app.services.rag.embedding_resolver.resolve_upload_ingest_targets",
        lambda _db, _pid: [target],
    )

    def _boom(*_args, **_kwargs):
        raise EmbeddingRateLimitError("429 rate limit")

    with pytest.raises(EmbeddingRateLimitError):
        ingest_document_to_all_targets_sync(
            MagicMock(),
            save_path="/tmp/x.pdf",
            document_id="doc-1",
            user_id=1,
            project_id="00000000-0000-0000-0000-000000000001",
            run_ingest=_boom,
        )
