import os
import re
import json
import logging
from typing import Any, Dict, List, Optional, Tuple
from pathlib import Path
from urllib.parse import urlparse

import pandas as pd
from pypdf import PdfReader
import docx2txt
from bs4 import BeautifulSoup

from ..html_text_utils import enrich_contact_links
from ..page_outline import sections_for_page
from ..pdf_text_cleaner import normalize_pdf_extracted_text
from ..rich_text import editor_html_to_text
from ..textual_sources import (
    CHUNK_SOURCE_TYPE_QA,
    CHUNK_SOURCE_TYPE_TEXT,
    QA_EXT,
    TEXTUAL_EXTS,
    format_qa_chunk,
    parse_qa_pairs,
)
from . import document_outline
from .table_chunks import chunk_with_tables

logger = logging.getLogger(__name__)

# --- Chunk config ---
CHUNK_OVERLAP = 200
CHUNK_SIZES = {
    ".html": 1400,
    ".htm": 1400,
    ".pdf": 1200,
    ".docx": 1200,
    ".doc": 1200,
    ".pptx": 1000,
    ".xlsx": 1200,
    ".txt": 1500,
    ".md": 1500,
}

# Mis-suffixed OOXML/ZIP bytes read as text produce these markers.
_OOXML_GARBAGE_MARKERS = (
    "[Content_Types].xml",
    "ppt/slides/",
    "ppt/presentation.xml",
    "word/document.xml",
    "xl/workbook.xml",
    "_rels/.rels",
)

# Lone Unicode surrogates (U+D800..U+DFFF) leak out of pypdf when a PDF has
# malformed text streams. JSON serialization rejects them with
# "surrogates not allowed", which crashes the entire ingest and leaves the
# document permanently un-indexed. Strip them before anything else touches
# the extracted text.
_SURROGATE_RE = re.compile(r"[\ud800-\udfff]")


def _strip_surrogates(text: str) -> str:
    if not text:
        return ""
    return _SURROGATE_RE.sub("", text)


# Lazily-built sentence splitter so the import cost is paid once.
_sentence_splitter_cache: Dict[Tuple[int, int], Any] = {}


def _get_sentence_splitter(chunk_size: int, overlap: int):
    """Build a sentence-aware splitter whose chunk_size/overlap are in characters.

    llama-index's SentenceSplitter measures chunk_size in *tokens* by default
    (via tiktoken). Our existing CHUNK_SIZES table is in *characters* (1200
    for PDF, etc.), so we plug in ``tokenizer=list`` to make each character
    count as one token. This preserves the historical chunk-granularity
    while gaining sentence/paragraph awareness on top.
    """
    key = (int(chunk_size), int(overlap))
    splitter = _sentence_splitter_cache.get(key)
    if splitter is not None:
        return splitter
    try:
        from llama_index.core.node_parser import SentenceSplitter

        splitter = SentenceSplitter(
            chunk_size=chunk_size,
            chunk_overlap=overlap,
            tokenizer=list,
        )
    except Exception as exc:
        logger.warning(
            "SentenceSplitter unavailable (%s); falling back to char-based chunking", exc
        )
        splitter = None
    _sentence_splitter_cache[key] = splitter
    return splitter


# ---------------- Helpers ----------------
def normalize_url(url: str) -> str:
    """Normalize URL by removing extra whitespace, backticks, and fixing double slashes."""
    if not url:
        return ""

    url = url.strip().strip("`").strip()
    if not url:
        return ""

    # Skip non-HTTP URLs
    if not url.startswith(("http://", "https://", "file://")):
        return url

    try:
        parsed = urlparse(url)
        path = re.sub(r"/+", "/", parsed.path) if parsed.path else ""

        scheme = parsed.scheme
        netloc = parsed.netloc
        params = parsed.params
        query = parsed.query
        fragment = parsed.fragment

        normalized = f"{scheme}://{netloc}{path}"
        if params:
            normalized += f";{params}"
        if query:
            normalized += f"?{query}"
        if fragment:
            normalized += f"#{fragment}"

        return normalized
    except Exception as e:
        logger.warning(f"URL normalization failed for '{url}': {e}")
        return url


