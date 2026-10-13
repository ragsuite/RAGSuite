"""Deterministic, multilingual query signals: intent cues and numeric constraints.

Everything here is regex/lexicon based (no LLM, no I/O) so it can run on every
query. Cues cover the locales the product ships (en, de, fr, es, pt, ar, zh) and
stay generic — no customer, site or catalogue names.
"""
from __future__ import annotations

import re
from typing import Any, Dict, Optional, Tuple

INTENT_HELP = "help"
INTENT_COMPARE = "compare"
INTENT_FILTER = "filter"
INTENT_ATTRIBUTE = "attribute"
INTENT_DEFINITION = "definition"
INTENT_BROWSE = "browse"
INTENT_GENERAL = "general"


def _rx(pattern: str) -> "re.Pattern[str]":
    return re.compile(pattern, re.IGNORECASE | re.UNICODE)


_HELP_RX = _rx(
    r"\b(help|support|customer (care|service)|contact|helpdesk|faq|refund|return policy|"
    r"returns?|cancel(l?ation)?|track(ing)?( my)? order|complain(t)?|reset (my )?password|"
    r"(change|update|modify|edit) (my |the )?(address|order)|"
    r"log ?in problem|hilfe|kundendienst|kundenservice|kontakt|rückgabe|rücksendung|"
    r"erstattung|stornier\w*|sendungsverfolgung|aide|assistance|contacter|remboursement|"
    r"annuler|annulation|retour|ayuda|soporte|contacto|reembolso|devoluci[oó]n|cancelar|"
    r"ajuda|suporte|contato|devolu[cç][aã]o)\b|مساعدة|دعم|استرداد|帮助|客服|退货|退款|联系"
)
_COMPARE_RX = _rx(
    r"\b(vs\.?|versus|compare[ds]?|comparison|comparing|difference between|differences|"
    r"better than|which is better|which one is better|vergleich\w*|unterschied\w*|besser als|"
    r"compar(er|aison|e)|différence|meilleur que|comparar|comparaci[oó]n|diferencia|mejor que|"
    r"compara[cç][aã]o|diferen[cç]a|melhor que)\b|مقارنة|الفرق|比较|对比|区别"
)
_FILTER_RX = _rx(
    r"\b(under|below|less than|cheaper than|up ?to|within|budget|between|above|over|"
    r"more than|at least|minimum|maximum|max|min|rated|stars?|unter|weniger als|bis zu|"
    r"zwischen|über|mehr als|mindestens|höchstens|moins de|jusqu'?à|entre|plus de|au moins|"
    r"menos de|hasta|más de|abaixo de|até|acima de|mais de)\b|أقل من|أكثر من|以下|以上|低于|高于"
)
_ATTRIBUTE_RX = _rx(
    r"\b(price|cost|how much|rating|reviews?|specs?|specifications?|features?|dimensions?|"
    r"weight|warranty|battery|size|colou?rs?|capacity|material|ingredients?|fees?|"
    r"preis|kosten|bewertung\w*|maße|gewicht|garantie|größe|farbe|gebühr\w*|prix|combien|"
    r"coût|avis|caractéristiques|taille|couleur|frais|precio|cu[aá]nto|opiniones|"
    r"caracter[ií]sticas|tamaño|garant[ií]a|tarifa|pre[cç]o|quanto|avalia[cç][aã]o|tamanho|"
    r"taxa|kitn[aeiy]|daam|keemat|kimat|qeemat)\b|سعر|تقييم|价格|评分|多少钱|कितन|कीमत|दाम"
)
_DEFINITION_RX = _rx(
    r"^\s*(what is|what are|what's|who is|who are|define|definition of|meaning of|"
    r"was ist|was sind|wer ist|wer sind|qu'?est-ce que|c'est quoi|qui est|qu[eé] es|"
    r"qui[eé]n es|qu[eé] son|o que [eé]|quem [eé]|o que s[aã]o)\b|^\s*(ما هو|ما هي|من هو)|^\s*什么是"
)
_BROWSE_RX = _rx(
    r"\b(show( me)?|list|find|browse|recommend\w*|suggest\w*|options|available|do you (sell|have|offer)|"
    r"zeig\w*|liste|finde\w*|empfehl\w*|gibt es|montre\w*|trouve\w*|recommand\w*|"
    r"muestra\w*|busca\w*|recomienda\w*|mostr\w*|encontr\w*|recomend\w*)\b|اعرض|推荐|显示"
)
# Store-policy topics: they apply to every order, never to one item.
_STORE_POLICY_RX = _rx(
    r"\b(shipping|ship to|deliver(y|ies)?|payments?|pay (by|with|via)|cash on delivery|"
    r"cod\b(?=.{0,30}\b(available|availability|charges?|fees?|orders?|refund\w*|option|accepted|allowed)\b)|"
    r"privacy|terms( and| &)? conditions|policy|policies|grievance|"
    r"versand|lieferung|zahlung\w*|datenschutz|agb|widerruf|envío|envio|pago|"
    r"livraison|paiement|politique)\b|شحن|توصيل|配送|运费|付款"
)
# Warranty and brand-wide formulation policy ("what does X avoid in its products"): also on
# FAQ / about pages, but a product page may state them for one item.
_BRAND_FACTS_RX = _rx(
    r"\b(warranty|guarantee|garant[ií]a|cruelty[- ]free|tested on animals|test on animals|"
    r"(avoid|free (of|from)|never uses?|(do|does)(n'?t| not) use)\b.{0,40}\b(your|its|their) "
    r"(products|range|formulas?))\b"
)
_MULTI_SOURCE_RX = _rx(
    r"\b(all|every|each|both|across|different|multiple)\s+(sources|sites|websites|stores|shops|"
    r"providers|documents)\b|\b(alle[n]?|beide[n]?)\s+(quellen|seiten|websites|shops)\b"
)

