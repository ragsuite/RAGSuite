"""Rank fusion: RRF ordering, true-cosine keyword hits, routed priority, order-preserving dedupe."""
from app.services.rag import hybrid_fusion as hf


def _key(doc, meta):
    return f"{(meta or {}).get('url', '')}#{(meta or {}).get('chunk', 0)}"


def _lists(rows):
    docs = [r[0] for r in rows]
    ids = [r[1] for r in rows]
    metas = [r[2] for r in rows]
    dists = [r[3] for r in rows]
    return docs, ids, metas, dists


def test_cosine_distance_basics():
    assert hf.cosine_distance([1, 0], [1, 0]) == 0.0
    assert abs(hf.cosine_distance([1, 0], [0, 1]) - 1.0) < 1e-9
    assert hf.cosine_distance([0, 0], [1, 0]) is None
    assert hf.cosine_distance(None, [1, 0]) is None


def test_rrf_rewards_agreement_between_lists():
    semantic = _lists([
        ("a", "1", {"url": "a"}, 0.2),
        ("b", "2", {"url": "b"}, 0.25),
    ])
    keyword = _lists([("b", "2", {"url": "b"}, 0.5)])
    fused = hf.rrf_fuse([(semantic, 1.0, "semantic"), (keyword, 0.85, "keyword")], _key)
    assert [e["doc"] for e in fused] == ["b", "a"]
    assert fused[0]["origins"] == {"semantic", "keyword"}
    assert fused[0]["sem_dist"] == 0.25 and fused[0]["kw_dist"] == 0.5


def test_rrf_counts_copies_once_and_keeps_ranks_over_distinct_chunks():
    copy = {"url": "p", "chunk": 0}
    semantic = _lists([
        ("caption", "d1", copy, 0.1),
        ("caption", "d2", copy, 0.1),
        ("caption", "d3", copy, 0.1),
        ("table", "d1", {"url": "p", "chunk": 1}, 0.2),
    ])
    single = _lists([("caption", "d1", copy, 0.1), ("table", "d1", {"url": "p", "chunk": 1}, 0.2)])
    fused = hf.rrf_fuse([(semantic, 1.0, "semantic")], _key)
    expected = hf.rrf_fuse([(single, 1.0, "semantic")], _key)
    assert [(e["doc"], e["score"]) for e in fused] == [(e["doc"], e["score"]) for e in expected]


def test_chunk_identity_splits_one_key_only_for_different_text():
    ident = hf.ChunkIdentity()
    assert ident.key("url:p:1", "Clean-Check Highline Drehkreuz") == "url:p:1"
    assert ident.key("url:p:1", "Clean-Check Highline Drehkreuz neu") == "url:p:1"
    assert ident.key("url:p:1", "800-Rechts 11.10.07.42 1100-Rechts 11.10.07.44") == "url:p:1#1"
    assert ident.key("url:p:1", "800-Rechts 11.10.07.42 1100-Rechts 11.10.07.44") == "url:p:1#1"
    assert ident.key("url:q:1", "Clean-Check Highline Drehkreuz") == "url:q:1"


def test_resolve_distances_scores_keyword_only_with_true_cosine():
    semantic = _lists([("a", "1", {"url": "a"}, 0.1)])
    keyword = _lists([
        ("close", "2", {"url": "close"}, 0.4),
        ("far", "3", {"url": "far"}, 0.4),
    ])
    entries = hf.rrf_fuse([(semantic, 1.0, "semantic"), (keyword, 0.85, "keyword")], _key)
    embeddings = {"close#0": [1.0, 0.05], "far#0": [0.0, 1.0]}
    out = hf.resolve_distances(entries, query_vec=[1.0, 0.0], keyword_embeddings=embeddings)
    docs = {e["doc"]: e for e in out}
    assert "far" not in docs  # below 0.75 × top semantic similarity
    assert docs["close"]["dist"] < 0.01
    assert docs["a"]["dist"] == 0.1


def test_rare_word_hits_rise_but_still_pass_the_cosine_floor():
    semantic = _lists([("a", "1", {"url": "a"}, 0.1)])
    keyword = _lists([("chrome", "2", {"url": "chrome"}, 0.4), ("fact", "3", {"url": "fact"}, 0.4), ("far", "4", {"url": "far"}, 0.4)])
    rare = _lists([("fact", "3", {"url": "fact"}, 0.4), ("far", "4", {"url": "far"}, 0.4)])
    lists = [(semantic, 1.0, "semantic"), (keyword, 1.0, "keyword"), (rare, hf.RARE_WEIGHT, "rare")]
    entries = hf.rrf_fuse(lists, _key)
    assert [e["doc"] for e in entries][0] == "fact" and entries[0]["kw_dist"] == 0.4
    embeddings = {"fact#0": [1.0, 0.05], "far#0": [0.0, 1.0]}
    out = hf.resolve_distances(entries, query_vec=[1.0, 0.0], keyword_embeddings=embeddings)
    assert [e["doc"] for e in out if e["doc"] in ("fact", "far")] == ["fact"]


