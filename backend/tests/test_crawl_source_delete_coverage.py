"""Deleted crawl sources must drop out of expected coverage item ids."""
from __future__ import annotations

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock


def test_expected_coverage_excludes_deleted_crawl_source():
    from app.services.reindex_service import expected_coverage_item_ids

    project_uuid = uuid.uuid4()
    live_id = uuid.uuid4()
    deleted_id = uuid.uuid4()

    live_source = SimpleNamespace(id=live_id)
    deleted_source = SimpleNamespace(id=deleted_id)

    def make_db(sources):
        db = MagicMock()

        def query(model):
            q = MagicMock()
            model_name = getattr(model, "class_", model)
            if getattr(model_name, "__name__", "") == "UploadedDocument":
                q.filter.return_value.all.return_value = []
                return q
            if getattr(model, "__name__", "") == "CrawlSource":
                q.filter.return_value.all.return_value = sources
                return q
            # count(Document.id) or Document.id queries
            q.filter.return_value.scalar.return_value = 1
            q.filter.return_value.limit.return_value.first.return_value = SimpleNamespace(
                id=uuid.uuid4()
            )
            return q

        db.query.side_effect = query
        return db

    _, _, crawl_ids_before, _ = expected_coverage_item_ids(
        make_db([live_source, deleted_source]),
        project_uuid,
    )
    assert str(live_id) in crawl_ids_before
    assert str(deleted_id) in crawl_ids_before

    _, _, crawl_ids_after, _ = expected_coverage_item_ids(
        make_db([live_source]),
        project_uuid,
    )
    assert str(live_id) in crawl_ids_after
    assert str(deleted_id) not in crawl_ids_after
