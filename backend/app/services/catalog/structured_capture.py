"""Capture machine-readable item data from a crawled page's soup (no raw HTML is stored).

Sources, all web standards: schema.org JSON-LD and microdata (Product, Offer, ProductGroup,
...), two-column spec tables and ``<dl>`` term/definition lists. The compact result is stored
in ``Document.meta_data[STRUCTURED_KEY]`` so extraction can run later without the HTML.
"""
from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, Iterator, List, Optional

from bs4.element import Tag

logger = logging.getLogger(__name__)

STRUCTURED_KEY = "structured"
STRUCTURED_VERSION_KEY = "structured_v"
STRUCTURED_VERSION = 1
MAX_PRODUCTS = 5
MAX_PAIRS = 80
MAX_VALUE_CHARS = 200
MAX_BYTES = 20_000
ITEM_TYPES = frozenset({
    "Product", "ProductGroup", "IndividualProduct", "ProductModel", "SomeProducts", "Vehicle", "Car",
    "Book", "SoftwareApplication", "MobileApplication", "Offer", "AggregateOffer", "MenuItem", "Service",
})
_PRODUCT_FIELDS = ("name", "brand", "sku", "mpn", "gtin", "gtin8", "gtin12", "gtin13", "gtin14", "model",
                   "productID", "category", "color", "material", "size", "isbn", "inProductGroupWithID")
_OFFER_FIELDS = ("price", "lowPrice", "highPrice", "priceCurrency", "availability")
_WS = re.compile(r"\s+")


def _clean(value: Any) -> str:
    return _WS.sub(" ", str(value or "")).strip()[:MAX_VALUE_CHARS]


def _types(node: dict) -> List[str]:
    kind = node.get("@type")
    return [str(k) for k in (kind if isinstance(kind, list) else [kind]) if k]


def _walk_items(node: Any, depth: int = 0) -> Iterator[dict]:
    if depth > 6:
        return
    if isinstance(node, list):
        for item in node:
            yield from _walk_items(item, depth + 1)
    elif isinstance(node, dict):
        if ITEM_TYPES.intersection(_types(node)):
            yield node
        for key in ("@graph", "mainEntity", "itemListElement", "item", "hasVariant", "isVariantOf"):
            if key in node:
                yield from _walk_items(node[key], depth + 1)


def _name_of(value: Any) -> str:
    if isinstance(value, dict):
        return _clean(value.get("name") or value.get("@id"))
    if isinstance(value, list):
        return _name_of(value[0]) if value else ""
    return _clean(value)


def _compact_offer(offers: Any) -> Dict[str, str]:
    if isinstance(offers, list):
        offers = next((o for o in offers if isinstance(o, dict)), {})
    if not isinstance(offers, dict):
        return {}
    out = {k: _clean(offers.get(k)) for k in _OFFER_FIELDS if offers.get(k) not in (None, "")}
    if "availability" in out:
        out["availability"] = out["availability"].rsplit("/", 1)[-1]
    spec = offers.get("priceSpecification")
    if "price" not in out and isinstance(spec, dict) and spec.get("price") is not None:
        out["price"] = _clean(spec.get("price"))
        out.setdefault("priceCurrency", _clean(spec.get("priceCurrency")))
    return out


def _compact_item(node: dict) -> Dict[str, Any]:
    item: Dict[str, Any] = {"type": _types(node)[0]}
    for key in _PRODUCT_FIELDS:
        value = node.get(key)
        if value not in (None, "", []):
            item[key] = _name_of(value)
    offer = _compact_offer(node.get("offers")) if "Offer" not in item["type"] else _compact_offer(node)
    if offer:
        item["offer"] = offer
    parent = node.get("isVariantOf")
    if isinstance(parent, dict):
        item["variant_of"] = _clean(parent.get("name") or parent.get("productGroupID") or parent.get("@id"))
    props = node.get("additionalProperty")
    if isinstance(props, list):
        item["properties"] = {
            _clean(p.get("name"))[:60]: _clean(p.get("value"))
            for p in props[:30] if isinstance(p, dict) and p.get("name") and p.get("value") not in (None, "")
        }
    return item


def json_ld_items(soup: Tag) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
        try:
            data = json.loads(script.string or script.get_text() or "")
        except (ValueError, TypeError):
            continue
        for node in _walk_items(data):
            compact = _compact_item(node)
            if compact.get("name") or compact.get("offer"):
                items.append(compact)
            if len(items) >= MAX_PRODUCTS:
                return items
    return items


def microdata_items(soup: Tag) -> List[Dict[str, Any]]:
    items: List[Dict[str, Any]] = []
    for scope in soup.find_all(attrs={"itemscope": True, "itemtype": True}):
        kind = str(scope.get("itemtype") or "").rstrip("/").rsplit("/", 1)[-1]
        if kind not in ITEM_TYPES or scope.find_parent(attrs={"itemscope": True, "itemtype": re.compile("Product")}):
            continue
        item: Dict[str, Any] = {"type": kind}
        offer: Dict[str, str] = {}
        for prop in scope.find_all(attrs={"itemprop": True}):
            key = str(prop.get("itemprop"))
            value = _clean(prop.get("content") or prop.get("href") or prop.get_text(" ", strip=True))
            if not value:
                continue
            if key in _OFFER_FIELDS:
                offer.setdefault(key, value.rsplit("/", 1)[-1] if key == "availability" else value)
            elif key in _PRODUCT_FIELDS:
                item.setdefault(key, value)
        if offer:
            item["offer"] = offer
        if item.get("name"):
            items.append(item)
        if len(items) >= MAX_PRODUCTS:
            break
    return items


def label_value_pairs(soup: Tag) -> List[List[str]]:
    """Two-column table rows and ``<dl>`` pairs: the usual shape of spec sheets."""
    pairs: List[List[str]] = []
    for row in soup.find_all("tr"):
        cells = row.find_all(["th", "td"], recursive=False)
        if len(cells) == 2:
            label, value = _clean(cells[0].get_text(" ", strip=True)), _clean(cells[1].get_text(" ", strip=True))
            if label and value and len(label) <= 60 and label != value:
                pairs.append([label, value])
        if len(pairs) >= MAX_PAIRS:
            return pairs
    for dl in soup.find_all("dl"):
        label: Optional[str] = None
        for child in dl.find_all(["dt", "dd"]):
            text = _clean(child.get_text(" ", strip=True))
            if child.name == "dt":
                label = text[:60]
            elif label and text:
                pairs.append([label, text])
                label = None
            if len(pairs) >= MAX_PAIRS:
                return pairs
    return pairs


def capture(soup: Optional[Tag]) -> Dict[str, Any]:
    """Compact structured payload for ``meta_data``; empty dict when the page has none."""
    if soup is None:
        return {}
    try:
        out: Dict[str, Any] = {}
        items = json_ld_items(soup) or microdata_items(soup)
        if items:
            out["items"] = items
        pairs = label_value_pairs(soup)
        if pairs:
            out["pairs"] = pairs
        while out and len(json.dumps(out, ensure_ascii=False)) > MAX_BYTES:
            if out.get("pairs"):
                out["pairs"] = out["pairs"][: len(out["pairs"]) // 2] or None
                if not out["pairs"]:
                    out.pop("pairs")
            elif len(out.get("items") or []) > 1:
                out["items"] = out["items"][:1]
            else:
                return {}
        return out
    except Exception as exc:  # never fail a crawl because of structured capture
        logger.debug("structured capture failed: %s", exc)
        return {}
