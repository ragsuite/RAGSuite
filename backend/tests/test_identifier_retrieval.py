"""Identifier lookups, timeout narrowing, per-page diversity and fusion identity."""
import pytest

from app.services.rag import keyword_candidates as kc
from app.services.rag import lexical_index as li
from app.services.rag import lexical_schema as ls
from app.services.rag import query_keywords as qk
from app.services.rag.rag import RAG, Retriever

EK_QUESTION = "Was genau liegt im Ersatzteilkoffer EK-H1, wie viele Teile sind es, und wie lautet die Artikelnummer?"


def test_hyphenated_product_code_stays_one_keyword():
    kw = qk.extract_keywords(EK_QUESTION)
    assert "ek-h1" in kw and "h1" not in kw
    assert "ersatzteilkoffer" in kw


def test_plain_hyphenated_words_still_split():
    kw = qk.extract_keywords("Wie funktioniert die Hände-Desinfektion?")
    assert "hände-desinfektion" not in kw


@pytest.mark.parametrize("token,expected", [
    ("ek-h1", True), ("10.00.00.36", True), ("a4", False), ("2026", False), ("bäckerei", False),
])
def test_is_code(token, expected):
    assert qk.is_code(token) is expected


def test_informative_terms_drop_short_generic_words():
    kws = ["produktkatalog", "stand", "pdf", "per", "privatperson", "ek-h1"]
    assert qk.informative_terms(kws) == ["produktkatalog", "privatperson", "ek-h1"]


def test_hyphen_code_is_matched_exactly_not_as_prefix():
    query = qk.tsquery_text(["ek-h1", "ersatzteilkoffer"], "de")
    assert "ek-h1" in query and "ek-h1:*" not in query


def test_search_retries_with_informative_terms_on_timeout(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: {})
    calls = []

    def fake_once(_col, _pid, keywords, *_a):
        calls.append(list(keywords))
        if len(calls) == 1:
            raise li._SearchTimeout()
        return [("c1", 1.0)]

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["produktkatalog", "stand", "pdf", "privatperson"]) == [("c1", 1.0)]
    assert calls[1] == ["produktkatalog", "privatperson"]


def test_search_gives_up_when_nothing_to_narrow(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: {})

    def fake_once(*_a):
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["stand", "pdf"]) == []


SHOP_QUESTION = ["latest", "motorola", "phones", "available", "price", "lowest"]
SHOP_COUNTS = {"latest": 1001, "motorola": 587, "phones": 345, "available": 1001, "price": 1001, "lowest": 1001}


def test_timed_out_search_ranks_every_term_within_rarest_terms(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: dict(SHOP_COUNTS))
    calls = []

    def fake_once(_col, _pid, keywords, _limit, _lang, _src, required=None, *_a):
        calls.append((list(keywords), required))
        if len(calls) == 1:
            raise li._SearchTimeout()
        return [("c1", 1.0)]

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", SHOP_QUESTION) == [("c1", 1.0)]
    assert calls[1] == (SHOP_QUESTION, ["phones", "motorola"])


def test_anchor_terms_skip_absent_terms_and_stay_within_row_budget(monkeypatch):
    counts = {"motorola": 587, "edge": 341, "70": 1001, "pro": 1001, "12/256": 0}
    monkeypatch.setattr(li, "_term_counts", lambda *_a: counts)
    assert li._anchor_terms("col", "p", list(counts)) == ["edge", "motorola"]
    counts["edge"] = 741
    assert li._anchor_terms("col", "p", list(counts)) == ["motorola"]


def test_anchored_search_timeout_gives_up_without_third_query(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: {"motorola": 587, "available": 1001})
    calls = []

    def fake_once(*args, **_kw):
        calls.append(args)
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["motorola", "available", "price"]) == []
    assert len(calls) == 2


