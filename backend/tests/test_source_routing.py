"""Query → trained-source routing (site names, hosts, document titles)."""
import uuid

import pytest

from app.services.rag import source_routing as sr

PROJECT = str(uuid.uuid4())
NITSAN_AI = "11111111-1111-1111-1111-111111111111"
NITSANTECH = "22222222-2222-2222-2222-222222222222"
T3PLANET = "33333333-3333-3333-3333-333333333333"
MOHN = "44444444-4444-4444-4444-444444444444"
PDF_DOC = "55555555-5555-5555-5555-555555555555"


def _registry():
    return sr.build_registry(
        [
            (NITSAN_AI, "Nitsan - OpenAI", "https://nitsan.ai/"),
            (NITSANTECH, "NitsanTech - Mistral", "https://www.nitsantech.de/"),
            (T3PLANET, "T3Planet - Mistral", "https://t3planet.de/"),
            (MOHN, "Mohn - Mistral", "https://www.mohn-media.de/"),
        ],
        [(PDF_DOC, "Annual-Sustainability-Report-2025.pdf")],
    )


@pytest.fixture(autouse=True)
def _fake_registry(monkeypatch):
    sr.invalidate()
    monkeypatch.setattr(sr, "_load_registry", lambda _uuid: _registry())
    monkeypatch.delenv("RAG_SOURCE_ROUTING_ENABLED", raising=False)
    yield
    sr.invalidate()


def test_host_phrases_split_and_join_labels():
    assert {"rak", "saar", "rak saar", "raksaar"} <= sr.host_phrases("https://www.rak-saar.de/x")
    assert "nitsan ai" in sr.host_phrases("https://nitsan.ai/")


def test_name_phrases_drop_provider_annotations():
    phrases = sr.name_phrases("T3Planet - Mistral")
    assert "t3planet" in phrases
    assert "mistral" not in phrases


@pytest.mark.parametrize(
    "query,expected",
    [
        ("What does T3Planet offer?", [T3PLANET]),
        ("what is t3 planet pricing", [T3PLANET]),
        ("Tell me about Mohn Media printing", [MOHN]),
        ("What is NITSAN AI?", [NITSAN_AI]),
        ("nitsantech services", [NITSANTECH]),
    ],
)
def test_match_named_sources(query, expected):
    assert sr.match_source_ids(PROJECT, query) == expected


def test_bare_prefix_token_names_every_matching_source():
    """'NITSAN' alone is both nitsan.ai and nitsantech.de — route to both, not one."""
    assert sr.match_source_ids(PROJECT, "Where is NITSAN located?") == sorted([NITSAN_AI, NITSANTECH])


def test_generic_query_routes_nowhere():
    assert sr.match_source_ids(PROJECT, "What services does the company offer?") == []


def test_document_title_routing():
    assert sr.match_source_ids(PROJECT, "summarize the sustainability report") == []
    assert sr.match_source_ids(PROJECT, "what is in the annual sustainability report") == [PDF_DOC]


def test_too_many_hosts_is_ambiguous():
    assert sr.match_source_ids(PROJECT, "compare t3planet, mohn, nitsantech and nitsan ai") == []


def test_disabled_and_invalid_project(monkeypatch):
    assert sr.match_source_ids("not-a-uuid", "T3Planet") == []
    monkeypatch.setenv("RAG_SOURCE_ROUTING_ENABLED", "0")
    assert sr.match_source_ids(PROJECT, "T3Planet") == []


def test_chroma_where_covers_both_crawl_conventions():
    where = sr.chroma_where([MOHN])
    assert where == {
        "$or": [
            {"document_id": {"$in": [MOHN]}},
            {"source_file": {"$in": [f"crawl_source_{MOHN}"]}},
        ]
    }


def test_chunk_belongs_to_page_id_crawls_and_uploads():
    ids = {MOHN, PDF_DOC}
    page_chunk = {"document_id": "page-uuid", "source_file": f"crawl_source_{MOHN}"}
    legacy_chunk = {"document_id": MOHN, "source_file": f"crawl_source_{MOHN}"}
    upload_chunk = {"document_id": PDF_DOC, "source_file": f"{PDF_DOC}_report.pdf"}
    other = {"document_id": "x", "source_file": f"crawl_source_{T3PLANET}"}
    assert sr.chunk_belongs_to(page_chunk, ids)
    assert sr.chunk_belongs_to(legacy_chunk, ids)
    assert sr.chunk_belongs_to(upload_chunk, ids)
    assert not sr.chunk_belongs_to(other, ids)
    assert not sr.chunk_belongs_to(None, ids)


def test_registry_failure_is_harmless(monkeypatch):
    sr.invalidate()

    def _boom(_uuid):
        raise RuntimeError("db down")

    monkeypatch.setattr(sr, "_load_registry", _boom)
    assert sr.match_source_ids(PROJECT, "T3Planet") == []
