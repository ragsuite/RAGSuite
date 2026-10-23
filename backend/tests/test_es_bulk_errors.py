"""Elasticsearch bulk HTTP 200 + errors:true must fail the ingest write."""
from __future__ import annotations

import pytest

from app.services.rag.vector_store.es_collection import raise_if_bulk_errors


def test_raise_if_bulk_errors_ignores_clean_response():
    raise_if_bulk_errors({"errors": False, "items": []}, "index")
    raise_if_bulk_errors({"took": 1}, "index")
    raise_if_bulk_errors(None, "index")


def test_raise_if_bulk_errors_includes_flood_stage_reason():
    resp = {
        "errors": True,
        "items": [
            {
                "index": {
                    "status": 429,
                    "error": {
                        "type": "cluster_block_exception",
                        "reason": "index [rs-col] blocked by: [TOO_MANY_REQUESTS/12/disk usage exceeded flood-stage watermark]",
                    },
                }
            }
        ],
    }
    with pytest.raises(RuntimeError, match="flood-stage watermark") as exc:
        raise_if_bulk_errors(resp, "index")
    assert "too_many_requests" in str(exc.value).lower() or "TOO_MANY_REQUESTS" in str(exc.value)


def test_raise_if_bulk_errors_reads_object_api_body():
    class Resp:
        body = {
            "errors": True,
            "items": [{"index": {"error": {"reason": "mapper_parsing_exception"}}}],
        }

    with pytest.raises(RuntimeError, match="mapper_parsing_exception"):
        raise_if_bulk_errors(Resp(), "create")