def test_only_common_terms_fall_back_to_informative_terms(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: {"t3planet": 1001, "typo3": 1001, "templates": 1001})
    calls = []

    def fake_once(_col, _pid, keywords, *rest):
        calls.append((list(keywords), rest[3:]))
        if len(calls) == 1:
            raise li._SearchTimeout()
        return [("c1", 1.0)]

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["typo3", "templates", "t3planet", "best"]) == [("c1", 1.0)]
    assert calls[1] == (["typo3", "templates", "t3planet"], ())


def test_term_counts_sql_caps_each_term_and_keeps_order():
    sql = str(ls.term_counts_sql("AND project_id = :project_id"))
    assert "LIMIT :cap" in sql and "WITH ORDINALITY" in sql
    assert "to_tsquery('simple', term.query)" in sql and "AND project_id = :project_id" in sql


def test_search_sql_defers_extra_chunks_of_one_document():
    sql = str(ls.search_sql(""))
    assert "row_number() OVER (PARTITION BY" in sql
    assert f"page_pos > {ls.PAGE_LEAD_CHUNKS}" in sql
    assert "'crawl_source_' || document_id" in sql


def test_gather_puts_exact_code_hits_first(monkeypatch):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None, document_ids=None):
        if list(keywords) == ["ek-h1"]:
            return [("ek1", 0.1), ("ek2", 0.1)]
        return [("pdf1", 3.0), ("ek2", 1.0), ("pdf2", 3.0)]

    monkeypatch.setattr(li, "search", fake_search)
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    got = kc.gather("col", "p", ["ersatzteilkoffer", "ek-h1"], "de", None, limit=3, code_limit=5)
    assert got.ids == ["ek1", "ek2", "pdf1"]
    assert got.priority == {"ek1", "ek2"}


@pytest.mark.parametrize("query,expected", [
    ("Which protection class does the HKVHBW lifting device have?", ["hkvhbw"]),
    ("How wide is the Highline wash trough WRHL with 4 places?", ["wrhl"]),
    ("Is the HP laptop or the AMD one faster?", ["hp"]),
    ("WHAT IS THE PRICE OF THE DELL LAPTOP", []),
    ("", []),
])
def test_capitalized_codes(query, expected):
    assert qk.capitalized_codes(query) == expected


def test_gather_looks_up_capitalized_identifiers_like_codes(monkeypatch):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None, document_ids=None):
        if list(keywords) == ["hkvhbw"]:
            return [("hkv1", 0.4)]
        return [("other1", 3.0), ("other2", 2.0)]

    monkeypatch.setattr(li, "search", fake_search)
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    surface = ["safety", "fence", "hkvhbw"]
    got = kc.gather("col", "p", surface, "en", None, limit=2, code_limit=5, identifiers=["hkvhbw", "absent"])
    assert got.ids == ["hkv1", "other1"] and got.priority == {"hkv1"}
    plain = kc.gather("col", "p", surface, "en", None, limit=2, code_limit=5)
    assert plain.ids == ["other1", "other2"] and not plain.priority


@pytest.mark.parametrize("query,expected", [
    ("Welche Artikelnummer hat der Sole-Master Dry?", ["sole-master dry", "sole-master"]),
    ("Welche Leistung hat der Sole-Master?", ["sole-master"]),
    ("Welche Artikelnummer hat die Schmutzschublade SSL-S?", ["ssl-s"]),
    ("Hat der Clean-Check Highline einen Automaten?", ["clean-check highline", "clean-check"]),
    ("Does it have a built-in webcam?", []),
    ("Wie viele 24-V-Sensoren sind im EK-H1?", []),
    ("Welche Maße hat der Sole-Master der Serie?", ["sole-master"]),
    ("", []),
])
def test_name_phrases(query, expected):
    got = qk.name_phrases(query, "de")
    assert got == expected and all(isinstance(p, qk.Phrase) for p in got)


def test_name_phrase_keeps_hyphenated_words_whole_in_tsquery():
    assert qk.tsquery_text([qk.Phrase("sole-master dry")], None) == "(sole-master <-> dry)"
    assert qk.tsquery_text([qk.Phrase("ssl-s")], None) == "ssl-s"
    assert qk.tsquery_text([qk.Phrase("edge 70 pro")], None) == "(edge:* <-> 70 <-> pro)"
    assert qk.tsquery_text(["ssl-s"], "de") == "ssl"


