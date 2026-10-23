"""Chunk profiles — size/overlap only. Extractors stay the same.

``default`` is exact CHUNK_SIZES + overlap 200.
Profiles are inferred from source type / filename at ingest (no project UI).
"""
from __future__ import annotations

import os
from typing import Dict, Mapping, Optional

from .utils_rag import CHUNK_OVERLAP, CHUNK_SIZES

PROFILES = ("default", "web", "pdf_manual", "spreadsheet", "faq")
DEFAULT_PROFILE = "default"

# Non-default profiles only change size/overlap. Missing ext falls back to CHUNK_SIZES.
_PROFILE_OVERLAP = {
    "default": CHUNK_OVERLAP,
    "web": 120,
    "pdf_manual": 280,
    "spreadsheet": CHUNK_OVERLAP,
    "faq": 80,
}
_PROFILE_SIZES: Dict[str, Mapping[str, int]] = {
    "web": {".html": 900, ".htm": 900, ".txt": 900, ".md": 900},
    "pdf_manual": {".pdf": 800, ".docx": 800, ".doc": 800},
    "spreadsheet": {".xlsx": CHUNK_SIZES[".xlsx"]},
    "faq": {
        ".html": 2200,
        ".htm": 2200,
        ".pdf": 2200,
        ".docx": 2200,
        ".doc": 2200,
        ".txt": 2200,
        ".md": 2200,
        ".pptx": 1800,
        ".xlsx": 1800,
    },
}


def normalize_profile(value: Optional[str]) -> str:
    raw = (value or DEFAULT_PROFILE).strip().lower()
    return raw if raw in PROFILES else DEFAULT_PROFILE


def profile_for_source(kind: Optional[str] = None, filename: Optional[str] = None) -> str:
    """Pick a chunk profile from source kind and/or filename. Ignores project.chunk_profile."""
    source = (kind or "").strip().lower()
    name = (filename or "").strip().lower()
    ext = os.path.splitext(os.path.basename(name))[1] if name else ""
    if not ext and name.startswith("."):
        ext = name
    if source in {"crawl", "website", "domain", "sitemap", "web"}:
        return "web"
    if source in {"qa", "qa_pairs"} or ext == ".rsqa":
        return "faq"
    if source in {"text"} or ext == ".rstext":
        return DEFAULT_PROFILE
    if ext in {".pdf", ".doc", ".docx"}:
        return "pdf_manual"
    if ext in {".xlsx", ".xls", ".csv"}:
        return "spreadsheet"
    return DEFAULT_PROFILE


def overlap_for(profile: Optional[str]) -> int:
    return int(_PROFILE_OVERLAP.get(normalize_profile(profile), CHUNK_OVERLAP))


def size_for(ext: str, profile: Optional[str]) -> int:
    key = (ext or "").lower()
    if not key.startswith("."):
        key = f".{key}" if key else ".txt"
    name = normalize_profile(profile)
    if name == DEFAULT_PROFILE:
        return int(CHUNK_SIZES.get(key, CHUNK_SIZES.get(".txt", 900)))
    override = _PROFILE_SIZES.get(name, {})
    if key in override:
        return int(override[key])
    return int(CHUNK_SIZES.get(key, CHUNK_SIZES.get(".txt", 900)))
