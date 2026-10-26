from app.services.rag.parent_child import expand_parent_child, expand_parent_hits
from app.services.rag.split_config import chunk_text_custom, parse_split_config
from app.services.rag.utils_rag import chunk_text, chunks_for_crawled_document, ingest_chunks_for_crawled_document, split_for_ingest


def _custom(**extra):
    payload = {
        "mode": "custom",
        "chunk_size": 800,
        "chunk_overlap": 200,
        "delimiter_preset": "paragraph",
    }
    payload.update(extra)
    return payload


def test_native_and_custom_off_chunks_unchanged():
    text = "Hello world. " * 40
    assert chunk_text(text, 1200) == chunk_text(text, 1200)
    native = chunks_for_crawled_document("https://x.test/p.html", text)
    assert chunks_for_crawled_document("https://x.test/p.html", text, split_config=None) == native
    custom_off = _custom()
    expected = chunk_text_custom(text, 800, 200, "\n\n")
    assert chunks_for_crawled_document("https://x.test/p.html", text, split_config=custom_off) == expected
    texts, extras = ingest_chunks_for_crawled_document("https://x.test/p.html", text, split_config=custom_off)
    assert texts == expected
    assert not any(extra.get("parent_id") for extra in extras)


def test_parent_child_indexes_children_with_parent_fields():
    cfg = parse_split_config(_custom(parent_child=True))
    assert cfg is not None
    parent = ("Alpha sentence. " * 40) + "\n\n" + ("Beta sentence. " * 40)
    parents = chunk_text_custom(parent, cfg.chunk_size, cfg.chunk_overlap, cfg.delimiter)
    texts, extras = expand_parent_child(parents, cfg)
    assert texts
    assert all(extra.get("parent_id") and extra.get("parent_text") for extra in extras)
    assert len(texts) >= len(parents)
    assert all(extra["parent_text"] in parents for extra in extras)


def test_parent_child_prompt_uses_parent_and_respects_top_k():
    cfg = parse_split_config(_custom(parent_child=True, chunk_size=400, chunk_overlap=0, delimiter_preset="newline"))
    assert cfg is not None
    parent_a = "Find the refund policy. " + ("Keep this full section A. " * 20)
    parent_b = "Warranty lasts two years. " + ("Keep this full section B. " * 20)
    texts, extras = expand_parent_child([parent_a, parent_b], cfg)
    docs, _ids, metas, dists = expand_parent_hits(
        texts,
        [f"id-{i}" for i in range(len(texts))],
        extras,
        [0.1] * len(texts),
        k=2,
    )
    assert parent_a.strip() in {item.strip() for item in docs}
    assert parent_b.strip() in {item.strip() for item in docs}
    assert len(docs) <= 2
    assert len(docs) == len({item.strip() for item in docs})
    native_docs, native_ids, native_metas, native_dists = expand_parent_hits(
        ["plain"], ["n1"], [{"url": "file://x"}], [0.2], k=5
    )
    assert native_docs == ["plain"] and native_ids == ["n1"]
    assert native_metas == [{"url": "file://x"}] and native_dists == [0.2]
    assert "parent_id" not in native_metas[0]


def test_parent_text_survives_metadata_sanitize():
    from app.services.rag.vector_store.ingest import sanitize_metadata

    parent = "P" * 1500
    out = sanitize_metadata({"title": "x", "parent_id": "p0", "parent_text": parent, "url": "u" * 1200})
    assert out["parent_text"] == parent
    assert len(out["url"]) == 1000
    assert "parent_id" in out


def test_split_for_ingest_native_has_no_parent_fields():
    texts, extras = split_for_ingest("Hello world. " * 20, 1200, 200, None)
    assert texts
    assert not any(extra.get("parent_id") or extra.get("parent_text") for extra in extras)
