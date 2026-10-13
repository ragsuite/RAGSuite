"""Turn one stored page into a catalog record (or nothing when the page is not about one item).

Preference order per field: schema.org data captured at crawl time, then the page text
(breadcrumb, title anchor, price block, ``Label: value`` rows). The optional model fallback
(``llm_extract``) only fills gaps and only runs in the background job.
"""
from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .normalize import (
    fold,
    identifiers_in,
    norm_name,
    parse_amount,
    similar_token,
    tokens,
    variant_group,
)
from .structured_capture import STRUCTURED_KEY
from .text_extract import PageItem, attributes_after_name, extract_page_item

EXTRACTOR_VERSION = 7
MIN_RECORD_CONFIDENCE = 0.5


@dataclass
class ItemRecord:
    name: str
    brand: Optional[str] = None
    category: Optional[str] = None
    category_path: List[str] = field(default_factory=list)
    identifiers: List[str] = field(default_factory=list)
    price: Optional[float] = None
    list_price: Optional[float] = None
    currency: Optional[str] = None
    availability: Optional[str] = None
    attributes: Dict[str, Any] = field(default_factory=dict)
    variant_group: Optional[str] = None
    method: str = "text"
    confidence: float = 0.0

    @property
    def needs_model(self) -> bool:
        return self.price is None or not self.brand or not self.category


def content_hash(title: str, text: str) -> str:
    return hashlib.sha256(f"{title}\n{text}".encode("utf-8", "ignore")).hexdigest()


def _same_words(a: str, b: str) -> bool:
    ta, tb = tokens(a), tokens(b)
    return bool(ta) and len(ta) == len(tb) and all(similar_token(x, y) for x, y in zip(ta, tb))


def brand_and_category(crumbs: List[str]) -> tuple[Optional[str], Optional[str], List[str]]:
    """``[Home, Mobiles, Mivi Mobiles, Item]`` -> brand ``Mivi``, category ``Mobiles``.

    A crumb that repeats its parent with extra leading words is a brand store crumb.
    The first crumb (site root) and the last one (the item) are not categories.
    """
    inner = crumbs[1:-1] if len(crumbs) >= 3 else []
    brand: Optional[str] = None
    path: List[str] = []
    for i, crumb in enumerate(inner):
        parent = inner[i - 1] if i > 0 else None
        if parent:
            ct, pt = crumb.split(), parent.split()
            if len(ct) > len(pt) and _same_words(" ".join(ct[-len(pt):]), parent):
                brand = " ".join(ct[: len(ct) - len(pt)])
                continue
        path.append(crumb)
    return brand, (path[-1] if path else None), path


def _structured_item(meta: Dict[str, Any]) -> Dict[str, Any]:
    """The page's single product; entries repeating its name (JSON-LD + microdata) merge."""
    payload = meta.get(STRUCTURED_KEY) if isinstance(meta, dict) else None
    items = (payload or {}).get("items") or []
    products = [i for i in items if i.get("name") and i.get("type") != "Offer"]
    if len({norm_name(p["name"]) for p in products}) != 1:
        return {}
    merged: Dict[str, Any] = {}
    for product in sorted(products, key=len, reverse=True):
        for key, value in product.items():
            merged.setdefault(key, value)
    return merged


def _brand_from_title(name: str, title: str) -> Optional[str]:
    first_word = (name.split() or [""])[0]
    if first_word and fold(title).startswith(fold(first_word)) and not re.search(r"\d", first_word):
        return first_word
    return None


def _apply_structured(rec: ItemRecord, item: Dict[str, Any], pairs: List[List[str]]) -> None:
    offer = item.get("offer") or {}
    price = parse_amount(offer.get("price") or offer.get("lowPrice") or "")
    if price:
        rec.price = price
        rec.currency = (offer.get("priceCurrency") or rec.currency or "").upper() or None
        rec.method = "schemaorg"
    if offer.get("availability"):
        rec.availability = re.sub(r"(?<!^)(?=[A-Z])", " ", offer["availability"]).lower()
    rec.brand = item.get("brand") or rec.brand
    if item.get("category") and not rec.category:
        path = [p.strip() for p in re.split(r"\s*[>/|]\s*", item["category"]) if p.strip()]
        rec.category, rec.category_path = (path[-1] if path else None), path
    for key in ("sku", "mpn", "gtin", "gtin8", "gtin12", "gtin13", "gtin14", "model", "productID", "isbn"):
        if item.get(key) and item[key] not in rec.identifiers:
            rec.identifiers.append(item[key])
    if item.get("variant_of"):
        rec.variant_group = norm_name(item["variant_of"])[:255]
    fields = rec.attributes.setdefault("fields", {})
    for key in ("color", "material", "size"):
        if item.get(key):
            fields.setdefault(key.capitalize(), item[key])
    for label, value in (item.get("properties") or {}).items():
        fields.setdefault(label, value)
    for label, value in pairs:
        fields.setdefault(label, value)


def extract_record(title: str, text: str, meta: Optional[Dict[str, Any]] = None) -> Optional[ItemRecord]:
    """Record for the page's main item, or ``None``."""
    meta = meta or {}
    if meta.get("content_kind"):
        return None
    structured = _structured_item(meta)
    pairs = ((meta.get(STRUCTURED_KEY) or {}).get("pairs") or []) if isinstance(meta, dict) else []
    page: Optional[PageItem] = extract_page_item(title or "", text or "")
    if page is None and not structured:
        return None
    name = (structured.get("name") if structured else None) or (page.name if page else "")
    if not name:
        return None
    rec = ItemRecord(name=name[:512])
    if page:
        brand, category, path = brand_and_category(page.crumbs)
        rec.brand, rec.category, rec.category_path = brand, category, path
        rec.price, rec.list_price, rec.currency = page.price, page.list_price, page.currency
        rec.availability = page.availability
        rec.identifiers = list(page.identifiers)
        rec.attributes = {"fields": dict(page.attributes), "highlights": list(page.spec_lines)}
        rec.confidence = page.confidence
    if structured:
        _apply_structured(rec, structured, pairs)
        rec.confidence = max(rec.confidence, 0.9)
        detail_rows, detail_specs = attributes_after_name(text or "", structured["name"])
        fields = rec.attributes.setdefault("fields", {})
        for label, value in detail_rows.items():
            fields.setdefault(label, value)
        highlights = rec.attributes.setdefault("highlights", [])
        highlights.extend(line for line in detail_specs if line not in highlights)
    if not rec.brand:
        rec.brand = _brand_from_title(rec.name, title or "")
    if rec.brand and not tokens(rec.name)[: len(tokens(rec.brand))] == tokens(rec.brand):
        rec.name = f"{rec.brand} {rec.name}"[:512]
    for code in identifiers_in(rec.name):
        if code not in rec.identifiers and not re.fullmatch(r"\d+[a-zA-Z]+|[a-zA-Z]+\d", code):
            rec.identifiers.append(code)
    rec.identifiers = rec.identifiers[:12]
    rec.variant_group = rec.variant_group or variant_group(rec.brand, rec.name)
    if rec.confidence < MIN_RECORD_CONFIDENCE:
        return None
    return rec
