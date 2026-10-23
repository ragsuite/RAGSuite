"""Optional Docling extract for uploaded PDF/Office files.

Native extract stays the default. Docling is opt-in per document (``extract_engine``
in ``UploadedDocument.meta_data``). Missing wheels (Python 3.14), ImportError, or
extract failure fall back to native — uploads must not fail because Docling is absent.

OCR stays off.
"""
from __future__ import annotations

import logging
import os
from typing import List, Optional, Tuple

logger = logging.getLogger(__name__)

DOCLING_EXTS = frozenset({".pdf", ".docx", ".pptx", ".xlsx"})
EXTRACT_ENGINE_KEY = "extract_engine"
ENGINE_NATIVE = "native"
ENGINE_DOCLING = "docling"

UnitText = Tuple[int, str]


def filename_supports_docling(name: Optional[str]) -> bool:
    leaf = (name or "").split("?")[0].strip().lower()
    ext = os.path.splitext(leaf)[1]
    return ext in DOCLING_EXTS or ext == ".zip"


def normalize_extract_engine(value: object) -> str:
    raw = str(value or "").strip().lower()
    return ENGINE_DOCLING if raw == ENGINE_DOCLING else ENGINE_NATIVE


def engine_from_meta(meta: Optional[dict]) -> str:
    data = meta if isinstance(meta, dict) else {}
    return normalize_extract_engine(data.get(EXTRACT_ENGINE_KEY))


def docling_available() -> bool:
    try:
        import docling  # noqa: F401

        return True
    except Exception:
        return False


def try_extract_docling_units(filepath: str, *, do_ocr: bool = False) -> Optional[List[UnitText]]:
    """Return numbered page/slide/sheet texts, or None to use native extract.

    OCR stays off unless the document selected an OCR model. Any import or
    runtime failure returns None.
    """
    ext = os.path.splitext(filepath or "")[1].lower()
    if ext not in DOCLING_EXTS:
        return None
    try:
        from docling.datamodel.base_models import InputFormat
        from docling.datamodel.pipeline_options import PdfPipelineOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
    except Exception as exc:
        logger.info("Docling not available (%s); using native extract", exc)
        return None
    try:
        pipeline_options = PdfPipelineOptions()
        pipeline_options.do_ocr = bool(do_ocr)
        converter = DocumentConverter(
            format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=pipeline_options)}
        )
        result = converter.convert(filepath)
        document = getattr(result, "document", None)
        if document is None:
            return None
        units = _unit_texts(document)
        if not units:
            logger.info("Docling produced no text for %s; using native extract", filepath)
            return None
        return units
    except Exception as exc:
        logger.warning("Docling extract failed for %s: %s", filepath, exc)
        return None


def _unit_texts(document: object) -> List[UnitText]:
    pages = getattr(document, "pages", None)
    out: List[UnitText] = []
    if pages:
        items = list(pages.values()) if hasattr(pages, "values") else list(pages)
        for index, page in enumerate(items, start=1):
            text = _page_text(page)
            if text.strip():
                out.append((index, text))
        if out:
            return out
    markdown = ""
    export = getattr(document, "export_to_markdown", None)
    if callable(export):
        try:
            markdown = export() or ""
        except Exception:
            markdown = ""
    if str(markdown).strip():
        return [(1, str(markdown))]
    return []


def _page_text(page: object) -> str:
    export = getattr(page, "export_to_markdown", None)
    if callable(export):
        try:
            text = export() or ""
            if str(text).strip():
                return str(text)
        except Exception:
            pass
    for attr in ("text", "markdown", "md"):
        value = getattr(page, attr, None)
        if isinstance(value, str) and value.strip():
            return value
    return ""
