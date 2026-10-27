"""Per-source Native vs Custom splitting.

Missing / native / invalid config is ``None`` so ingest stays on today's
SentenceSplitter + ``profile_for_source`` path.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union

SPLIT_MODE_NATIVE = "native"
SPLIT_MODE_CUSTOM = "custom"
SPLIT_CONFIG_KEY = "split_config"

DELIMITER_PRESETS: Dict[str, str] = {
    "paragraph": "\n\n",
    "sentence": ".",
    "newline": "\n",
    "heading": "#",
    "question": "?",
    "exclaim": "!",
    "semicolon": ";",
}
DELIMITER_PRESET_ORDER: Sequence[str] = (
    "paragraph",
    "sentence",
    "newline",
    "heading",
    "question",
    "exclaim",
    "semicolon",
    "custom",
)
PRESET_CUSTOM = "custom"
ALLOWED_PRESETS = frozenset(DELIMITER_PRESETS) | {PRESET_CUSTOM}

SIZE_MIN = 200
SIZE_MAX = 4000
OVERLAP_MIN = 0
OVERLAP_MAX = 500
DELIMITER_MAX = 20
DELIMITER_CUSTOM_TOTAL_MAX = 200
TABLE_CONTEXT_VALUES = (0, 1, 2)

DelimiterInput = Union[str, Sequence[str]]


class SplitConfigError(ValueError):
    """Invalid Custom splitting settings (API 400)."""


@dataclass(frozen=True)
class SplitConfig:
    chunk_size: int
    chunk_overlap: int
    delimiter_preset: str
    delimiter_custom: Optional[str] = None
    delimiter_presets: tuple[str, ...] = field(default_factory=tuple)
    parent_child: bool = False
    table_context: int = 0
    excel_as_html: bool = False

    def _preset_keys(self) -> tuple[str, ...]:
        keys = self.delimiter_presets or ((self.delimiter_preset,) if self.delimiter_preset else ())
        return keys

    @property
    def delimiters(self) -> List[str]:
        out: List[str] = []
        for key in self._preset_keys():
            if key == PRESET_CUSTOM:
                out.extend(_custom_tokens(self.delimiter_custom or ""))
            else:
                token = DELIMITER_PRESETS.get(key)
                if token:
                    out.append(token)
        return out

    @property
    def delimiter(self) -> str:
        items = self.delimiters
        return items[0] if items else ""

    def to_dict(self) -> Dict[str, Any]:
        presets = list(self._preset_keys())
        payload: Dict[str, Any] = {
            "mode": SPLIT_MODE_CUSTOM,
            "chunk_size": self.chunk_size,
            "chunk_overlap": self.chunk_overlap,
            "delimiter_preset": presets[0] if presets else self.delimiter_preset,
            "delimiter_presets": presets,
            "delimiter_custom": self.delimiter_custom if PRESET_CUSTOM in presets else None,
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
        if (
            "mode" in raw
            or "chunk_size" in raw
            or "delimiter_preset" in raw
            or "delimiter_presets" in raw
        ):
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
        raise SplitConfigError("Caption must be off, or up to 2 sentences.")
    return 0


def _custom_tokens(custom: str) -> List[str]:
    return [part.strip() for part in str(custom or "").split(",") if part.strip()]


def _normalize_preset_keys(preset: Any, presets: Any) -> List[str]:
    keys: List[str] = []
    raw = presets
    if isinstance(raw, str):
        raw = [part.strip() for part in raw.split(",") if part.strip()]
    if isinstance(raw, (list, tuple)):
        for item in raw:
            key = str(item or "").strip().lower()
            if key:
                keys.append(key)
    if not keys:
        key = str(preset or "").strip().lower()
        if key:
            keys.append(key)
    seen: set[str] = set()
    out: List[str] = []
    for key in keys:
        if key in seen:
            continue
        seen.add(key)
        out.append(key)
    return out


def resolved_delimiter(preset: Optional[str], custom: Optional[str]) -> str:
    key = str(preset or "").strip().lower()
    if key == PRESET_CUSTOM:
        tokens = _custom_tokens(str(custom or ""))
        return tokens[0] if tokens else ""
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
            delimiter_presets=data.get("delimiter_presets") or data.get("chunk_delimiter_presets"),
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
    delimiter_presets: Any = None,
    parent_child: Any = False,
    table_context: Any = 0,
    excel_as_html: Any = False,
) -> SplitConfig:
    size = _int_or_none(chunk_size)
    overlap = _int_or_none(chunk_overlap)
    presets = _normalize_preset_keys(delimiter_preset, delimiter_presets)
    custom = str(delimiter_custom or "")
    if size is None or size < SIZE_MIN or size > SIZE_MAX:
        raise SplitConfigError(f"Chunk size must be between {SIZE_MIN} and {SIZE_MAX}.")
    if overlap is None or overlap < OVERLAP_MIN or overlap > OVERLAP_MAX:
        raise SplitConfigError(f"Chunk overlap must be between {OVERLAP_MIN} and {OVERLAP_MAX}.")
    if overlap >= size:
        raise SplitConfigError("Chunk overlap must be smaller than chunk size.")
    if not presets or any(key not in ALLOWED_PRESETS for key in presets):
        raise SplitConfigError("Choose where to split the text.")
    if PRESET_CUSTOM in presets:
        if len(custom) > DELIMITER_CUSTOM_TOTAL_MAX:
            raise SplitConfigError("Custom split text cannot exceed 200 characters.")
        tokens = _custom_tokens(custom)
        if not tokens:
            raise SplitConfigError("Split-at text cannot be empty (max 20 characters per token).")
        if any(len(token) > DELIMITER_MAX for token in tokens):
            raise SplitConfigError("Each custom split token can be at most 20 characters.")
    else:
        custom = ""
    delims: List[str] = []
    for key in presets:
        if key == PRESET_CUSTOM:
            delims.extend(_custom_tokens(custom))
        else:
            delims.append(DELIMITER_PRESETS[key])
    if not delims:
        raise SplitConfigError("Choose where to split the text.")
    return SplitConfig(
        chunk_size=size,
        chunk_overlap=overlap,
        delimiter_preset=presets[0],
        delimiter_custom=custom if PRESET_CUSTOM in presets else None,
        delimiter_presets=tuple(presets),
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
    delimiter_presets: Any = None,
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
        delimiter_presets=_first_set(delimiter_presets, nested.get("delimiter_presets")),
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
            "delimiterPresets": [],
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
        "delimiterPresets": list(cfg.delimiter_presets or (cfg.delimiter_preset,)),
        "delimiterCustom": cfg.delimiter_custom,
        "parentChild": bool(cfg.parent_child),
        "tableContext": int(cfg.table_context),
        "excelAsHtml": bool(cfg.excel_as_html),
    }


def _normalize_delimiters(delimiter: DelimiterInput) -> List[str]:
    if isinstance(delimiter, str):
        return [delimiter] if delimiter else []
    return [str(item) for item in delimiter if item]


def _units_one(text: str, delimiter: str) -> List[str]:
    parts = text.split(delimiter)
    if not parts:
        return []
    out: List[str] = []
    for i, part in enumerate(parts):
        piece = part if i == len(parts) - 1 else part + delimiter
        if piece:
            out.append(piece)
    return out


def _units_many(text: str, delimiters: Sequence[str]) -> List[str]:
    ordered = sorted({item for item in delimiters if item}, key=len, reverse=True)
    if not ordered:
        return [text] if text else []
    out: List[str] = []
    i = 0
    start = 0
    n = len(text)
    while i < n:
        match = None
        for delim in ordered:
            if text.startswith(delim, i):
                match = delim
                break
        if match:
            piece = text[start:i] + match
            if piece:
                out.append(piece)
            i += len(match)
            start = i
            continue
        i += 1
    tail = text[start:]
    if tail:
        out.append(tail)
    return out


def _units(text: str, delimiter: DelimiterInput) -> List[str]:
    delims = _normalize_delimiters(delimiter)
    if not delims:
        return [text] if text else []
    if len(delims) == 1:
        return _units_one(text, delims[0])
    return _units_many(text, delims)


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


def chunk_text_custom(text: str, size: int, overlap: int, delimiter: DelimiterInput) -> List[str]:
    """Split on ``delimiter`` (one string or many), pack up to ``size``, overlap tails."""
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
