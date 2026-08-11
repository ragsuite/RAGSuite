"""Chat source title cleanup (reindex temp filenames)."""
import uuid

from app.routes.rag import _clean_doc_title


def test_clean_doc_title_strips_uuid_and_reindex_prefix():
    doc_id = str(uuid.uuid4())
    raw = f"{doc_id}_reindex_RAGSuite_Workspace"
    assert _clean_doc_title(raw) == "RAGSuite Workspace"


def test_clean_doc_title_preserves_normal_title():
    assert _clean_doc_title("RAGSuite_Workspace.pdf") == "RAGSuite Workspace.pdf"