def chunk_text(text: str, chunk_size: int, overlap: int = CHUNK_OVERLAP) -> List[str]:
    """Split text into chunks aligned to sentence boundaries when possible.

    Uses llama-index's SentenceSplitter (already a project dep) to avoid
    mid-sentence / mid-word cuts that produce noisy embeddings. Falls back to
    the previous character-window splitter if llama-index is unavailable.
    """
    safe_text = _strip_surrogates(text or "")
    if not safe_text.strip():
        return []

    splitter = _get_sentence_splitter(chunk_size, overlap)
    if splitter is not None:
        try:
            parts = splitter.split_text(safe_text)
            return [p.strip() for p in parts if p and p.strip()]
        except Exception as exc:
            logger.warning("SentenceSplitter failed (%s); falling back to char chunking", exc)

    chunks: List[str] = []
    start = 0
    text_len = len(safe_text)
    while start < text_len:
        end = start + chunk_size
        chunks.append(safe_text[start:end].strip())
        if end >= text_len:
            break
        start = end - overlap
    return [c for c in chunks if c]


def looks_like_ooxml_garbage(text: str) -> bool:
    """True when text looks like raw OOXML/ZIP bytes decoded as UTF-8."""
    sample = (text or "")[:8000]
    if not sample.strip():
        return False
    head = sample[:64]
    if head.startswith("PK") or "\x00" in sample[:200]:
        marker_hits = sum(1 for m in _OOXML_GARBAGE_MARKERS if m in sample)
        if marker_hits >= 1:
            return True
    marker_hits = sum(1 for m in _OOXML_GARBAGE_MARKERS if m in sample)
    return marker_hits >= 2


def _extract_pptx_slide_texts(filepath: str) -> List[Tuple[int, str]]:
    """Return [(slide_number, text), ...] from a .pptx file."""
    from pptx import Presentation
    from pptx.enum.shapes import MSO_SHAPE_TYPE

    prs = Presentation(filepath)
    slides: List[Tuple[int, str]] = []

    def _shape_text(shape) -> List[str]:
        parts: List[str] = []
        if getattr(shape, "has_text_frame", False) and shape.has_text_frame:
            text = (shape.text_frame.text or "").strip()
            if text:
                parts.append(text)
        if shape.shape_type == MSO_SHAPE_TYPE.TABLE and getattr(shape, "has_table", False):
            try:
                table = shape.table
                for row in table.rows:
                    cells = [(cell.text or "").strip() for cell in row.cells]
                    row_text = " | ".join(c for c in cells if c)
                    if row_text:
                        parts.append(row_text)
            except Exception:
                pass
        if shape.shape_type == MSO_SHAPE_TYPE.GROUP:
            try:
                for child in shape.shapes:
                    parts.extend(_shape_text(child))
            except Exception:
                pass
        return parts

    for slide_idx, slide in enumerate(prs.slides, start=1):
        parts: List[str] = []
        for shape in slide.shapes:
            try:
                parts.extend(_shape_text(shape))
            except Exception:
                continue
        if slide.has_notes_slide:
            try:
                notes = (slide.notes_slide.notes_text_frame.text or "").strip()
                if notes:
                    parts.append(notes)
            except Exception:
                pass
        combined = "\n".join(p for p in parts if p and p.strip()).strip()
        if combined:
            slides.append((slide_idx, _strip_surrogates(combined)))
    return slides


def _size_and_overlap(ext: str, chunk_profile: Optional[str] = None) -> tuple[int, int]:
    if not chunk_profile or chunk_profile == "default":
        return int(CHUNK_SIZES.get(ext, CHUNK_SIZES.get(".txt", 900))), CHUNK_OVERLAP
    from .chunk_profiles import overlap_for, size_for
    return size_for(ext, chunk_profile), overlap_for(chunk_profile)


def chunk_size_for_crawled_url(url: str) -> int:
    """Chunk size (chars) for a crawled URL — aligned with file ingest in this module."""
    path = urlparse(url or "").path.lower().split("?")[0]
    if path.endswith(".pdf"):
        return CHUNK_SIZES[".pdf"]
    if path.endswith((".html", ".htm")):
        return CHUNK_SIZES[".html"]
    if path.endswith((".docx", ".doc")):
        return CHUNK_SIZES[".docx"]
    if path.endswith(".pptx"):
        return CHUNK_SIZES[".pptx"]
    if path.endswith((".md",)):
        return CHUNK_SIZES[".md"]
    if path.endswith((".txt",)):
        return CHUNK_SIZES[".txt"]
    return CHUNK_SIZES.get(".txt", 900)


