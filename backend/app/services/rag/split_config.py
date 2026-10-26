"""Per-source Native vs Custom splitting.

Missing / native / invalid config is ``None`` so ingest stays on today's
SentenceSplitter + ``profile_for_source`` path.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Dict, List, Mapping, Optional, Sequence

SPLIT_MODE_NATIVE = "native"
SPLIT_MODE_CUSTOM = "custom"
SPLIT_CONFIG_KEY = "split_config"

DELIMITER_PRESETS: Dict[str, str] = {
    "paragraph": "\n\n",
    "sentence": ".",
    "newline": "\n",
    "question": "?",
    "exclaim": "!",
    "semicolon": ";",
}
DELIMITER_PRESET_ORDER: Sequence[str] = (
    "paragraph",
    "sentence",
    "newline",
    "question",
    "exclaim",
    "semicolon",
    "custom",
)
PRESET_CUSTOM = "custom"

SIZE_MIN = 200
SIZE_MAX = 4000
OVERLAP_MIN = 0
OVERLAP_MAX = 500
DELIMITER_MAX = 20
TABLE_CONTEXT_VALUES = (0, 1, 2)


class SplitConfigError(ValueError):
    """Invalid Custom splitting settings (API 400)."""


@dataclass(frozen=True)
class SplitConfig:
    chunk_size: int
    chunk_overlap: int
    delimiter_preset: str
    delimiter_custom: Optional[str] = None
    parent_child: bool = False
    table_context: int = 0
    excel_as_html: bool = False

    @property
    def delimiter(self) -> str:
        if self.delimiter_preset == PRESET_CUSTOM:
            return str(self.delimiter_custom or "")
        return DELIMITER_PRESETS.get(self.delimiter_preset, "")

    def to_dict(self) -> Dict[str, Any]:
        payload: Dict[str, Any] = {
            "mode": SPLIT_MODE_CUSTOM,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "delimiter_preset": self.delimiter_preset,
            "delimiter_custom": self.delimiter_custom,
        }
        if self.parent_child:
            payload["parent_child"] = True
        if self.table_context in (1, 2):
            payload["table_context"] = int(self.table_context)
        if self.excel_as_html:
            payload["excel_as_html"] = True
        return payload


def _as_mapping(raw: Any) -> Optional[Mapping[str, Any]]:
    if raw is None:
        return None
    if isinstance(raw, Mapping):
        nested = raw.get(SPLIT_CONFIG_KEY)
        if isinstance(nested, Mapping):
            return nested
        if "mode" in raw or "chunk_size" in raw or "delimiter_preset" in raw:
            return raw
    return None


def _int_or_none(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _first_set(*values: Any) -> Any:
    for value in values:
        if value is not None and value != "":
            return value
    return None


def _as_bool(value: Any, default: bool = False) -> bool:
    if value is None or value == "":
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    text = str(value).strip().lower()
    if text in ("true", "1", "yes", "on"):
        return True
    if text in ("false", "0", "no", "off"):
        return False
    return default


def _as_table_context(value: Any, *, strict: bool) -> int:
    if value is None or value == "":
        return 0
    number = _int_or_none(value)
    if number in TABLE_CONTEXT_VALUES:
        return int(number)
    if strict:
        raise SplitConfigError("Extra text around tables must be None, 1 sentence, or 2 sentences.")
    return 0


def resolved_delimiter(preset: Optional[str], custom: Optional[str]) -> str:
    key = str(preset or "").strip().lower()
    if key == PRESET_CUSTOM:
        return str(custom or "")
    return DELIMITER_PRESETS.get(key, "")


def parse_split_config(raw: Any) -> Optional[SplitConfig]:
    """Return a valid Custom config, else ``None`` (native). Never raises."""
    data = _as_mapping(raw)
    if not data:
        return None
    mode = str(data.get("mode") or data.get("split_mode") or "").strip().lower()
    if mode != SPLIT_MODE_CUSTOM:
        return None
    try:
        return validate_split_config(
            chunk_size=data.get("chunk_size"),
            chunk_overlap=data.get("chunk_overlap"),
            delimiter_preset=data.get("delimiter_preset") or data.get("chunk_delimiter_preset"),
            delimiter_custom=data.get("delimiter_custom") or data.get("chunk_delimiter_custom"),
            parent_child=_as_bool(data.get("parent_child"), False),
            table_context=_as_table_context(data.get("table_context"), strict=False),
            excel_as_html=_as_bool(data.get("excel_as_html"), False),
        )
    except SplitConfigError:
        return None


def validate_split_config(
    *,
    chunk_size: Any,
    chunk_overlap: Any,
    delimiter_preset: Any,
    delimiter_custom: Any = None,
    parent_child: Any = False,
    table_context: Any = 0,
    excel_as_html: Any = False,
) -> SplitConfig:
    size = _int_or_none(chunk_size)
    overlap = _int_or_none(chunk_overlap)
    preset = str(delimiter_preset or "").strip().lower()
    custom = str(delimiter_custom or "")
    if size is None or size < SIZE_MIN or size > SIZE_MAX:
        raise SplitConfigError(f"Piece size must be between {SIZE_MIN} and {SIZE_MAX}.")
    if overlap is None or overlap < OVERLAP_MIN or overlap > OVERLAP_MAX:
        raise SplitConfigError(f"Overlap must be between {OVERLAP_MIN} and {OVERLAP_MAX}.")
    if overlap >= size:
        raise SplitConfigError("Overlap must be smaller than piece size.")
    if preset not in DELIMITER_PRESETS and preset != PRESET_CUSTOM:
        raise SplitConfigError("Choose where to split the text.")
    delim = resolved_delimiter(preset, custom)
    if not delim or len(delim) > DELIMITER_MAX:
        raise SplitConfigError("Split-at text cannot be empty (max 20 characters).")
    return SplitConfig(
        chunk_size=size,
        chunk_overlap=overlap,
        delimiter_preset=preset,
        delimiter_custom=custom if preset == PRESET_CUSTOM else None,
        parent_child=_as_bool(parent_child, False),
        table_context=_as_table_context(table_context, strict=True),
        excel_as_html=_as_bool(excel_as_html, False),
    )


def validate_split_fields(
    *,
    split_mode: Any = None,
    chunk_size: Any = None,
    chunk_overlap: Any = None,
    delimiter_preset: Any = None,
    delimiter_custom: Any = None,
    parent_child: Any = None,
    table_context: Any = None,
    excel_as_html: Any = None,
    split_config: Any = None,
) -> Optional[Dict[str, Any]]:
    """API helper: omitted/native → None; Custom → stored dict or SplitConfigError."""
    nested = _as_mapping(split_config) or {}
    mode = str(split_mode or nested.get("mode") or "").strip().lower()
    if not mode or mode == SPLIT_MODE_NATIVE:
        return None
    if mode != SPLIT_MODE_CUSTOM:
        raise SplitConfigError("Splitting method must be RAGSuite native or Custom.")
    cfg = validate_split_config(
        chunk_size=chunk_size if chunk_size is not None else nested.get("chunk_size"),
        chunk_overlap=chunk_overlap if chunk_overlap is not None else nested.get("chunk_overlap"),
        delimiter_preset=delimiter_preset or nested.get("delimiter_preset"),
        delimiter_custom=delimiter_custom if delimiter_custom is not None else nested.get("delimiter_custom"),
        parent_child=_first_set(parent_child, nested.get("parent_child"), False),
        table_context=_first_set(table_context, nested.get("table_context"), 0),
        excel_as_html=_first_set(excel_as_html, nested.get("excel_as_html"), False),
    )
    return cfg.to_dict()


def split_config_from_meta(meta: Any) -> Optional[SplitConfig]:
    data = meta if isinstance(meta, Mapping) else {}
    return parse_split_config(data.get(SPLIT_CONFIG_KEY) if isinstance(data, Mapping) else None)


def snapshot_split_config(raw: Any) -> Optional[Dict[str, Any]]:
    """Job-payload snapshot. None means native (including invalid Custom)."""
    cfg = parse_split_config(raw)
    return cfg.to_dict() if cfg else None


def merge_split_config_into_meta(meta: Optional[Dict[str, Any]], stored: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    out = dict(meta or {})
    if stored:
        out[SPLIT_CONFIG_KEY] = stored
    else:
        out.pop(SPLIT_CONFIG_KEY, None)
    return out


def split_config_for_api(meta: Any = None, raw: Any = None) -> Dict[str, Any]:
    data = raw if isinstance(raw, Mapping) else None
    if data is None and isinstance(meta, Mapping):
        nested = meta.get(SPLIT_CONFIG_KEY)
        data = nested if isinstance(nested, Mapping) else None
    cfg = parse_split_config(data)
    if cfg is None:
        return {
            "splitMode": SPLIT_MODE_NATIVE,
            "chunkSize": None,
            "chunkOverlap": None,
            "delimiterPreset": None,
            "delimiterCustom": None,
            "parentChild": False,
            "tableContext": 0,
            "excelAsHtml": False,
        }
    return {
        "splitMode": SPLIT_MODE_CUSTOM,
        "chunkSize": cfg.chunk_size,
        "chunkOverlap": cfg.chunk_overlap,
        "delimiterPreset": cfg.delimiter_preset,
        "delimiterCustom": cfg.delimiter_custom,
        "parentChild": bool(cfg.parent_child),
        "tableContext": int(cfg.table_context),
        "excelAsHtml": bool(cfg.excel_as_html),
    }


def _units(text: str, delimiter: str) -> List[str]:
    if not delimiter:
        return [text] if text else []
    parts = text.split(delimiter)
    if not parts:
        return []
    out: List[str] = []
    for i, part in enumerate(parts):
        piece = part if i == len(parts) - 1 else part + delimiter
        if piece:
            out.append(piece)
    return out


def _window(text: str, size: int, overlap: int) -> List[str]:
    chunks: List[str] = []
    start = 0
    n = len(text)
    step = max(1, size - overlap)
    while start < n:
        piece = text[start : start + size]
        stripped = piece.strip()
        if stripped:
            chunks.append(stripped)
        if start + size >= n:
            break
        start += step
    return chunks


def chunk_text_custom(text: str, size: int, overlap: int, delimiter: str) -> List[str]:
    """Split on ``delimiter``, pack up to ``size``, overlap the tail of the previous piece."""
    body = text or ""
    if not body.strip():
        return []
    size = max(1, int(size))
    overlap = max(0, min(int(overlap), size - 1))
    units = _units(body, delimiter)
    chunks: List[str] = []
    current = ""

    def close() -> None:
        nonlocal current
        stripped = current.strip()
        if stripped:
            chunks.append(stripped)
        current = ""

    def start_next(remainder: str) -> None:
        nonlocal current
        if not remainder:
            current = ""
            return
        prefix = chunks[-1][-overlap:] if overlap and chunks else ""
        current = prefix + remainder

    for unit in units:
        if not current:
            if len(unit) <= size:
                current = unit
                continue
            chunks.extend(_window(unit, size, overlap))
            continue
        if len(current) + len(unit) <= size:
            current += unit
            continue
        close()
        if len(unit) <= size:
            start_next(unit)
            if len(current) > size:
                overflow = current
                current = ""
                chunks.extend(_window(overflow, size, overlap))
            continue
        prefix = chunks[-1][-overlap:] if overlap and chunks else ""
        chunks.extend(_window(prefix + unit, size, overlap))
        current = ""
    close()
    return chunks
