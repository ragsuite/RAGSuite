import re
from typing import List, Tuple

# Long runs of single-letter tokens, e.g. "E u r o p a" (5+ letters).
_SPACED_LETTER_WORD_RE = re.compile(
    r"\b(?:[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]\s+){4,}[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]\b"
)
# Hyphenation gaps from PDF layout, e.g. "kön - n en".
_HYPHEN_GAP_RE = re.compile(
    r"(\b[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß])\s*-\s*([A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]\b)"
)
_WORD_RE = re.compile(r"[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]+")

# Keep common short words separate so "in der Stadt" is not merged.
_STOPWORDS = frozenset(
    {
        "a",
        "an",
        "and",
        "are",
        "as",
        "at",
        "be",
        "by",
        "for",
        "from",
        "in",
        "is",
        "it",
        "of",
        "on",
        "or",
        "the",
        "to",
        "was",
        "with",
        "der",
        "die",
        "das",
        "den",
        "dem",
        "des",
        "ein",
        "eine",
        "einer",
        "einem",
        "einen",
        "eines",
        "und",
        "ist",
        "sind",
        "war",
        "mit",
        "von",
        "zu",
        "auf",
        "im",
        "am",
        "als",
        "auch",
        "nicht",
        "nur",
        "oder",
        "bei",
        "nach",
        "aus",
        "über",
        "unter",
        "vor",
        "zwischen",
        "durch",
        "für",
        "wird",
        "werden",
        "wurde",
        "wurden",
        "kann",
        "können",
        "sein",
        "seine",
        "ihre",
        "denen",
        "dem",
        "einer",
        "eines",
        "einem",
    }
)


def _join_spaced_letters(match: re.Match[str]) -> str:
    return "".join(match.group(0).split())


def _artifact_metrics(text: str) -> Tuple[float, float, int]:
    tokens = _WORD_RE.findall(text)
    if not tokens:
        return 0.0, 0.0, 0
    short_ratio = sum(1 for token in tokens if len(token) <= 4) / len(tokens)
    single_ratio = sum(1 for token in tokens if len(token) == 1) / len(tokens)
    return short_ratio, single_ratio, len(tokens)


def _should_apply_fragment_merge(text: str) -> bool:
    short_ratio, single_ratio, token_count = _artifact_metrics(text)
    if token_count < 20:
        return False
    if short_ratio >= 0.45 and single_ratio >= 0.10:
        return True
    if short_ratio >= 0.35 and single_ratio >= 0.18:
        return True
    return False


def _is_mergeable_fragment(token: str) -> bool:
    return bool(re.fullmatch(r"[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]{1,8}", token))


def _split_word_suffix(word: str) -> Tuple[str, str]:
    match = re.match(r"^([A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß]+)(.*)$", word)
    if not match:
        return word, ""
    return match.group(1), match.group(2)


def _merge_fragmented_words(text: str) -> str:
    if not _should_apply_fragment_merge(text):
        return text

    words = text.split()
    merged_words: List[str] = []
    fragment_buf = ""

    def flush_fragment(suffix: str = "") -> None:
        nonlocal fragment_buf
        if fragment_buf:
            merged_words.append(fragment_buf + suffix)
            fragment_buf = ""
        elif suffix:
            merged_words.append(suffix)

    for word in words:
        alpha, suffix = _split_word_suffix(word)
        if not alpha:
            flush_fragment(word)
            continue

        if not _is_mergeable_fragment(alpha):
            flush_fragment(suffix)
            merged_words.append(word)
            continue

        lower = alpha.lower()
        if lower in _STOPWORDS:
            flush_fragment(suffix)
            merged_words.append(word)
            continue

        if fragment_buf and len(alpha) == 5 and len(fragment_buf) >= 4:
            flush_fragment()

        if (
            fragment_buf
            and len(fragment_buf) >= 5
            and len(alpha) <= 2
            and not re.search(r"(?:sch|ch|ck|tz|pf|ng|nn)$", fragment_buf, re.IGNORECASE)
        ):
            flush_fragment()

        if len(alpha) <= 4 or (fragment_buf and len(fragment_buf) < 15):
            if suffix:
                fragment_buf += alpha
                flush_fragment(suffix)
            else:
                fragment_buf += alpha
            continue

        flush_fragment(suffix)
        merged_words.append(word)

    flush_fragment()
    return " ".join(merged_words)


def normalize_pdf_extracted_text(text: str) -> str:
    """
    Clean common PDF extraction artifacts without touching normal content.

    Handles:
    - single-letter spacing ("E u r o p a")
    - hyphen gaps ("kön - n en")
    - short fragment spacing ("M ittlerw eile", "jed er") when artifact density is high
    """
    if not text:
        return ""

    cleaned = _HYPHEN_GAP_RE.sub(r"\1\2", text)
    cleaned = re.sub(
        r"(?<=[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß])\s*-\s*(?=[A-Za-zÀ-ÖØ-öø-ÿäöüÄÖÜß])",
        "",
        cleaned,
    )

    matches = list(_SPACED_LETTER_WORD_RE.finditer(cleaned))
    if matches:
        artifact_chars = sum(len(match.group(0)) for match in matches)
        long_text = len(cleaned) >= 1200
        high_density = artifact_chars >= max(80, int(len(cleaned) * 0.03))
        if len(matches) >= 2 or (long_text and high_density):
            cleaned = _SPACED_LETTER_WORD_RE.sub(_join_spaced_letters, cleaned)

    return _merge_fragmented_words(cleaned)