def test_gather_looks_up_product_names_as_phrases(monkeypatch):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None, document_ids=None):
        if list(keywords) == ["sole-master dry"]:
            return [("product_row", 0.2), ("spare_title", 2.0)]
        return [("menu1", 3.0), ("menu2", 2.5)]

    monkeypatch.setattr(li, "search", fake_search)
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    surface = ["artikelnummer", "sole", "master", "dry"]
    names = qk.name_phrases("Welche Artikelnummer hat der Sole-Master Dry?", "de")
    got = kc.gather("col", "p", surface, "de", None, limit=2, code_limit=5, names=names)
    assert got.ids[:2] == ["product_row", "spare_title"]
    assert got.priority == {"product_row", "spare_title"}


def test_gather_ignores_codes_printed_everywhere(monkeypatch):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None):
        if list(keywords) == ["1.4301"]:
            return [(f"steel{i}", 0.1) for i in range(limit)]
        return [("sink", 2.0)]

    monkeypatch.setattr(li, "search", fake_search)
    got = kc.gather("col", "p", ["becken", "1.4301"], "de", None, limit=3, code_limit=5)
    assert got.ids == ["sink"] and not got.priority


def test_gather_keeps_question_ranked_chunks_of_a_shared_variant_code(monkeypatch):
    calls = []

    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None):
        calls.append((list(keywords), required))
        if list(keywords) == ["1100-rechts"]:
            return [(f"any{i}", 0.1) for i in range(limit)]
        if required == ["1100-rechts"]:
            return [("table_row", 2.1), ("other_line", 2.0), ("headless_catalog_rows", 0.3)]
        return [(f"brochure{i}", 0.5) for i in range(limit)]

    monkeypatch.setattr(li, "search", fake_search)
    surface = ["artikelnummer", "clean", "check", "1100-rechts"]
    got = kc.gather("col", "p", surface, "de", None, limit=3, code_limit=5)
    assert (surface, ["1100-rechts"]) in calls
    assert got.ids[:2] == ["table_row", "other_line"] and len(got.ids) == 3
    assert "headless_catalog_rows" not in got.ids
    assert not got.priority
    assert got.scoped == {"table_row", "other_line"}


def test_gather_skips_scoped_lookup_when_the_code_is_the_whole_question(monkeypatch):
    calls = []

    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None):
        calls.append(required)
        return [(f"c{i}", 0.1) for i in range(limit)]

    monkeypatch.setattr(li, "search", fake_search)
    kc.gather("col", "p", ["1.4301"], "de", None, limit=3, code_limit=5)
    assert all(req is None for req in calls)


def _page_expansion_search(calls):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None, document_ids=None):
        calls.append((list(keywords), document_ids))
        if list(keywords) == ["ek-h1"]:
            return [("ek_head", 0.1), ("ek_footer", 0.1)]
        if document_ids:
            return [("parts_list", 0.4), ("ek_head", 0.3), ("faint", 0.05)]
        return [(f"other_page{i}", 2.0) for i in range(limit)]

    return fake_search


def test_gather_expands_identified_page_to_chunks_matching_the_question(monkeypatch):
    calls, pages_asked = [], []
    monkeypatch.setattr(li, "search", _page_expansion_search(calls))

    def fake_pages(_col, _pid, chunk_ids, max_chunks):
        pages_asked.append((list(chunk_ids), max_chunks))
        return ["page_doc"]

    monkeypatch.setattr(li, "page_documents", fake_pages)
    got = kc.gather("col", "p", ["vollkegelstrahldüsen", "ek-h1"], "de", None, limit=3, code_limit=5)
    assert pages_asked == [(["ek_head", "ek_footer"], kc.PAGE_MAX_CHUNKS)]
    assert (["vollkegelstrahldüsen"], ["page_doc"]) in calls
    assert got.ids == ["ek_head", "ek_footer", "parts_list"]
    assert got.priority == {"ek_head", "ek_footer"}
    assert got.scoped == {"parts_list"}


