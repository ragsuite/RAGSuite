"""SOURCES_USED trailer: parsing, streaming hold-back and cited metadata selection."""
import pytest

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


def test_label_only_parentheses_are_removed_whole():
    answer, _ = ct.parse_and_strip(
        "- **11.10.07.49** (from [S1] and [S3])\n- **11.10.08.54** (from [S2])\n"
        "- Size (1100 mm, see [S4])\n- Guide ([S1], [S2], and [S5])."
    )
    assert answer == "- **11.10.07.49**\n- **11.10.08.54**\n- Size (1100 mm, see)\n- Guide."


def test_stream_filter_removes_label_parentheses_split_across_deltas():
    shown, _ = _stream(["- **11.10.07.49** (fr", "om [S", "1] and [S3", "]) is right.\n", "Size (1100 mm) ok."])
    assert shown == "- **11.10.07.49** is right.\nSize (1100 mm) ok."


def test_stream_filter_releases_long_open_parenthesis():
    f = ct.CitationTrailerFilter()
    first = f.feed("Note (this aside keeps going for quite a while without closing")
    assert first.startswith("Note (this aside")
    assert first + f.flush() == "Note (this aside keeps going for quite a while without closing"


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


ARTICLE_ANSWER = "- **Ecoline:** **11.10.08.54**\n- **Highline:** **11.10.07.44**"


@pytest.mark.parametrize("sep", ["\n", "\n\n", " ", ""])
def test_closing_bold_before_trailer_is_kept(sep):
    answer, used = ct.parse_and_strip(f"{ARTICLE_ANSWER}{sep}SOURCES_USED: S1")
    assert answer == ARTICLE_ANSWER
    assert used == [0]


def test_closing_italic_before_trailer_is_kept_and_bold_label_still_stripped():
    assert ct.parse_and_strip("See *note*\nSOURCES_USED: S1")[0] == "See *note*"
    assert ct.parse_and_strip("Done.\n**SOURCES_USED:** S1")[0] == "Done."
    assert ct.parse_and_strip("Price **5 €****SOURCES_USED:** S1")[0] == "Price **5 €**"


@pytest.mark.parametrize("size", [1, 2, 3, 5])
def test_streaming_keeps_closing_bold_before_trailer(size):
    raw = f"{ARTICLE_ANSWER}\nSOURCES_USED: S1"
    shown, f = _stream([raw[i:i + size] for i in range(0, len(raw), size)])
    assert shown == ARTICLE_ANSWER
    assert f.trailer_started