_CURRENCY = r"(?:₹|\$|€|£|¥|rs\.?|inr|usd|eur|gbp|rupees?|dollars?|euros?|pounds?)"
_NUMBER = r"\d[\d,.]*\d|\d"
_MULTIPLIER = r"(?:k|thousand|tausend|mille|mil|lakh|lac|lakhs|crore|cr|mn|million)?"
# A word boundary, or a currency written straight after the number ("600rs", "500inr").
_NUM_END = rf"(?:\b|(?={_CURRENCY}\b))"
_UNIT_AFTER = re.compile(
    r"^\s*(gb|tb|mb|inch|inches|\"|cm|mm|m|kg|g|w|hz|mah|mp|hours?|hrs?|years?|months?|"
    r"days?|stars?|★|%|ml|l|v)\b",
    re.IGNORECASE,
)
_PRICE_WORD_RX = _rx(r"\b(price|cost|budget|cheap\w*|preis|kosten|prix|precio|pre[cç]o)\b|价格|سعر")

_MAX_CUES = (
    r"under|below|less than|cheaper than|up ?to|upto|within|not more than|max(?:imum)?|"
    r"unter|weniger als|bis(?: zu)?|höchstens|moins de|jusqu'?à|menos de|hasta|abaixo de|até|"
    r"أقل من|低于"
)
_MIN_CUES = (
    r"above|over|more than|at least|min(?:imum)?|starting|über|mehr als|mindestens|ab|"
    r"plus de|au moins|más de|mais de|acima de|أكثر من|高于"
)
_MAX_RX = _rx(rf"(?:{_MAX_CUES})\s*{_CURRENCY}?\s*({_NUMBER})\s*{_MULTIPLIER}{_NUM_END}")
_MIN_RX = _rx(rf"(?:{_MIN_CUES})\s*{_CURRENCY}?\s*({_NUMBER})\s*{_MULTIPLIER}{_NUM_END}")
_BETWEEN_RX = _rx(
    rf"(?:between|zwischen|entre)\s*{_CURRENCY}?\s*({_NUMBER})\s*{_MULTIPLIER}\s*{_CURRENCY}?\s*"
    rf"(?:and|und|et|y|e|to|-|–)\s*{_CURRENCY}?\s*({_NUMBER})\s*{_MULTIPLIER}{_NUM_END}"
)
_RANGE_RX = _rx(rf"{_CURRENCY}\s*({_NUMBER})\s*{_MULTIPLIER}\s*(?:-|–|to)\s*{_CURRENCY}?\s*({_NUMBER})")
_CJK_MAX_RX = re.compile(rf"({_NUMBER})\s*(?:元|块)?\s*以下")
_CURRENCY_NUM_RX = _rx(rf"{_CURRENCY}\s*({_NUMBER})\s*{_MULTIPLIER}\b|({_NUMBER})\s*{_MULTIPLIER}\s*{_CURRENCY}")
_RATING_RX = _rx(
    r"(\d(?:[.,]\d)?)\s*(?:\+|★|stars?|sterne?n?|étoiles?|estrellas?|estrelas?|星|نجوم)"
    r"|rat(?:ed|ing)s?\s*(?:of\s*|above\s*|over\s*|at least\s*|>=?\s*)?(\d(?:[.,]\d)?)"
)


def parse_number(raw: str, multiplier: str = "") -> Optional[float]:
    """``"1,00,000"`` → 100000; ``"50.000"`` (German grouping) → 50000; ``"50k"`` → 50000."""
    text = re.sub(r"\s+", "", raw or "")
    if not text:
        return None
    if re.fullmatch(r"\d{1,3}(\.\d{3})+", text):
        text = text.replace(".", "")
    text = text.replace(",", "")
    try:
        value = float(text)
    except ValueError:
        return None
    mult = (multiplier or "").lower()
    if mult in ("k", "thousand", "tausend", "mille", "mil"):
        value *= 1_000
    elif mult in ("lakh", "lac", "lakhs"):
        value *= 100_000
    elif mult in ("crore", "cr"):
        value *= 10_000_000
    elif mult in ("mn", "million"):
        value *= 1_000_000
    return value