def test_gather_does_not_expand_without_other_words_or_page(monkeypatch):
    calls = []
    monkeypatch.setattr(li, "search", _page_expansion_search(calls))
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: ["page_doc"])
    kc.gather("col", "p", ["ek-h1"], "de", None, limit=3, code_limit=5)
    assert all(docs is None for _kw, docs in calls)

    calls.clear()
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    got = kc.gather("col", "p", ["vollkegelstrahldüsen", "ek-h1"], "de", None, limit=3, code_limit=5)
    assert all(docs is None for _kw, docs in calls) and not got.scoped


@pytest.mark.parametrize("token, parts", [
    ("24-v-sensoren", ["24", "sensoren"]),
    ("1100-rechts", ["1100", "rechts"]),
    ("ek-h1", []),
    ("mkh-1k", []),
    ("10.00.00.36", []),
])
def test_compound_word_parts(token, parts):
    assert qk.compound_word_parts(token, "de") == parts


def _compound_search(calls, code_hits):
    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None, required=None, document_ids=None):
        kws = list(keywords)
        calls.append((kws, required, document_ids))
        if len(kws) == 1 and kws[0] in code_hits:
            return code_hits[kws[0]]
        if document_ids:
            return [("parts_list", 0.4)]
        if required:
            return [("variant_row", 0.5)]
        return [("broad", 1.0)]

    return fake_search


def test_gather_searches_parts_of_a_compound_code_that_matches_nothing(monkeypatch):
    calls = []
    monkeypatch.setattr(li, "search", _compound_search(calls, {"24-v-sensoren": [], "ek-h1": [("ek_head", 0.1)]}))
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: ["page_doc"])
    got = kc.gather("col", "p", ["24-v-sensoren", "ek-h1"], "de", None, limit=3, code_limit=5)
    assert got.terms == ["24", "sensoren", "ek-h1"]
    assert (["24", "sensoren"], None, ["page_doc"]) in calls
    assert (["24", "sensoren", "ek-h1"], None, None) in calls
    assert got.ids == ["ek_head", "parts_list", "broad"]
    assert got.scoped == {"parts_list"}


def test_gather_keeps_compound_codes_with_hits_and_absent_identifiers(monkeypatch):
    calls = []
    shared = [(f"row{i}", 0.1) for i in range(5)]
    monkeypatch.setattr(li, "search", _compound_search(calls, {"1100-rechts": shared}))
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    got = kc.gather("col", "p", ["clean", "1100-rechts"], "de", None, limit=3, code_limit=5)
    assert got.terms == ["clean", "1100-rechts"]
    assert (["clean", "1100-rechts"], ["1100-rechts"], None) in calls
    assert got.scoped == {"variant_row"}

    calls.clear()
    monkeypatch.setattr(li, "search", _compound_search(calls, {"ek-h9": []}))
    got = kc.gather("col", "p", ["teile", "ek-h9"], "de", None, limit=3, code_limit=5)
    assert got.terms == ["teile", "ek-h9"]


def test_document_scoped_search_is_skipped_for_no_pages_and_not_retried(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    calls = []

    def fake_once(*args, **_kw):
        calls.append(args)
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["vollkegelstrahldüsen"], document_ids=[]) == []
    assert calls == []
    assert li.search("col", "p", ["produktkatalog", "stand"], document_ids=["d1"]) == []
    assert len(calls) == 1 and calls[0][-1] == ["d1"]


def test_page_scope_sql_uses_document_id_only_and_page_identity():
    scoped = str(ls.search_sql("", documents=True))
    assert "document_id IN (__[POSTCOMPILE_doc_ids])" in scoped and "src_files" not in scoped
    pages = str(ls.page_documents_sql(""))
    assert "source_file IS DISTINCT FROM 'crawl_source_' || document_id" in pages
    assert "HAVING count(*) <= :max_chunks" in pages


