"""Multilingual wording cues of item questions (superlatives, brand listings, top-N, filler)."""
from __future__ import annotations

import re


def _rx(pattern: str) -> "re.Pattern[str]":
    return re.compile(pattern, re.I | re.U)


# Scripts without word boundaries (CJK, Arabic, Devanagari) sit outside the ``\b`` groups.
LOW_RX = _rx(
    r"\b(lowest|cheapest|least expensive|most affordable|low(?:est)?[- ]priced|minimum price|lowest cost|"
    r"g[üu]nstigst\w*|billigst\w*|preiswertest\w*|moins cher\w*|m[aá]s barat\w*|mais barat\w*|"
    r"pi[uù] economic\w*|goedkoopst\w*|sabse\s+(?:sast[aei]|kam\s+(?:price|daam|keemat|kimat)))\b"
    r"|最便宜|الأرخص|सबसे\s*सस्त"
)
HIGH_RX = _rx(
    r"\b(highest[- ]priced|highest price|most expensive|costliest|priciest|maximum price|"
    r"teuerst\w*|plus cher\w*|m[aá]s car\w*|mais car\w*|pi[uù] costos\w*|duurst\w*|"
    r"sabse\s+ma?he?ng[aei])\b|最贵|الأغلى|सबसे\s*महंग"
)
BRANDS_RX = _rx(r"\b(brands?|makers?|manufacturers?|marken?|hersteller|marques?|marcas?|merken?)\b|品牌|ماركات")
# Availability values (schema.org names spelled out, or page wording) of items that cannot be bought now.
UNAVAILABLE_RX = _rx(
    r"\b(out of stock|sold out|discontinued|currently unavailable|nicht vorrätig|ausverkauft|"
    r"rupture de stock|agotado|esgotado)\b"
)
PLURAL_RX = _rx(r"\b(which are|what are|list|top|some|all|options|alternatives|welche sind|quels sont|cu[aá]les son)\b")
TOP_N_RX = _rx(r"\b(?:top|first|best)\s+(\d{1,2})\b|\b(\d{1,2})\s+(?:cheapest|lowest|most expensive|best)\b")
NOISE = frozenset(
    """
    please pls plz thx thanks share show list give tell me us i we you your do does did have has any some all the
    a an of from with without in on at to for by is are was were be it its this that these those there here what
    which who whose how much many price prices cost costs rate model models product products item items available
    availability option options buy want need looking find get cheapest lowest highest expensive costliest
    least most minimum maximum price priced budget under below above over less more than between and or upto
    up within around about rs inr usd eur rupees one ones only just single variant variants version versions
    brand brands maker makers manufacturer manufacturers stock sell sold offer offers can could would should will
    my our new best top good also other another same like range kind type types category categories store
    mean meant said asked ask talking actually instead ok okay yes no not then now again quick quickly asap
    guys u ur hey hi hello sorry them they their he she him her
    """.split()
) | frozenset(
    # Romanised Hindi function words (Hinglish chat).
    """
    mujhe muje chahiye chahie hai hain kya konsa kaunsa kaun kon sa wala wali wale ka ki ke mein me se aur
    sabse sasta sasti saste mehnga mehenga mahanga mehngi koi kuch dikhao dikha batao bata do de bhai ji yaar
    accha acha theek
    """.split()
)
