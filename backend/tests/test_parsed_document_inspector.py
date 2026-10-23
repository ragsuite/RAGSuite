from app.services.rag.parsed_document import inspector_chunks


def test_inspector_chunks_maps_texts_and_indexes(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.parsed_document.parsed_blob_key",
        lambda project_id, document_id: f"{project_id}/{document_id}/parsed.json",
    )
    monkeypatch.setattr(
        "app.services.rag.parsed_document.load_parsed",
        lambda key: {
            "texts": ["first piece", "second piece"],
            "chunk_metadata": [{"title": "Doc", "chunk_index": 0}, {"title": "Doc"}],
            "document_id": "d1",
            "chunks": 2,
        },
    )
    rows = inspector_chunks("proj", "d1")
    assert [row["text"] for row in rows] == ["first piece", "second piece"]
    assert rows[0]["metadata"]["chunk_index"] == 0
    assert rows[1]["metadata"]["chunk_index"] == 1
    assert rows[1]["metadata"]["title"] == "Doc"


def test_inspector_chunks_empty_when_parsed_missing(monkeypatch):
    monkeypatch.setattr(
        "app.services.rag.parsed_document.parsed_blob_key",
        lambda *_a: "missing",
    )
    monkeypatch.setattr(
        "app.services.rag.parsed_document.load_parsed",
        lambda *_a, **_k: (_ for _ in ()).throw(FileNotFoundError("no parsed")),
    )
    assert inspector_chunks("proj", "d1") == []