def test_required_search_does_not_retry_on_timeout(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    calls = []

    def fake_once(*args, **_kw):
        calls.append(args)
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["produktkatalog", "stand", "ek-h1"], required=["ek-h1"]) == []
    assert len(calls) == 1


def test_search_sql_requires_must_term_only_when_asked():
    plain = str(ls.search_sql(""))
    scoped = str(ls.search_sql("", required=True))
    assert "must" not in plain
    assert "to_tsquery('simple', :must) AS must" in scoped and "tsv @@ must" in scoped


def test_exact_hits_survive_cosine_floors_and_lead_fusion():
    from app.services.rag import hybrid_fusion as hf

    def key(doc, _meta):
        return doc

    sem = (["s1", "s2"], ["d", "d"], [{}, {}], [0.1, 0.12])
    kw = (["spec", "noise"], ["d", "d"], [{}, {}], [0.5, 0.5])
    exact = (["spec"], ["d"], [{}], [0.5])
    fused = hf.rrf_fuse([(sem, 1.0, "semantic"), (kw, 1.0, "keyword"), (exact, hf.EXACT_WEIGHT, "exact")], key)
    assert fused[0]["doc"] == "spec"
    far = [1.0, 0.0]
    out = hf.resolve_distances(
        fused, query_vec=[0.0, 1.0], keyword_embeddings={"spec": far, "noise": far}, similarity_threshold=0.45,
    )
    docs = [e["doc"] for e in out]
    assert "spec" in docs and "noise" not in docs


def test_gather_without_codes_is_one_broad_query(monkeypatch):
    seen = []

    def fake_search(_col, _pid, keywords, limit=40, lang=None, source_ids=None):
        seen.append(list(keywords))
        return [("a", 1.0)]

    monkeypatch.setattr(li, "search", fake_search)
    got = kc.gather("col", "p", ["sohlenreinigung"], "de", None, limit=40, code_limit=5)
    assert seen == [["sohlenreinigung"]] and got.ids == ["a"] and not got.priority


def test_fusion_key_merges_identical_copies_but_not_other_text_or_pages():
    meta = {"document_id": "v1", "chunk_index": 1, "url": "https://t/page"}
    copy = {**meta, "document_id": "v2", "url": "https://T/page/"}
    assert Retriever._fusion_key("1100-Rechts  11.10.07.44", meta) == Retriever._fusion_key(
        "1100-rechts 11.10.07.44", copy
    )
    assert Retriever._fusion_key("a", meta) != Retriever._fusion_key("b", copy)
    assert Retriever._fusion_key("a", meta) != Retriever._fusion_key("a", {**meta, "url": "https://t/other"})
    assert Retriever._fusion_key("a", {"document_id": "d", "chunk_index": 1}) == "d:1"


def test_fusion_key_separates_pages_sharing_a_source_wide_document_id():
    a = Retriever._chunk_dedup_key("x", {"document_id": "src", "chunk_index": 3, "url": "https://t/a"})
    b = Retriever._chunk_dedup_key("y", {"document_id": "src", "chunk_index": 3, "url": "https://t/b"})
    assert a != b
    assert Retriever._chunk_dedup_key("x", {"document_id": "d", "chunk_index": 1}) == "d:1"


def test_chat_contexts_cap_chunks_per_page_before_other_pages():
    overview = "https://m/sohlenreinigung.html"
    product = "https://m/sohlenreinigung-highline.html"
    metas = [{"url": overview, "chunk_index": i} for i in range(5)] + [{"url": product, "chunk_index": 0}]
    contexts = [f"c{i}" for i in range(6)]
    ctx, out_metas = RAG._dedupe_chat_contexts(contexts, metas, 5)
    assert ctx == ["c0", "c1", "c2", "c5", "c3"]
    assert out_metas[3]["url"] == product


def test_chat_contexts_still_drop_duplicate_chunks():
    metas = [{"url": "https://m/a", "chunk_index": 0}, {"url": "https://m/a", "chunk_index": 0}]
    ctx, _ = RAG._dedupe_chat_contexts(["a", "a again"], metas, 5)
    assert ctx == ["a"]