def _multiplier_after(text: str, end: int) -> str:
    m = re.match(rf"\s*({_MULTIPLIER}){_NUM_END}", text[end:], re.IGNORECASE)
    return m.group(1) if m else ""


def _is_unit_number(text: str, end: int) -> bool:
    return bool(_UNIT_AFTER.match(text[end:]))


def _price_from(match: "re.Match[str]", group: int, text: str, has_price_ctx: bool) -> Optional[float]:
    raw = match.group(group)
    if raw is None:
        return None
    end = match.end(group)
    if _is_unit_number(text, end):
        return None
    value = parse_number(raw, _multiplier_after(text, end))
    if value is None:
        return None
    # A bare small number after "under" is usually not a price (e.g. "under 5 minutes").
    if not has_price_ctx and value < 100:
        return None
    return value


def extract_constraints(text: str) -> Dict[str, Any]:
    """Price range, minimum rating and currency mentioned in ``text`` (may be empty)."""
    out: Dict[str, Any] = {}
    if not text:
        return out
    has_currency = bool(_CURRENCY_NUM_RX.search(text))
    has_price_ctx = has_currency or bool(_PRICE_WORD_RX.search(text))

    for rx in (_BETWEEN_RX, _RANGE_RX):
        m = rx.search(text)
        if m:
            lo = _price_from(m, 1, text, True)
            hi = _price_from(m, 2, text, True)
            if lo is not None and hi is not None:
                out["price_min"], out["price_max"] = min(lo, hi), max(lo, hi)
                break
    if "price_max" not in out:
        for rx in (_MAX_RX, _CJK_MAX_RX):
            m = rx.search(text)
            value = _price_from(m, 1, text, has_price_ctx) if m else None
            if value is not None:
                out["price_max"] = value
                break
    if "price_min" not in out:
        m = _MIN_RX.search(text)
        value = _price_from(m, 1, text, has_price_ctx) if m else None
        if value is not None:
            out["price_min"] = value

    rating = _RATING_RX.search(text)
    if rating:
        raw = (rating.group(1) or rating.group(2) or "").replace(",", ".")
        try:
            value = float(raw)
            if 0 < value <= 5:
                out["rating_min"] = value
        except ValueError:
            pass

    cur = re.search(r"₹|\$|€|£|¥|(?<![a-z])(?:rs|inr|usd|eur|gbp)\b", text, re.IGNORECASE)
    if cur and ("price_min" in out or "price_max" in out):
        out["currency"] = cur.group(0).upper()
    return out


_VERDICT_RX = _rx(
    r"\bwhich(?: one)? (?:is|are|has|have|costs?|lasts?)\b.{0,20}\b(cheaper|costlier|pricier|"
    r"more expensive|less expensive|bigger|larger|smaller|longer|shorter|lighter|heavier|higher|"
    r"lower|more|less|fewer)\b|\bwelche[rs]? (?:ist|sind)\b.{0,20}\b(günstiger|billiger|teurer|"
    r"größer|kleiner|länger)\b"
)


def asks_comparison(text: str) -> bool:
    """The question wants a verdict between items ("which is cheaper: A or B?")."""
    t = text or ""
    return bool(_COMPARE_RX.search(t) or _VERDICT_RX.search(t))


def wants_site_info(text: str, intent: Optional[str] = None) -> bool:
    """The answer most likely lives on FAQ / policy / about pages (help or store-policy topic)."""
    text = text or ""
    return intent == INTENT_HELP or store_wide_topic(text) or bool(_BRAND_FACTS_RX.search(text))


def store_wide_topic(text: str) -> bool:
    """A help or store-policy question (delivery, payment, returns, contact): it is about the
    business, not about the item a conversation was discussing."""
    text = text or ""
    return bool(_HELP_RX.search(text) or _STORE_POLICY_RX.search(text))


def detect_intent(text: str, constraints: Optional[Dict[str, Any]] = None) -> Tuple[str, bool]:
    """``(primary_intent, explicit_multi_source)`` from deterministic cues."""
    t = text or ""
    multi = bool(_MULTI_SOURCE_RX.search(t))
    if _HELP_RX.search(t):
        return INTENT_HELP, multi
    if _COMPARE_RX.search(t):
        return INTENT_COMPARE, multi
    if constraints and any(k in constraints for k in ("price_min", "price_max", "rating_min")):
        return INTENT_FILTER, multi
    if _ATTRIBUTE_RX.search(t):
        return INTENT_ATTRIBUTE, multi
    if _DEFINITION_RX.search(t):
        return INTENT_DEFINITION, multi
    if _BROWSE_RX.search(t):
        return INTENT_BROWSE, multi
    if _FILTER_RX.search(t) and re.search(r"\d", t):
        return INTENT_FILTER, multi
    return INTENT_GENERAL, multi