def _split_now(text: str, size: int, overlap: int, split_config: Any = None) -> List[str]:
    from .split_config import chunk_text_custom, parse_split_config

    cfg = parse_split_config(split_config)
    if cfg is not None:
        return chunk_text_custom(text, cfg.chunk_size, cfg.chunk_overlap, cfg.delimiters)
    return chunk_text(text, size, overlap)


def split_for_ingest(
    text: str, size: int, overlap: int, split_config: Any = None
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Native SentenceSplitter, or Custom delimiter split with optional extras."""
    from .split_config import chunk_text_custom, parse_split_config

    cfg = parse_split_config(split_config)
    body = text or ""
    if cfg is None:
        texts = chunk_text(body, size, overlap)
        return texts, [{} for _ in texts]
    if cfg.table_context in (1, 2):
        from .table_context import wrap_table_context

        body = wrap_table_context(body, cfg.table_context)
    texts = chunk_text_custom(body, cfg.chunk_size, cfg.chunk_overlap, cfg.delimiters)
    if cfg.parent_child:
        from .parent_child import expand_parent_child

        return expand_parent_child(texts, cfg)
    return texts, [{} for _ in texts]


def chunks_for_crawled_document(
    url: str,
    text: str,
    chunk_profile: Optional[str] = None,
    split_config: Any = None,
) -> List[str]:
    """Split crawled page text into embedding-sized chunks (same rules as uploaded files)."""
    texts, _ = ingest_chunks_for_crawled_document(
        url, text, chunk_profile=chunk_profile, split_config=split_config
    )
    return texts


def ingest_chunks_for_crawled_document(
    url: str,
    text: str,
    chunk_profile: Optional[str] = None,
    split_config: Any = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Like ``chunks_for_crawled_document`` plus Custom parent metadata (empty on Native)."""
    from .split_config import parse_split_config

    safe_text = text or ""
    path = urlparse(url or "").path.lower().split("?")[0]
    if path.endswith(".pdf"):
        safe_text = normalize_pdf_extracted_text(safe_text)
    ext = ".html"
    for candidate in (".pdf", ".html", ".htm", ".docx", ".doc", ".pptx", ".md", ".txt"):
        if path.endswith(candidate):
            ext = candidate
            break
    size, overlap = _size_and_overlap(ext, chunk_profile)
    if not chunk_profile or chunk_profile == "default":
        size = chunk_size_for_crawled_url(url)
        overlap = CHUNK_OVERLAP
    cfg = parse_split_config(split_config)
    if cfg is not None:
        return split_for_ingest(safe_text, size, overlap, split_config)
    texts = chunk_with_tables(
        safe_text,
        size,
        lambda body, chunk_size: chunk_text(body, chunk_size, overlap),
    )
    return texts, [{} for _ in texts]


def chunk_text_custom_safe(text: str, size: int, overlap: int, delimiter: str) -> List[str]:
    from .split_config import chunk_text_custom

    return chunk_text_custom(text, size, overlap, delimiter)


def _as_primitive(x: Any) -> Any:
    """Serialize metadata values to safe primitives (string/number/bool)."""
    if x is None:
        return ""
    if isinstance(x, (str, int, float, bool)):
        return x
    try:
        return json.dumps(x)
    except Exception:
        return str(x)


def _extract_title_from_row(row: pd.Series) -> str:
    for col in ["title", "Title", "name", "Name"]:
        if col in row and pd.notna(row[col]):
            return str(row[col]).strip()
    return ""


def _detect_url_column(df: pd.DataFrame) -> List[str]:
    """Return candidate url column names."""
    candidates = [
        "url",
        "link",
        "href",
        "website",
        "source",
        "reference",
        "page_url",
        "pageUrl",
        "canonical_url",
        "canonicalUrl",
        "permalink",
        
    ]
    cols = []
    for col in df.columns:
        col_lower = col.lower().strip()
        if col_lower in candidates or any(p in col_lower for p in candidates):
            cols.append(col)
    return cols


def _extract_url_from_row(
    row: pd.Series, df: pd.DataFrame, filepath: str, row_index: int
) -> str:
    url_columns = _detect_url_column(df)
    for col in url_columns:
        if pd.notna(row[col]):
            url_val = str(row[col]).strip()
            if url_val:
                url = normalize_url(url_val)
                if not url.startswith(("http://", "https://", "file://")):
                    url = f"file://{os.path.basename(filepath)}#row-{row_index + 1}"
                return url
    return f"file://{os.path.basename(filepath)}#row-{row_index + 1}"


def _extract_keywords_from_row(row: pd.Series) -> str:
    for col in ["keywords", "keyword", "tags", "Keywords"]:
        if col in row and pd.notna(row[col]):
            return str(row[col]).strip()
    return ""


def _extract_content_from_row(row: pd.Series) -> str:
    for col in [
        "meaningful_content",
        "Meaningful_Content",
        "meaningfulContent",
        "content",
        "text",
        "description",
        "text_content",
    ]:
        if col in row and pd.notna(row[col]):
            return str(row[col]).strip()
    # fallback: concatenation
    return " ".join([str(v) for v in row.values if pd.notna(v)])


def _extract_textual_source(
    filepath: str, ext: str, split_config: Any = None
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Text / Q&A sources: chunks carry ``source_type`` and no URL (never cited)."""
    from .split_config import parse_split_config

    with open(filepath, "rb") as f:
        raw = f.read()
    title = os.path.splitext(os.path.basename(filepath))[0]
    cfg = parse_split_config(split_config)
    extras: List[Dict[str, Any]] = []
    if ext == QA_EXT:
        source_type = CHUNK_SOURCE_TYPE_QA
        pairs = [
            _strip_surrogates(format_qa_chunk(pair["question"], pair["answer"]))
            for pair in parse_qa_pairs(raw)
        ]
        if cfg is None:
            texts = pairs
            extras = [{} for _ in texts]
        else:
            joined = cfg.delimiter.join(pairs)
            texts, extras = split_for_ingest(joined, cfg.chunk_size, cfg.chunk_overlap, split_config)
    else:
        source_type = CHUNK_SOURCE_TYPE_TEXT
        raw_text = _strip_surrogates(raw.decode("utf-8", errors="ignore"))
        plain = editor_html_to_text(raw_text)
        texts, extras = split_for_ingest(plain, CHUNK_SIZES[".txt"], CHUNK_OVERLAP, split_config)
    metadata_list = [
        {
            "title": _as_primitive(title),
            "url": "",
            "keywords": "",
            "chunk_index": idx,
            "source_type": source_type,
        }
        for idx in range(len(texts))
    ]
    if extras and any(extra.get("parent_id") for extra in extras):
        from .parent_child import merge_parent_metadata

        metadata_list = merge_parent_metadata(metadata_list, extras)
    return texts, metadata_list


def extract_text_from_file(
    filepath: str,
    chunk_profile: Optional[str] = None,
    *,
    page_from: Optional[int] = None,
    page_to: Optional[int] = None,
    strip_chrome: bool = False,
    extract_engine: Optional[str] = None,
    strip_header: Optional[bool] = None,
    strip_footer: Optional[bool] = None,
    ocr_model: Optional[str] = None,
    split_config: Any = None,
) -> Tuple[List[str], List[Dict[str, Any]]]:
    """Return (text_chunks, metadata_per_chunk) for a given file.

    PDF ``page_from`` / ``page_to`` / ``strip_chrome`` default off so crawl,
    connectors, and existing callers keep today's all-pages extract.
    ``extract_engine=docling`` is best-effort; native extract runs if Docling
    is missing or returns no text.
    """
    from .pdf_page_extract import resolve_strip_sides

    header_on, footer_on = resolve_strip_sides(
        strip_chrome=strip_chrome,
        strip_header=strip_header,
        strip_footer=strip_footer,
    )
    ext = os.path.splitext(filepath)[1].lower()
    texts: List[str] = []
    metadata_list: List[Dict[str, Any]] = []
    split_extras: List[Dict[str, Any]] = []
    outline_text = ""
    outline_headings: List[str] = []

    from .docling_extract import ENGINE_DOCLING, normalize_extract_engine

    do_ocr = bool(str(ocr_model or "").strip())
    if do_ocr:
        extract_engine = ENGINE_DOCLING
    if normalize_extract_engine(extract_engine) == ENGINE_DOCLING:
        from .docling_extract import try_extract_docling_units
        from .pdf_page_extract import slice_numbered_texts

        units = try_extract_docling_units(filepath, do_ocr=do_ocr)
        if units:
            units = slice_numbered_texts(
                units,
                page_from=page_from,
                page_to=page_to,
                strip_chrome=header_on or footer_on,
                strip_header=header_on,
                strip_footer=footer_on,
            )
            raw_docling = _strip_surrogates("\n\n".join(text for _, text in units))
            if raw_docling.strip():
                size, overlap = _size_and_overlap(ext if ext in CHUNK_SIZES else ".pdf", chunk_profile)
                texts, extras = split_for_ingest(raw_docling, size, overlap, split_config)
                bases = [{"extract_engine": ENGINE_DOCLING} for _ in texts]
                if extras and any(extra.get("parent_id") for extra in extras):
                    from .parent_child import merge_parent_metadata

                    bases = merge_parent_metadata(bases, extras)
                return texts, bases
        logger.info("Docling skipped or empty for %s; using native extract", os.path.basename(filepath))

    if ext == ".pdf":
        from .pdf_page_extract import extract_pdf_page_text

        pdf_reader = PdfReader(filepath)
        raw_text = extract_pdf_page_text(
            pdf_reader,
            page_from=page_from,
            page_to=page_to,
            strip_chrome=header_on or footer_on,
            strip_header=header_on,
            strip_footer=footer_on,
        )
        raw_text = _strip_surrogates(raw_text)
        raw_text = normalize_pdf_extracted_text(raw_text)
        pdf_size, pdf_overlap = _size_and_overlap(".pdf", chunk_profile)
        texts, split_extras = split_for_ingest(raw_text, pdf_size, pdf_overlap, split_config)
        outline_text, outline_headings = raw_text, document_outline.pdf_outline_titles(pdf_reader)

    elif ext in [".docx", ".doc"]:
        if ext == ".docx" and (header_on or footer_on):
            from .pdf_page_extract import extract_docx_text

            raw_text = _strip_surrogates(
                extract_docx_text(
                    filepath, strip_header=header_on, strip_footer=footer_on
                )
                or ""
            )
        else:
            raw_text = _strip_surrogates(docx2txt.process(filepath) or "")
        if looks_like_ooxml_garbage(raw_text):
            raise ValueError(
                "DOCX extraction produced OOXML/ZIP garbage — file may be mislabeled"
            )
        docx_size, docx_overlap = _size_and_overlap(".docx", chunk_profile)
        texts, split_extras = split_for_ingest(raw_text, docx_size, docx_overlap, split_config)
        if ext == ".docx":
            outline_text, outline_headings = raw_text, document_outline.docx_heading_texts(filepath)

    elif ext == ".pptx":
        from .pdf_page_extract import slice_numbered_texts

        slide_texts = _extract_pptx_slide_texts(filepath)
        if not slide_texts:
            raise ValueError("No text extracted from PPTX")
        combined_preview = "\n".join(t for _, t in slide_texts[:5])
        if looks_like_ooxml_garbage(combined_preview):
            raise ValueError(
                "PPTX extraction produced OOXML/ZIP garbage — file may be mislabeled"
            )
        slide_texts = slice_numbered_texts(
            slide_texts,
            page_from=page_from,
            page_to=page_to,
            strip_chrome=header_on or footer_on,
            strip_header=header_on,
            strip_footer=footer_on,
        )
        if not slide_texts:
            raise ValueError("No text extracted from PPTX")
        title = os.path.splitext(os.path.basename(filepath))[0]
        slide_titles = document_outline.pptx_slide_titles(filepath)
        texts = []
        metadata_list = []
        for slide_num, slide_text in slide_texts:
            pptx_size, pptx_overlap = _size_and_overlap(".pptx", chunk_profile)
            slide_chunks, slide_extras = split_for_ingest(
                slide_text, pptx_size, pptx_overlap, split_config
            )
            for local_idx, chunk in enumerate(slide_chunks):
                texts.append(chunk)
                meta = {
                    "title": _as_primitive(title),
                    "url": _as_primitive(f"file://{os.path.basename(filepath)}"),
                    "keywords": "",
                    "chunk_index": len(texts) - 1,
                    "slide_number": slide_num,
                    "page": slide_num,
                    "slide_chunk_index": local_idx,
                }
                extra = slide_extras[local_idx] if local_idx < len(slide_extras) else {}
                if extra.get("parent_id"):
                    meta["parent_id"] = f"s{slide_num}-{extra['parent_id']}"
                    meta["parent_text"] = extra.get("parent_text") or ""
                if slide_titles.get(slide_num):
                    meta["section"] = slide_titles[slide_num]
                metadata_list.append(meta)

    elif ext == ".ppt":
        raise ValueError(
            "Unsupported file type: .ppt (legacy PowerPoint). Convert to .pptx and re-upload."
        )

    elif ext == ".xlsx":
        from .split_config import parse_split_config
        from .spreadsheet_extract import extract_xlsx_chunks, extract_xlsx_markdown_chunks

        xlsx_size, xlsx_overlap = _size_and_overlap(".xlsx", chunk_profile)
        cfg = parse_split_config(split_config)
        packer_size = cfg.chunk_size if cfg is not None else xlsx_size
        if cfg is not None and cfg.excel_as_html:
            texts, metadata_list = extract_xlsx_markdown_chunks(
                filepath,
                chunk_size=packer_size,
                split_text=lambda text, chunk_size: _split_now(
                    text, chunk_size, xlsx_overlap, split_config
                ),
                sheet_from=page_from,
                sheet_to=page_to,
            )
        else:
            texts, metadata_list = extract_xlsx_chunks(
                filepath,
                chunk_size=xlsx_size,
                split_text=lambda text, chunk_size: _split_now(
                    text, chunk_size, xlsx_overlap, split_config
                ),
                sheet_from=page_from,
                sheet_to=page_to,
            )
        if cfg is not None and cfg.parent_child and texts:
            from .parent_child import expand_parent_child, merge_parent_metadata

            texts, split_extras = expand_parent_child(texts, cfg)
            metadata_list = merge_parent_metadata(metadata_list, split_extras)
            split_extras = []

    elif ext == ".xls":
        raise ValueError(
            "Unsupported file type: .xls (legacy Excel). Convert to .xlsx and re-upload."
        )

    elif ext in [".txt", ".md"]:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            raw_text = _strip_surrogates(f.read())
        if looks_like_ooxml_garbage(raw_text):
            raise ValueError(
                "Text extraction looks like OOXML/ZIP bytes — refusing to index binary garbage"
            )
        txt_size, txt_overlap = _size_and_overlap(ext if ext in CHUNK_SIZES else ".txt", chunk_profile)
        texts, split_extras = split_for_ingest(raw_text, txt_size, txt_overlap, split_config)

    elif ext in [".html", ".htm"]:
        with open(filepath, "r", encoding="utf-8", errors="ignore") as f:
            soup = BeautifulSoup(f, "html.parser")
            enrich_contact_links(soup)
            raw_text = _strip_surrogates(soup.get_text(separator="\n"))

            urls_from_html: List[str] = []
            for link in soup.find_all("a", href=True):
                href = link.get("href")
                if not href:
                    continue
                normalized_href = normalize_url(href)
                if normalized_href.startswith(("http://", "https://", "file://")):
                    urls_from_html.append(normalized_href)

            html_size, html_overlap = _size_and_overlap(".html", chunk_profile)
            texts, split_extras = split_for_ingest(raw_text, html_size, html_overlap, split_config)
            if urls_from_html:
                urls_text = "URLs found in document: " + ", ".join(sorted(set(urls_from_html)))
                texts.append(urls_text)
                split_extras.append({})

    elif ext == ".csv":
        from .split_config import parse_split_config
        from .spreadsheet_extract import MAX_XLSX_DATA_ROWS, format_cell, markdown_table

        df = pd.read_csv(filepath, on_bad_lines="skip", dtype=str)
        texts = []
        metadata_list = []
        cfg = parse_split_config(split_config)
        csv_size, csv_overlap = _size_and_overlap(".txt", chunk_profile)

        if cfg is not None and cfg.excel_as_html:
            headers = [str(col) for col in df.columns]
            rows: List[List[str]] = []
            for _, row in df.head(MAX_XLSX_DATA_ROWS).iterrows():
                rows.append(
                    [format_cell(value) if pd.notna(value) else "" for value in row.tolist()]
                )
            table = markdown_table(headers, rows)
            if table.strip():
                texts, extras = split_for_ingest(table, csv_size, csv_overlap, split_config)
                title = os.path.splitext(os.path.basename(filepath))[0]
                metadata_list = [
                    {
                        "title": _as_primitive(title),
                        "url": _as_primitive(f"file://{os.path.basename(filepath)}"),
                        "keywords": "",
                        "chunk_index": chunk_idx,
                    }
                    for chunk_idx in range(len(texts))
                ]
                if extras and any(extra.get("parent_id") for extra in extras):
                    from .parent_child import merge_parent_metadata

                    metadata_list = merge_parent_metadata(metadata_list, extras)
        else:
            for idx, row in df.iterrows():
                title = _extract_title_from_row(row)
                url = _extract_url_from_row(row, df, filepath, idx)
                keywords = _extract_keywords_from_row(row)
                content = _extract_content_from_row(row)

                content = _strip_surrogates(content)
                if not content.strip():
                    continue

                content_chunks, extras = split_for_ingest(
                    content, csv_size, csv_overlap, split_config
                )
                for chunk_idx, chunk_text_content in enumerate(content_chunks):
                    texts.append(chunk_text_content)
                    meta = {
                        "title": _as_primitive(title),
                        "url": _as_primitive(url),
                        "keywords": _as_primitive(keywords),
                        "chunk_index": chunk_idx,
                        "row_index": idx,
                    }
                    extra = extras[chunk_idx] if chunk_idx < len(extras) else {}
                    if extra.get("parent_id"):
                        meta["parent_id"] = f"r{idx}-{extra['parent_id']}"
                        meta["parent_text"] = extra.get("parent_text") or ""
                    metadata_list.append(meta)
    elif ext in TEXTUAL_EXTS:
        texts, metadata_list = _extract_textual_source(filepath, ext, split_config=split_config)
    else:
        raise ValueError(f"Unsupported file type: {ext}")

    logger.info(f"Extracted {len(texts)} chunks from {filepath}")

    # For non-CSV / non-PPTX / non-XLSX / non-textual sources: generate basic metadata per chunk
    if ext not in (".csv", ".pptx", ".xlsx") and ext not in TEXTUAL_EXTS:
        metadata_list = []
        title = os.path.splitext(os.path.basename(filepath))[0]
        url_pattern = r"https?://[^\s,<>'\")]+|www\.[^\s,<>'\")]+"

        for chunk_idx, text in enumerate(texts):
            found_urls = re.findall(url_pattern, text)
            chunk_url = ""
            if found_urls:
                chunk_url = normalize_url(found_urls[0])
                if not chunk_url.startswith(("http://", "https://", "file://")):
                    chunk_url = ""
            if not chunk_url:
                chunk_url = f"file://{os.path.basename(filepath)}"

            metadata_list.append(
                {
                    "title": _as_primitive(title),
                    "url": _as_primitive(chunk_url),
                    "keywords": "",
                    "chunk_index": chunk_idx,
                }
            )

    if outline_headings:
        sections = sections_for_page(outline_text, texts, outline_headings)
        for meta, section in zip(metadata_list, sections):
            if section:
                meta["section"] = section

    if split_extras and any(extra.get("parent_id") for extra in split_extras):
        from .parent_child import merge_parent_metadata

        metadata_list = merge_parent_metadata(metadata_list, split_extras)

    return texts, metadata_list


def batch_iterate(lst: List[Any], size: int):
    for i in range(0, len(lst), size):
        yield lst[i : i + size]
