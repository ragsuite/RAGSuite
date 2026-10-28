"""Chunk profiles: default matches today's CHUNK_SIZES + overlap 200."""
from app.services.rag.chunk_profiles import overlap_for, profile_for_source, size_for
from app.services.rag.utils_rag import CHUNK_OVERLAP, CHUNK_SIZES, chunk_text, chunks_for_crawled_document


def test_default_profile_is_exact_chunk_sizes():
    for ext, size in CHUNK_SIZES.items():
        assert size_for(ext, None) == size
        assert size_for(ext, "default") == size
    assert overlap_for(None) == CHUNK_OVERLAP == 200
    assert overlap_for("default") == 200


def test_default_crawled_html_matches_today_chunk_text():
    text = "Intro sentence.\nRAM: 8 GB\nColour: Blue\nWarranty: 1 Year\nClosing words."
    expected = chunk_text(text, CHUNK_SIZES[".html"])
    assert chunks_for_crawled_document("https://x.test/p.html", text) == expected
    assert chunks_for_crawled_document("https://x.test/p.html", text, chunk_profile="default") == expected


def test_faq_profile_splits_less_than_default():
    text = ("Product FAQ. " * 400).strip()
    default_chunks = chunks_for_crawled_document("https://x.test/faq.html", text, chunk_profile="default")
    faq_chunks = chunks_for_crawled_document("https://x.test/faq.html", text, chunk_profile="faq")
    assert len(faq_chunks) < len(default_chunks)
    assert faq_chunks != default_chunks


def test_web_profile_changes_html_size_not_extractor():
    assert size_for(".html", "web") == 900
    assert size_for(".html", "web") != CHUNK_SIZES[".html"]
    assert size_for(".pdf", "web") == CHUNK_SIZES[".pdf"]
    assert overlap_for("web") == 120


def test_profile_for_source_maps_kind_and_filename():
    assert profile_for_source("web") == "web"
    assert profile_for_source("domain") == "web"
    assert profile_for_source("sitemap") == "web"
    assert profile_for_source("qa_pairs") == "faq"
    assert profile_for_source(filename="faq.rsqa") == "faq"
    assert profile_for_source("text") == "default"
    assert profile_for_source(filename="note.rstext") == "default"
    assert profile_for_source(filename="/tmp/uuid_manual.pdf") == "pdf_manual"
    assert profile_for_source(filename="spec.docx") == "pdf_manual"
    assert profile_for_source(filename="rows.xlsx") == "spreadsheet"
    assert profile_for_source(filename="rows.csv") == "spreadsheet"
    assert profile_for_source(filename="slide.pptx") == "default"


def test_pdf_manual_uses_larger_windows():
    assert size_for(".pdf", "pdf_manual") == 1800
    assert size_for(".docx", "pdf_manual") == 1800
    assert size_for(".doc", "pdf_manual") == 1800
    assert overlap_for("pdf_manual") == 400
    assert size_for(".pdf", "default") == CHUNK_SIZES[".pdf"]
    assert overlap_for("default") == CHUNK_OVERLAP