def test_other_extraction_of_a_page_keeps_its_chunk_with_the_same_index():
    meta = {"url": "https://m/highline.html", "chunk_index": 1}
    flat = "Hygieneschleuse Highline Ausstattung Drehkreuz Edelstahl Bürsten Sensor"
    table = "800-Rechts | 400 mm | 1410 x 1060 x 1785 | 11.10.07.42 | 1100-Rechts | 11.10.07.44"
    ctx, _ = RAG._dedupe_chat_contexts([flat, table, flat], [meta, meta, meta], 5)
    assert ctx == [flat, table]
    docs, *_ = Retriever._dedupe_ranked_results([flat, table], ["v1", "v2"], [meta, meta], [0.2, 0.3], top_k=5)
    assert docs == [flat, table]


@pytest.mark.parametrize("surface,expected", [
    (["motorola", "edge", "70", "pro", "available", "12/256"], ["edge 70 pro", "edge 70"]),
    (["pixel", "9"], ["pixel 9"]),
    (["2026", "product", "catalog"], ["2026 product"]),
    (["viele", "24-v-sensoren", "ek-h1"], []),
    (["katalog", "1.2024", "seiten"], []),
    (["laptops", "50000"], []),
    (["12/256", "70"], []),
])
def test_number_phrases(surface, expected):
    assert qk.number_phrases(surface) == expected


def test_phrase_keyword_matches_words_in_sequence():
    assert qk.tsquery_text([qk.Phrase("edge 70 pro")], "en") == "(edge:* <-> 70 <-> pro)"
    assert qk.tsquery_text(["motorola", qk.Phrase("edge 70")], "en") == "motorola:* | (edge:* <-> 70)"
    assert qk.tsquery_text(["edge 70 pro"], "en") == "edge:* | 70 | pro"
    assert all(isinstance(p, qk.Phrase) for p in qk.number_phrases(["edge", "70", "pro"]))


def test_gather_treats_selective_model_name_as_identifier(monkeypatch):
    calls = []
    hits = {"edge 70 pro": [("listing", 0.3), ("store", 0.2)]}
    monkeypatch.setattr(li, "search", _compound_search(calls, hits))
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    got = kc.gather("col", "p", ["motorola", "edge", "70", "pro", "available"], "en", None, limit=5, code_limit=5)
    assert got.ids[:2] == ["listing", "store"]
    assert got.priority == {"listing", "store"}
    assert got.terms == ["motorola", "edge", "70", "pro", "available"]


def test_gather_scopes_shared_model_name_and_falls_back_to_shorter_name(monkeypatch):
    calls = []
    shared = [(f"row{i}", 0.1) for i in range(5)]
    monkeypatch.setattr(li, "search", _compound_search(calls, {"edge 70 pro": [], "edge 70": shared}))
    monkeypatch.setattr(li, "page_documents", lambda *_a, **_k: [])
    got = kc.gather("col", "p", ["motorola", "edge", "70", "pro"], "en", None, limit=5, code_limit=5)
    assert (["motorola", "edge", "70", "pro"], ["edge 70"], None) in calls
    assert got.scoped == {"variant_row"}


def test_single_keyword_timeout_is_not_retried(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    counted = []
    monkeypatch.setattr(li, "_term_counts", lambda *a: counted.append(a) or {})
    calls = []

    def fake_once(*args, **_kw):
        calls.append(args)
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", [qk.Phrase("edge 70 pro")]) == []
    assert len(calls) == 1 and counted == []


def test_anchors_covering_every_keyword_are_not_retried_as_is(monkeypatch):
    monkeypatch.setattr(li, "is_enabled", lambda: True)
    monkeypatch.setattr(li, "_term_counts", lambda *_a: {"stand": 10, "pdf": 20})
    calls = []

    def fake_once(*args, **_kw):
        calls.append(args)
        raise li._SearchTimeout()

    monkeypatch.setattr(li, "_search_once", fake_once)
    assert li.search("col", "p", ["stand", "pdf"]) == []
    assert len(calls) == 1
