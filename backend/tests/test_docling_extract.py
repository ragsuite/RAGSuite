"""Docling extract is opt-in and fail-soft to native."""
from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from app.services.rag.docling_extract import (
    ENGINE_DOCLING,
    ENGINE_NATIVE,
    EXTRACT_ENGINE_KEY,
    engine_from_meta,
    normalize_extract_engine,
    try_extract_docling_units,
)
from app.services.rag.pdf_page_extract import apply_pdf_options_to_meta, ingest_kwargs_from_document
from app.services.rag.utils_rag import extract_text_from_file
from tests.test_pdf_page_extract import build_text_pdf


def test_missing_engine_key_is_native():
    assert engine_from_meta(None) == ENGINE_NATIVE
    assert engine_from_meta({}) == ENGINE_NATIVE
    assert normalize_extract_engine("Docling") == ENGINE_DOCLING
    assert ingest_kwargs_from_document(SimpleNamespace(meta_data={"extract_engine": "docling"})) == {
        "extract_engine": ENGINE_DOCLING
    }


def test_try_extract_returns_none_when_module_missing():
    with patch.dict("sys.modules", {"docling": None, "docling.document_converter": None}):
        assert try_extract_docling_units("/tmp/missing.pdf") is None


def test_extract_text_falls_back_to_native_when_docling_missing(tmp_path: Path):
    pdf_path = tmp_path / "letter.pdf"
    pdf_path.write_bytes(build_text_pdf(["Native page one", "Native page two"]))
    with patch(
        "app.services.rag.docling_extract.try_extract_docling_units",
        return_value=None,
    ) as mock_docling:
        texts, _meta = extract_text_from_file(
            str(pdf_path),
            extract_engine="docling",
            page_from=1,
            page_to=1,
        )
    mock_docling.assert_called_once()
    joined = " ".join(texts)
    assert "Native page one" in joined
    assert "Native page two" not in joined


def test_docling_units_still_apply_range_and_strip(tmp_path: Path):
    pdf_path = tmp_path / "layout.pdf"
    pdf_path.write_bytes(b"%PDF-1.4")
    units = [
        (1, "LETTERHEAD\nKeep page 1\nLETTERHEAD"),
        (2, "LETTERHEAD\nKeep page 2\nLETTERHEAD"),
        (3, "LETTERHEAD\nKeep page 3\nLETTERHEAD"),
        (4, "LETTERHEAD\nSkip page 4\nLETTERHEAD"),
    ]
    with patch(
        "app.services.rag.docling_extract.try_extract_docling_units",
        return_value=units,
    ):
        texts, meta = extract_text_from_file(
            str(pdf_path),
            extract_engine="docling",
            page_from=1,
            page_to=3,
            strip_chrome=True,
        )
    joined = " ".join(texts)
    assert "Keep page 1" in joined
    assert "Keep page 2" in joined
    assert "Keep page 3" in joined
    assert "Skip page 4" not in joined
    assert "LETTERHEAD" not in joined
    assert meta and meta[0].get("extract_engine") == ENGINE_DOCLING


def test_apply_meta_detects_engine_change():
    meta, changed = apply_pdf_options_to_meta({}, extract_engine="docling")
    assert changed is True
    assert meta[EXTRACT_ENGINE_KEY] == ENGINE_DOCLING
    same, again = apply_pdf_options_to_meta(meta, extract_engine="docling")
    assert again is False
    native, switched = apply_pdf_options_to_meta(same, extract_engine="native")
    assert switched is True
    assert native[EXTRACT_ENGINE_KEY] == ENGINE_NATIVE
