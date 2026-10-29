import uuid

from app.services.rag import denylist_filter as df


def test_drop_ranked_removes_denied_url_keeps_same_source_page():
    source_id = str(uuid.uuid4())
    denylists = {source_id: ("https://docs.example.com/",)}
    docs = ["docs body", "main body"]
    ids = ["c1", "c2"]
    metas = [
        {
            "crawl_source_id": source_id,
            "url": "https://docs.example.com",
        },
        {
            "crawl_source_id": source_id,
            "url": "https://example.com/pricing",
        },
    ]
    dists = [0.1, 0.2]

    kept_docs, kept_ids, kept_metas, kept_dists = df.drop_ranked(
        (docs, ids, metas, dists), denylists
    )

    assert kept_docs == ["main body"]
    assert kept_ids == ["c2"]
    assert kept_metas == [metas[1]]
    assert kept_dists == [0.2]


def test_drop_ranked_uses_source_file_when_crawl_source_id_missing():
    source_id = str(uuid.uuid4())
    denylists = {source_id: ("https://docs.example.com/",)}
    meta = {
        "source_file": f"crawl_source_{source_id}",
        "url": "https://docs.example.com/ce-ee",
    }
    assert df.is_denied_chunk(meta, denylists) is True


def test_drop_ranked_does_not_drop_other_source():
    denied_source = str(uuid.uuid4())
    other_source = str(uuid.uuid4())
    denylists = {denied_source: ("https://docs.example.com/",)}
    meta = {
        "crawl_source_id": other_source,
        "url": "https://docs.example.com/",
    }
    assert df.is_denied_chunk(meta, denylists) is False
    docs, ids, metas, dists = df.drop_ranked(
        (["x"], ["1"], [meta], [0.3]), denylists
    )
    assert docs == ["x"] and ids == ["1"] and metas == [meta] and dists == [0.3]


def test_empty_denylists_is_noop():
    lists = (["a"], ["1"], [{"url": "https://docs.example.com"}], [0.1])
    assert df.drop_ranked(lists, {}) == lists
