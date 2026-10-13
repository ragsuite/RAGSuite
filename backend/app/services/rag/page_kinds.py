"""Page kind from a chunk's URL path: site info (FAQ, policies, contact), article, or other.

Large sites hold hundreds of blog articles next to a handful of FAQ / policy pages, and
articles that merely mention returns or a brand outrank the policy page itself. These
helpers only reorder candidates (stable, never drop), so a wrong guess costs ranking
position, never an answer. Cues are path segments, generic across sites and locales.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Iterable, List, Sequence, Tuple
from urllib.parse import urlsplit

KIND_INFO = "info"
KIND_ARTICLE = "article"
KIND_OTHER = "other"

_INFO_SEGMENT_RX = re.compile(
    r"^(faqs?|help|help-?center|support|contact(-us)?|about(-us)?|returns?|returns?-?(and|&)?-?"
    r"refunds?|refunds?(-policy)?|shipping(-policy)?|delivery(-policy)?|terms|terms-?(and|&)?-?"
    r"conditions|terms-of-(use|service)|privacy(-policy)?|legal|policies|policy|cancellation"
    r"(-policy)?|warranty|grievance|payments?|impressum|agb|datenschutz|versand|widerruf|"
    r"kontakt|hilfe|cgv|mentions-legales|livraison|envios?|devoluciones|ayuda|contacto)$",
    re.IGNORECASE,
)
_ARTICLE_SEGMENT_RX = re.compile(
    r"^(blogs?|news|articles?|posts?|magazine|stories|journal|insights|press|ratgeber|"
    r"actualites|noticias)$",
    re.IGNORECASE,
)


def classify_url(url: str) -> str:
    path = urlsplit(url or "").path.lower().strip("/")
    if not path:
        return KIND_OTHER
    segments = [s for s in re.split(r"/+", path) if s]
    if any(_ARTICLE_SEGMENT_RX.match(s) for s in segments[:2]):
        return KIND_ARTICLE
    if _INFO_SEGMENT_RX.match(segments[-1]) or any(_INFO_SEGMENT_RX.match(s) for s in segments[:1]):
        return KIND_INFO
    return KIND_OTHER


def entry_kind(entry: Dict[str, Any]) -> str:
    meta = entry.get("meta") if isinstance(entry.get("meta"), dict) else {}
    return classify_url(str(meta.get("url") or ""))


def _key(entry: Dict[str, Any]) -> Tuple[str, str]:
    return str(entry.get("id") or ""), str(entry.get("doc") or "")[:200]


def _stable_rank(entries: Sequence[Dict[str, Any]], order: Dict[str, int]) -> List[Dict[str, Any]]:
    indexed = list(enumerate(entries))
    indexed.sort(key=lambda pair: (order.get(entry_kind(pair[1]), 1), pair[0]))
    return [entry for _, entry in indexed]


def _interleave(first: List[Dict[str, Any]], second: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    seen = set()
    for i in range(max(len(first), len(second))):
        for source in (first, second):
            if i < len(source) and _key(source[i]) not in seen:
                seen.add(_key(source[i]))
                out.append(source[i])
    return out


def prefer_info(
    entries: List[Dict[str, Any]],
    extra: Iterable[Dict[str, Any]] = (),
    *,
    limit: int = 6,
) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Up to ``limit`` site-info chunks first, then the rest with articles last.

    Promoted chunks alternate between the fused pool's info chunks (in pool order) and
    ``extra`` (nearest info chunks queried directly, which the pool often misses).
    """
    pool_info = [e for e in entries if entry_kind(e) == KIND_INFO]
    direct = [e for e in extra if entry_kind(e) == KIND_INFO]
    promoted = _interleave(pool_info, direct)[: max(0, limit)]
    if not promoted:
        return entries, {"applied": False, "reason": "no_info_pages"}
    promoted_keys = {_key(e) for e in promoted}
    rest = _stable_rank(
        [e for e in entries if _key(e) not in promoted_keys], {KIND_INFO: 0, KIND_OTHER: 0, KIND_ARTICLE: 1}
    )
    ranked = promoted + rest
    pool_keys = {_key(e) for e in entries}
    return ranked, {
        "applied": ranked != list(entries),
        "reason": "site_info",
        "promoted": len(promoted),
        "added": sum(1 for e in promoted if _key(e) not in pool_keys),
    }


def demote_articles(entries: List[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
    """Product / listing pages before articles (shopping filters: "under Rs 600")."""
    kinds = [entry_kind(e) for e in entries]
    if KIND_ARTICLE not in kinds or all(k == KIND_ARTICLE for k in kinds):
        return entries, {"applied": False, "reason": "no_mix"}
    ranked = _stable_rank(entries, {KIND_INFO: 1, KIND_OTHER: 1, KIND_ARTICLE: 2})
    return ranked, {"applied": ranked != list(entries), "reason": "shopping_filter"}