def test_resolve_distances_respects_similarity_threshold():
    keyword = _lists([("k", "1", {"url": "k"}, 0.3)])
    entries = hf.rrf_fuse([(keyword, 0.85, "keyword")], _key)
    out = hf.resolve_distances(
        entries, query_vec=[1.0, 0.0], keyword_embeddings={"k#0": [0.6, 0.8]}, similarity_threshold=0.7
    )
    assert out == []


def test_prioritize_routed_is_stable_partition():
    entries = [
        {"doc": "x", "meta": {"document_id": "big"}},
        {"doc": "y", "meta": {"document_id": "small"}},
        {"doc": "z", "meta": {"document_id": "big"}},
        {"doc": "w", "meta": {"document_id": "small"}},
    ]
    out = hf.prioritize_routed(entries, {"small"})
    assert [e["doc"] for e in out] == ["y", "w", "x", "z"]
    assert hf.prioritize_routed(entries, set()) is entries


def test_defer_site_blocks_keeps_one_and_moves_the_rest_last():
    menu = {"content_kind": "site_header"}
    entries = [
        {"doc": "menu1", "meta": menu},
        {"doc": "page1", "meta": {"url": "a"}},
        {"doc": "menu2", "meta": menu},
        {"doc": "footer", "meta": {"content_kind": "site_footer"}},
        {"doc": "page2", "meta": None},
    ]
    out = hf.defer_site_blocks(entries)
    assert [e["doc"] for e in out] == ["menu1", "page1", "page2", "menu2", "footer"]
    pages = [{"doc": "p", "meta": {"url": "a"}}]
    assert hf.defer_site_blocks(pages) is pages


def test_dedupe_preserving_order_collapses_same_body_across_urls():
    body = "Mohn Media prints catalogues and magazines for European publishers."
    entries = [
        {"doc": body, "id": "1", "meta": {"url": "https://mohn.de/a"}, "dist": 0.3},
        {"doc": body + " ", "id": "2", "meta": {"url": "https://mohn.de/b"}, "dist": 0.1},
        {"doc": "Other text", "id": "3", "meta": {"url": "https://mohn.de/c"}, "dist": 0.2},
    ]
    docs, ids, _metas, dists = hf.dedupe_preserving_order(entries, _key, top_k=5)
    assert ids == ["1", "3"]
    assert dists == [0.3, 0.2]  # ranked order kept, not re-sorted by distance


def test_merge_by_distance_keeps_best_distance_per_chunk():
    primary = _lists([("a", "1", {"url": "a"}, 0.4), ("b", "2", {"url": "b"}, 0.5)])
    scoped = _lists([("a", "1", {"url": "a"}, 0.3), ("c", "3", {"url": "c"}, 0.45)])
    docs, _ids, _metas, dists = hf.merge_by_distance(primary, scoped, _key)
    assert docs == ["a", "c", "b"]
    assert dists == [0.3, 0.45, 0.5]


def test_filter_by_similarity():
    lists = _lists([("a", "1", {}, 0.2), ("b", "2", {}, 0.6)])
    docs, *_ = hf.filter_by_similarity(lists, 0.5)
    assert docs == ["a"]
    assert hf.filter_by_similarity(lists, None) is lists


def _menu_and_pages():
    menu = {"content_kind": "site_header", "title": "Site header · acme.test"}
    rows = [(f"menu chunk {i} " + "x" * i, f"m{i}", {**menu, "url": "https://acme.test/a", "chunk_index": i}, 0.1)
            for i in range(4)]
    rows += [(f"page chunk {i} " + "y" * i, f"p{i}", {"url": f"https://acme.test/p{i}", "chunk_index": 0}, 0.3)
             for i in range(4)]
    return hf.entries_from_lists(*_lists(rows))


def test_final_ranking_keeps_one_site_block_chunk():
    from unittest.mock import MagicMock

    from app.services.rag.rag import VectorDB, EmbedData, Retriever

    retriever = Retriever(vdb=MagicMock(spec=VectorDB), embedder=MagicMock(spec=EmbedData), default_top_k=4)
    for preserve in (True, False):
        (docs, ids, _metas, _dists), _ = retriever._finalize_ranking(
            _menu_and_pages(), preserve_order=preserve, routed_set=set(), query_lang=None, k=4,
        )
        assert ids == ["m0", "p0", "p1", "p2"]
