#!/usr/bin/env python3
"""Print Chroma embedding storage info for a project (local diagnostics)."""
from __future__ import annotations

import argparse
import os
import sys

# Run from backend/: .venv/bin/python3 scripts/check_embedding_storage.py PROJECT_UUID
_BACKEND = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if _BACKEND not in sys.path:
    sys.path.insert(0, _BACKEND)

os.environ.setdefault("OTEL_SDK_DISABLED", "true")


def main() -> int:
    parser = argparse.ArgumentParser(description="Check Chroma embeddings for a project")
    parser.add_argument("project_id", help="Project UUID")
    parser.add_argument(
        "--source",
        choices=("chat", "search"),
        default="chat",
        help="Settings row to resolve (default: chat)",
    )
    args = parser.parse_args()

    from app.db import SessionLocal
    from app.services.chroma_repair import resolve_local_chroma_path, resolve_rag_chroma_db_path
    from app.services.rag.embedder_factory import collection_name_for
    from app.services.rag.embedding_resolver import resolve_for_project
    from app.services.rag.rag import _rag_chroma_http_mode
    from app.services.rag.singleton import get_pipeline
    from app.services.reindex_service import (
        _saved_collection_for_source,
        assess_embedding_coverage,
        chroma_index_readiness,
    )

    import uuid

    project_uuid = uuid.UUID(args.project_id)
    db = SessionLocal()
    try:
        ready, err = chroma_index_readiness()
        provider, model, _ = resolve_for_project(
            db, project_uuid, source=args.source, honor_requested_source=True
        )
        active_coll = collection_name_for(str(project_uuid), provider, model)
        saved_coll = _saved_collection_for_source(db, project_uuid, args.source)
        coverage = assess_embedding_coverage(
            db, project_uuid, active_coll, source=args.source
        )
    finally:
        db.close()

    print("CHROMA_MODE:", os.environ.get("CHROMA_MODE", "local"))
    print("CHROMA_HOST:", os.environ.get("CHROMA_HOST", ""))
    print("rag_db_path:", resolve_rag_chroma_db_path())
    print("local_repair_path:", resolve_local_chroma_path())
    print("http_mode:", _rag_chroma_http_mode())
    print("index_ready:", ready, err or "")
    print("resolved:", provider, model)
    print("active_collection:", active_coll)
    print("saved_collection:", saved_coll)
    print(
        "coverage:",
        f"embedded={coverage.coverage_items_embedded}",
        f"missing={coverage.coverage_items_missing}",
        f"needs_reindex={coverage.needs_reindex}",
    )

    pipeline = get_pipeline()
    if not pipeline:
        print("pipeline: NOT LOADED")
        return 1

    print("pipeline: OK")
    for label, coll in [("active", active_coll), ("saved", saved_coll)]:
        if not coll:
            continue
        try:
            n = pipeline.vdb.count_filtered_exact(
                project_id=str(project_uuid), collection_name=coll
            )
            print(f"vectors[{label}] {coll}: {n}")
        except Exception as exc:
            print(f"vectors[{label}] {coll}: ERROR {exc}")

    openai_cols = [c for c in pipeline.vdb.list_known_collections() if "openai" in c.lower()]
    if openai_cols:
        print("openai_collections:")
        for name in openai_cols:
            try:
                n = pipeline.vdb.count_filtered_exact(
                    project_id=str(project_uuid), collection_name=name
                )
                if n:
                    print(f"  {name}: {n}")
            except Exception:
                pass
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
