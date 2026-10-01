"""SOURCES_USED trailer: parsing, streaming hold-back and cited metadata selection."""
from app.services.rag import citation_trailer as ct


def _stream(deltas):
    f = ct.CitationTrailerFilter()
    shown = "".join(f.feed(d) for d in deltas) + f.flush()
    return shown, f


def test_label_passages_headers_and_url_line():
    out = ct.label_passages(["alpha", "beta"], [{"url": "u1"}, {}], lambda m: f"URL: {m['url']}\n" if m.get("url") else "")
    assert out == ["[S1]\nURL: u1\nalpha", "[S2]\nbeta"]


def test_parse_used_indices_and_strip():
    answer, used = ct.parse_and_strip("NITSAN builds TYPO3 sites.\n\nSOURCES_USED: S2, S1, S2")
    assert answer == "NITSAN builds TYPO3 sites."
    assert used == [1, 0]


def test_parse_none_means_no_passage():
    answer, used = ct.parse_and_strip("I could not find this.\nSOURCES_USED: none")
    assert answer == "I could not find this."
    assert used == []


def test_parse_missing_trailer_returns_none_and_strips_inline_labels():
    answer, used = ct.parse_and_strip("T3Planet sells extensions [S1] and themes [S2, S3].")
    assert used is None
    assert answer == "T3Planet sells extensions and themes."


def test_parse_markdown_decorated_trailer():
    answer, used = ct.parse_and_strip("Answer text.\n\n**Sources_Used:** `S3`")
    assert answer == "Answer text."
    assert used == [2]


def test_parse_html_trailer():
    answer, used = ct.parse_and_strip("<p>Answer.</p>\n<p>SOURCES_USED: S1</p>")
    assert answer.startswith("<p>Answer.</p>")
    assert "SOURCES_USED" not in answer
    assert used == [0]


def test_stream_filter_hides_trailer_split_across_deltas():
    shown, f = _stream(["MOHN builds ", "media.\n\nSOUR", "CES_U", "SED: S", "1"])
    assert shown.strip() == "MOHN builds media."
    assert f.trailer_started


def test_stream_filter_releases_false_prefix():
    shown, _ = _stream(["The source ", "code is open.", " Sour", "dough too."])
    assert shown == "The source code is open. Sourdough too."


def test_stream_filter_strips_split_inline_label():
    shown, _ = _stream(["Pricing is transparent [", "S", "2] and fair."])
    assert shown == "Pricing is transparent and fair."


def test_stream_filter_keeps_markdown_links():
    shown, _ = _stream(["See [", "docs](https://x.y) now."])
    assert shown == "See [docs](https://x.y) now."


def test_stream_filter_holds_partial_ooc_sentinel():
    f = ct.CitationTrailerFilter(hold_tokens=("QUERY_OUT_OF_CONTEXT",))
    assert f.feed("QUERY_OUT_") == ""
    assert f.feed("OF_CON") == ""
    # A false start is released once it can no longer become the sentinel.
    g = ct.CitationTrailerFilter(hold_tokens=("QUERY_OUT_OF_CONTEXT",))
    assert g.feed("Our QUE") == "Our "
    assert g.feed("STION is answered.") == "QUESTION is answered."
    assert g.flush() == ""


def test_cited_metadatas_selection():
    metas = [{"url": "a"}, {"url": "b"}, {"url": "c"}]
    assert ct.cited_metadatas(metas, [2, 0]) == [{"url": "c"}, {"url": "a"}]
    assert ct.cited_metadatas(metas, []) == []
    assert ct.cited_metadatas(metas, None) is None
    # Out-of-range only → unusable trailer → heuristic fallback
    assert ct.cited_metadatas(metas, [9]) is None


def test_cited_metadatas_from_result():
    result = {"llm_passage_metadatas": [{"url": "a"}], "used_passage_indices": [0]}
    assert ct.cited_metadatas_from_result(result) == [{"url": "a"}]
    assert ct.cited_metadatas_from_result({"summary": "x"}) is None
    assert ct.cited_metadatas_from_result(None) is None
