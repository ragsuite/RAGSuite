"""Compose one-shot: Chroma→pgvector (legacy), pgvector→ES, blobs→MinIO."""
from __future__ import annotations

import argparse
import logging
import sys
from typing import List, Optional


def _log(message: str) -> None:
    print(f"[stack-migrate] {message}", flush=True)


def run_auto(force: bool = False) -> int:
    from app.services.rag.vector_store.chroma_import import run_auto as chroma_auto
    from app.services.rag.vector_store.es_import import run_auto as es_auto
    from app.services.blob_import import run_auto as blob_auto

    _log("legacy Chroma → pgvector")
    rc = chroma_auto(force=force)
    if rc != 0:
        return rc
    _log("pgvector → Elasticsearch")
    rc = es_auto(force=force)
    if rc != 0:
        return rc
    _log("document blobs → MinIO")
    return blob_auto()


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="RAGSuite stack migrate (Chroma/pgvector/ES/MinIO)")
    parser.add_argument("--auto", action="store_true")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.WARNING)
    try:
        return run_auto(force=args.force)
    except Exception as exc:
        _log(f"ERROR: {exc}")
        logging.exception("stack migrate failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
