"""Generic value normalizers for catalog extraction: money, measures, identifiers, names.

Nothing here knows about a particular site; every rule is a universal convention
(currency symbols, SI-style units, alphanumeric model codes).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, List, Optional, Tuple

CURRENCY_SYMBOLS = {"₹": "INR", "$": "USD", "€": "EUR", "£": "GBP", "¥": "JPY", "₩": "KRW", "₽": "RUB", "₺": "TRY"}
CURRENCY_CODES = {"INR", "USD", "EUR", "GBP", "JPY", "CHF", "AUD", "CAD", "AED", "SGD", "RS", "RS."}
_SYM = "".join(re.escape(s) for s in CURRENCY_SYMBOLS)
_AMOUNT = r"\d{1,3}(?:[,.\s]\d{2,3})+(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?"
MONEY_RE = re.compile(
    rf"(?P<plus>\+\s*)?(?:(?P<sym>[{_SYM}])\s?(?P<a1>{_AMOUNT})|(?P<code>\b(?:INR|USD|EUR|GBP|CHF|Rs\.?)\s?)(?P<a2>{_AMOUNT})"
    rf"|(?P<a3>{_AMOUNT})\s?(?P<sym2>[{_SYM}]|\b(?:EUR|USD|INR|CHF)\b))",
    re.I,
)
UNITS = (
    "tb", "gb", "mb", "kb", "mah", "wh", "kwh", "mp", "inch", "inches", "in", "cm", "mm", "m", "km", "kg", "g", "mg",
    "l", "ltr", "litre", "liter", "ml", "w", "kw", "v", "hz", "khz", "mhz", "ghz", "bar", "psi", "rpm", "db",
    "sqmm", "ft", "lb", "lbs", "oz", "star", "ton", "pcs", "pack",
)
_UNIT_ALT = "|".join(sorted(UNITS, key=len, reverse=True))
# "5G" / "4G" (network generation, capital G glued to the digit) is not a weight.
MEASURE_RE = re.compile(rf"(?<![\w.])(?!(?-i:\d+G\b))(\d+(?:[.,]\d+)?)\s?({_UNIT_ALT})\b\.?", re.I)
IDENTIFIER_RE = re.compile(r"(?<![\w-])(?=[A-Za-z0-9-]*\d)(?=[A-Za-z0-9-]*[A-Za-z])[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*(?![\w-])")
_TOKEN_RE = re.compile(r"[^\W_]+(?:\+)?", re.U)
# Longest ending a word may add to a shared stem and still be the same word ("purifie|rs").
MAX_STEM_ENDING = 3


@dataclass(frozen=True)
class Measure:
    value: float
    unit: str

    @property
    def text(self) -> str:
        v = int(self.value) if self.value == int(self.value) else self.value
        return f"{v} {self.unit.upper() if self.unit in ('gb', 'tb', 'mb', 'mp') else self.unit}"


def fold(text: str) -> str:
    """Lowercase and strip accents so ``Bürste`` and ``burste`` compare equal."""
    nfkd = unicodedata.normalize("NFKD", text or "")
    return "".join(c for c in nfkd if not unicodedata.combining(c)).lower()


def tokens(text: str) -> List[str]:
    """Word tokens; a trailing ``+`` (``Pro+``) becomes a separate ``plus`` token."""
    out: List[str] = []
    for tok in _TOKEN_RE.findall(fold(text)):
        if tok.endswith("+"):
            out.extend([tok[:-1], "plus"] if tok[:-1] else ["plus"])
        else:
            out.append(tok)
    return out


def norm_name(text: str) -> str:
    return " ".join(tokens(text))


def parse_amount(raw: str) -> Optional[float]:
    """``1,09,999`` / ``13.999,00`` / ``1 299.99`` -> float. Thousands vs decimal decided by group sizes."""
    s = (raw or "").strip().replace("\u00a0", " ")
    if not s or not re.search(r"\d", s):
        return None
    s = re.sub(r"[^\d,.\s]", "", s).strip()
    m = re.search(r"[.,](\d{1,2})$", s)
    decimals = ""
    if m and not re.search(r"[.,]\d{3}$", s):
        decimals = m.group(1)
        s = s[: m.start()]
    digits = re.sub(r"[,.\s]", "", s)
    if not digits:
        return None
    try:
        return float(f"{digits}.{decimals}" if decimals else digits)
    except ValueError:
        return None


def money_in(text: str) -> List[Tuple[float, str, bool]]:
    """All currency-marked amounts in ``text`` as ``(amount, currency, is_addon)``."""
    found: List[Tuple[float, str, bool]] = []
    for m in MONEY_RE.finditer(text or ""):
        raw = m.group("a1") or m.group("a2") or m.group("a3")
        amount = parse_amount(raw)
        if amount is None:
            continue
        sym = m.group("sym") or m.group("sym2") or (m.group("code") or "").strip()
        currency = CURRENCY_SYMBOLS.get(sym, sym.upper().rstrip(".") if sym else "")
        if currency in ("RS",):
            currency = "INR"
        found.append((amount, currency, bool(m.group("plus"))))
    return found


def plain_amount(line: str) -> Optional[float]:
    """A line that is only a number (``23,999``): typical struck-through list price."""
    s = (line or "").strip()
    if re.fullmatch(r"\d{1,3}(?:[,.]\d{2,3})+|\d{3,}", s):
        return parse_amount(s)
    return None


def measures(text: str) -> List[Measure]:
    out: List[Measure] = []
    for value, unit in MEASURE_RE.findall(text or ""):
        unit = unit.lower().rstrip(".")
        unit = {"inches": "inch", "in": "inch", "ltr": "l", "litre": "l", "liter": "l", "lbs": "lb"}.get(unit, unit)
        try:
            out.append(Measure(float(value.replace(",", ".")), unit))
        except ValueError:
            continue
    return out


_MEMORY_PAIR_RE = re.compile(r"(?<![\w.,/])(\d{1,2})\s?(?:gb)?\s?/\s?(\d{2,4})\s?(?:gb)?(?![\w.,/])", re.I)
_STORAGE_SIZES = frozenset({16, 32, 64, 128, 256, 512, 1024})


def memory_pair(text: str) -> List[Measure]:
    """``8/128`` (memory / storage shorthand) → ``8 GB`` and ``128 GB``; dates and fractions are not."""
    out: List[Measure] = []
    for ram, storage in _MEMORY_PAIR_RE.findall(text or ""):
        r, s = int(ram), int(storage)
        if 1 <= r <= 32 and s in _STORAGE_SIZES and s > r:
            out.extend([Measure(float(r), "gb"), Measure(float(s), "gb")])
    return out


def has_measure(text: str, wanted: Measure) -> bool:
    return any(m.unit == wanted.unit and abs(m.value - wanted.value) < 1e-6 for m in measures(text))


def identifiers_in(text: str) -> List[str]:
    """Model-code-like tokens (letters and digits mixed, 4+ chars), excluding plain measures."""
    out: List[str] = []
    for tok in IDENTIFIER_RE.findall(text or ""):
        if len(tok) < 4 or len(tok) > 32 or MEASURE_RE.fullmatch(tok) or re.fullmatch(r"\d+[a-zA-Z]{1,2}", tok):
            continue
        if not any(re.search(r"\d", seg) and re.search(r"[A-Za-z]", seg) for seg in tok.split("-")):
            continue
        if tok not in out:
            out.append(tok)
    return out


def identifier_key(code: str) -> str:
    return re.sub(r"[^a-z0-9]", "", fold(code))


def short_name(name: str, limit: int = 140) -> str:
    """Item name without marketing tails (``Name | No cost EMI | 2 year warranty``)."""
    head = re.split(r"\s*\|\s*", name or "")[0].strip() or (name or "").strip()
    return head if len(head) <= limit else head[:limit].rsplit(" ", 1)[0]


def variant_group(brand: Optional[str], name: str) -> str:
    """Family key: name without parenthesised variant info, measures and colours in brackets."""
    base = re.sub(r"\([^)]*\)", " ", name or "")
    base = re.split(r"\s[|–-]\s", base)[0]
    base = MEASURE_RE.sub(" ", base)
    toks = tokens(base)
    if brand:
        b = tokens(brand)
        if toks[: len(b)] != b:
            toks = b + toks
    return " ".join(toks)[:255]


def similar_token(a: str, b: str) -> bool:
    """Typo-tolerant token match (``motoroal``~``motorola``, ``purified``~``purifiers``).

    A shared stem only counts when neither word adds more than a short ending to it:
    ``founder`` (found+er) is not ``foundation`` (found+ation)."""
    if a == b:
        return True
    if min(len(a), len(b)) < 4 or a.isdigit() or b.isdigit():
        return False
    k = 0
    for x, y in zip(a, b):
        if x != y:
            break
        k += 1
    if k >= max(5, int(0.75 * min(len(a), len(b)))) and max(len(a), len(b)) - k <= MAX_STEM_ENDING:
        return True
    if abs(len(a) - len(b)) > 2:
        return False
    return _edit_distance_le(a, b, 1 if min(len(a), len(b)) < 7 else 2)


def _edit_distance_le(a: str, b: str, limit: int) -> bool:
    """Optimal-string-alignment distance (adjacent swaps count as one edit) <= ``limit``."""
    before: List[int] = []
    prev = list(range(len(b) + 1))
    for i in range(1, len(a) + 1):
        cur = [i] + [0] * len(b)
        for j in range(1, len(b) + 1):
            cost = a[i - 1] != b[j - 1]
            cur[j] = min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
            if i > 1 and j > 1 and a[i - 1] == b[j - 2] and a[i - 2] == b[j - 1]:
                cur[j] = min(cur[j], before[j - 2] + 1)
        before, prev = prev, cur
    return prev[-1] <= limit


def first(values: Iterable[Optional[str]]) -> Optional[str]:
    for v in values:
        if v and str(v).strip():
            return str(v).strip()
    return None
