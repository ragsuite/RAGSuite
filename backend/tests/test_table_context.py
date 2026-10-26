from app.services.rag.table_context import wrap_table_context
from app.services.rag.utils_rag import chunks_for_crawled_document, split_for_ingest


FIXTURE = """Intro sentence about the product.

Name: Ada; Role: CTO
Email: ada@example.com; Team: Platform
Office: London; Desk: 12

Closing words about support."""


def test_table_context_zero_is_identity():
    assert wrap_table_context(FIXTURE, 0) == FIXTURE
    assert wrap_table_context(FIXTURE, 3) == FIXTURE
    native = chunks_for_crawled_document("https://x.test/p.html", FIXTURE)
    assert chunks_for_crawled_document("https://x.test/p.html", FIXTURE, split_config=None) == native


def test_table_context_one_includes_neighbour_sentence():
    wrapped = wrap_table_context(FIXTURE, 1)
    assert wrapped != FIXTURE
    assert "Intro sentence about the product." in wrapped
    assert "Name: Ada; Role: CTO" in wrapped
    custom = {
        "mode": "custom",
        "chunk_size": 800,
        "chunk_overlap": 0,
        "delimiter_preset": "paragraph",
        "table_context": 1,
    }
    texts, _extras = split_for_ingest(FIXTURE, 800, 0, custom)
    table_chunks = [text for text in texts if "Name: Ada; Role: CTO" in text]
    assert table_chunks
    assert "Intro sentence about the product." in table_chunks[0]
