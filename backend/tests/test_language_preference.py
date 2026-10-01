"""Query-language priority: chunk language, same-site reorder, twin filtering, prompt hint."""
import pytest

from app.services.rag import language_preference as lp

DE_META = {"url": "https://www.mohn-gmbh.com/produkte/hygieneschleusen.html", "language": "de"}
EN_META = {"url": "https://www.mohn-gmbh.com/en/products/hygiene-stations.html", "language": "en"}
OTHER_EN_META = {"url": "https://example.org/hygiene", "language": "en"}


def _entry(meta, dist, doc="passage"):
    return {"doc": doc, "id": meta["url"], "meta": meta, "dist": dist}


@pytest.fixture(autouse=True)
def _enabled(monkeypatch):
    monkeypatch.delenv("RAG_QUERY_LANGUAGE_PRIORITY", raising=False)
    monkeypatch.delenv("RAG_QUERY_LANGUAGE_MARGIN", raising=False)


@pytest.mark.parametrize(
    "doc, meta, expected",
    [
        ("x", {"language": "de-DE", "url": "https://a.com/en/x"}, "de"),
        ("x", {"url": "https://a.com/en/products/x"}, "en"),
        ("x", {"url": "https://a.com/de-de/x"}, "de"),
        ("x", {"url": "https://fr.a.com/x"}, "fr"),
        ("x", {"url": "https://a.com/x?lang=es"}, "es"),
        ("Die Schleuse ist mit einer Handdesinfektion ausgestattet und für den Betrieb.", {}, "de"),
        ("Mohn", {"url": "https://a.com/produkte"}, None),
    ],
)
def test_chunk_language(doc, meta, expected):
    assert lp.chunk_language(doc, meta) == expected


def test_site_key_shares_language_variants():
    assert lp.site_key(DE_META) == lp.site_key(EN_META) == "host:mohn-gmbh.com"
    assert lp.site_key({"url": "https://en.mohn-gmbh.com/x"}) == "host:mohn-gmbh.com"
    assert lp.site_key({"source_file": "crawl_source_abc"}) == "crawl:abc"
    assert lp.site_key({"document_id": "d1"}) == "doc:d1"
    assert lp.site_key({}) is None


def test_preferred_language_falls_back_to_answer_language():
    assert lp.preferred_language("Welche Produkte bietet Mohn an?", "en") == "de"
    assert lp.preferred_language("Mohn", "de-DE") == "de"
    assert lp.preferred_language("Mohn", None) is None


def test_same_site_twin_moves_ahead_without_touching_other_sites():
    entries = [_entry(EN_META, 0.10), _entry(OTHER_EN_META, 0.11), _entry(DE_META, 0.14)]
    out, changed = lp.prefer_language(entries, "de")
    assert changed
    assert [e["meta"] for e in out] == [DE_META, OTHER_EN_META, EN_META]


def test_twin_outside_margin_keeps_order():
    entries = [_entry(EN_META, 0.10), _entry(DE_META, 0.40)]
    out, changed = lp.prefer_language(entries, "de")
    assert not changed
    assert out == entries


def test_twin_never_moves_further_than_rank_window():
    en_first = {**EN_META, "url": EN_META["url"] + "?p=0"}
    fillers = [{**EN_META, "url": EN_META["url"] + f"?p={i}"} for i in range(1, 5)]
    entries = [_entry(en_first, 0.10)] + [_entry(m, 0.11) for m in fillers] + [_entry(DE_META, 0.12)]
    out, changed = lp.prefer_language(entries, "de", window=3)
    assert changed
    assert [e["meta"] for e in out].index(DE_META) == 2  # rises 3 positions, not to the top
    out, _ = lp.prefer_language(entries, "de", window=5)
    assert out[0]["meta"] == DE_META


def test_single_language_pool_is_untouched():
    entries = [_entry(EN_META, 0.10), _entry(OTHER_EN_META, 0.12)]
    assert lp.prefer_language(entries, "de") == (entries, False)
    assert lp.prefer_language(entries, None) == (entries, False)


def test_disabled_flag_is_noop(monkeypatch):
    monkeypatch.setenv("RAG_QUERY_LANGUAGE_PRIORITY", "0")
    entries = [_entry(EN_META, 0.10), _entry(DE_META, 0.11)]
    assert lp.prefer_language(entries, "de") == (entries, False)


def test_routed_partition_is_never_crossed():
    routed_en = {**EN_META, "crawl_source_id": "routed"}
    entries = [_entry(routed_en, 0.10), _entry(DE_META, 0.11)]
    out, changed = lp.prefer_language(entries, "de", partition_ids={"routed"})
    assert not changed
    assert out == entries


def test_unknown_language_chunks_stay_in_place():
    unknown = {"url": "https://www.mohn-gmbh.com/fileadmin/flyer.pdf"}
    entries = [_entry(unknown, 0.09, doc="Mohn"), _entry(EN_META, 0.10), _entry(DE_META, 0.12)]
    out, _ = lp.prefer_language(entries, "de")
    assert [e["meta"] for e in out] == [unknown, DE_META, EN_META]


def test_twin_filter_hides_only_same_site_other_language():
    metas = [EN_META, DE_META, OTHER_EN_META, {"url": "https://www.mohn-gmbh.com/flyer.pdf"}]
    assert lp.filter_language_twins(metas, "de") == [DE_META, OTHER_EN_META, metas[3]]
    assert lp.filter_language_twins([EN_META, OTHER_EN_META], "de") == [EN_META, OTHER_EN_META]
    assert lp.filter_language_twins(metas, None) == metas


def test_drop_language_twins_keeps_triples_aligned():
    ctx, metas, sims, dropped = lp.drop_language_twins(["en", "de"], [EN_META, DE_META], [90, 80], "de")
    assert dropped
    assert (ctx, metas, sims) == (["de"], [DE_META], [80])
    same = lp.drop_language_twins(["de"], [DE_META], 0.5, "de")
    assert same == (["de"], [DE_META], 0.5, False)


def test_mixed_language_hint_only_for_mixed_passages():
    assert "German" in lp.mixed_language_hint(["a", "b"], [EN_META, DE_META], "de")
    assert lp.mixed_language_hint(["a", "b"], [EN_META, OTHER_EN_META], "de") == ""
    assert lp.mixed_language_hint(["a", "b"], [EN_META, DE_META], None) == ""


def test_texts_for_metas_matches_chunks_and_detects_cited_pdf():
    pdf = {"url": "https://www.mohn-gmbh.com/fileadmin/presse.pdf", "chunk_index": 2}
    german_text = "Die Firma ist seit 2012 in Meinerzhagen ansässig und hat dort ihren Hauptsitz."
    texts = lp.texts_for_metas([pdf, EN_META], ["other", german_text], [EN_META, dict(pdf)])
    assert texts == [german_text, "other"]
    assert lp.filter_language_twins([pdf, EN_META], "en", docs=texts) == [EN_META]
    assert lp.filter_language_twins([pdf, EN_META], "en") == [pdf, EN_META]


def test_query_language_from_result():
    assert lp.query_language_from_result({"retrieval_meta": {"query_language": "de"}}) == "de"
    assert lp.query_language_from_result({"query_language": "fr-FR"}) == "fr"
    assert lp.query_language_from_result({"retrieval_meta": None}) is None
    assert lp.query_language_from_result(None) is None
