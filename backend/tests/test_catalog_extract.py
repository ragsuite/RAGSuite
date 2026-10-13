"""Automatic item records from page text and schema.org data (no site-specific rules)."""
from __future__ import annotations

from bs4 import BeautifulSoup

from app.services.catalog import structured_capture
from app.services.catalog.extract import brand_and_category, extract_record
from app.services.catalog.normalize import (
    identifiers_in,
    measures,
    money_in,
    parse_amount,
    similar_token,
    variant_group,
)

PRODUCT_PAGE = """Home
/
Electronics
/
Mobiles
/
Acme Mobiles
/
Acme Nova 5G (Blue, 128 GB)
Sponsored
Other Brand X1 (Black, 64 GB)
₹8,999
Acme Nova 5G (Blue, 128 GB)
4.3
41% off
23,999
₹13,999
+ ₹99 Protect Promise Fee
Buy at ₹13,999
Product highlights
6 GB RAM | 128 GB ROM
6000 mAh Battery
In stock
Description
A phone."""

LISTING_PAGE = """Explore Plus
Login
Mobiles
Acme Nova 5G (Blue, 128 GB)
₹13,999
Other Brand X1 (Black, 64 GB)
₹8,999"""

JSON_LD_PAGE = """<html><head><title>Trail Shoe</title><script type="application/ld+json">
{"@context":"https://schema.org","@type":"Product","name":"Trail Runner 2",
 "brand":{"@type":"Brand","name":"Peak"},"sku":"TR-2002","category":"Shoes > Running",
 "offers":{"@type":"Offer","price":"89.90","priceCurrency":"EUR","availability":"https://schema.org/InStock"}}
</script></head><body><h1>Trail Runner 2</h1>
<table><tr><th>Weight</th><td>280 g</td></tr><tr><th>Drop</th><td>6 mm</td></tr></table></body></html>"""


def test_product_page_text_becomes_record():
    rec = extract_record("Acme Nova 5G (Blue, 128 GB) Price in India - Buy online", PRODUCT_PAGE, {})
    assert rec is not None
    assert rec.name == "Acme Nova 5G (Blue, 128 GB)"
    assert (rec.brand, rec.category) == ("Acme", "Mobiles")
    assert (rec.price, rec.list_price, rec.currency) == (13999.0, 23999.0, "INR")
    assert "6 GB RAM | 128 GB ROM" in rec.attributes["highlights"]
    assert rec.variant_group == "acme nova 5g"


def test_ad_block_before_the_item_is_not_its_price():
    rec = extract_record("Acme Nova 5G (Blue, 128 GB) Price in India", PRODUCT_PAGE, {})
    assert rec.price != 8999.0


def test_listing_page_is_not_an_item():
    assert extract_record("Mobiles - Buy online", LISTING_PAGE, {}) is None


def test_variant_words_in_leaf_still_name_the_item():
    page = PRODUCT_PAGE.replace("Acme Nova 5G (Blue, 128 GB)", "Nova 5G (Woven Fabric - Deep Ocean Blue, 128 GB)")
    rec = extract_record("ACME Nova 5G (128 GB Storage, 6 GB RAM) Online at Best Price", page, {})
    assert rec is not None and rec.price == 13999.0
    assert rec.name.startswith("Acme Nova 5G (Woven Fabric")


def test_slogan_title_uses_the_restated_leaf():
    page = PRODUCT_PAGE.replace("Acme Nova 5G (Blue, 128 GB)\nSponsored", "Nova 5G (Blue, 128 GB)\nSponsored")
    rec = extract_record("Big camera, bigger battery at ₹13,999", page, {})
    assert rec is not None and rec.name == "Acme Nova 5G (Blue, 128 GB)" and rec.price == 13999.0



def test_site_blocks_are_skipped():
    assert extract_record("x", PRODUCT_PAGE, {"content_kind": "header"}) is None


def test_schema_org_product_wins_and_fills_fields():
    soup = BeautifulSoup(JSON_LD_PAGE, "html.parser")
    captured = structured_capture.capture(soup)
    assert captured["items"][0]["offer"]["price"] == "89.90"
    rec = extract_record("Trail Shoe", "Trail Runner 2", {structured_capture.STRUCTURED_KEY: captured})
    assert rec.method == "schemaorg"
    assert (rec.brand, rec.price, rec.currency) == ("Peak", 89.9, "EUR")
    assert rec.category_path == ["Shoes", "Running"]
    assert "TR-2002" in rec.identifiers
    assert rec.attributes["fields"]["Weight"] == "280 g"


def _structured(*items):
    return {structured_capture.STRUCTURED_KEY: {"items": list(items)}}


FULL_ITEM = {"type": "Product", "name": "Glow Mist", "brand": "Dew", "offer": {"price": "674.0", "priceCurrency": "INR"}}
SLOGAN_PAGE = """Glow Mist
Rs. 674.00
Description
Locks makeup for 16 hours.
Net volume: 50 ml
Country of Origin: PRC
Manufactured for: Dew LLC
Company Address: 8 The Green, Dover
Read more
Related products
Other Mist
Rs. 499.00"""


def test_repeated_product_entry_merges_into_one_item():
    rec = extract_record("Setting Spray for Dewy Finish, 16HR", SLOGAN_PAGE, _structured(FULL_ITEM, {"type": "Product", "name": "Glow Mist"}))
    assert rec is not None and rec.method == "schemaorg"
    assert (rec.price, rec.currency) == (674.0, "INR")


def test_structured_item_reads_detail_rows_under_its_name():
    rec = extract_record("Setting Spray for Dewy Finish, 16HR", SLOGAN_PAGE, _structured(FULL_ITEM))
    assert rec.attributes["fields"]["Country of Origin"] == "PRC"
    assert rec.attributes["fields"]["Net volume"] == "50 ml"


def test_two_different_products_stay_ambiguous():
    other = {"type": "Product", "name": "Other Mist", "offer": {"price": "499"}}
    assert extract_record("Setting Spray", SLOGAN_PAGE, _structured(FULL_ITEM, other)) is None


def test_capture_never_raises_on_broken_json():
    soup = BeautifulSoup('<script type="application/ld+json">{broken</script>', "html.parser")
    assert structured_capture.capture(soup) == {}
    assert structured_capture.capture(None) == {}


def test_brand_store_crumb_gives_brand():
    assert brand_and_category(["Home", "Kitchen", "Water Purifiers", "Livo Water Purifiers", "X"]) == (
        "Livo", "Water Purifiers", ["Kitchen", "Water Purifiers"],
    )


def test_amounts_in_any_grouping():
    assert parse_amount("1,09,999") == 109999.0
    assert parse_amount("13.999,00") == 13999.0
    assert parse_amount("1 299.99") == 1299.99
    assert money_in("+ ₹99 fee") == [(99.0, "INR", True)]
    assert money_in("€ 89,90")[0][:2] == (89.9, "EUR")


def test_measures_and_identifiers():
    assert [m.text for m in measures("8 GB RAM, 1.5 ton, 500g")] == ["8 GB", "1.5 ton", "500 g"]
    assert measures("Nova 5G phone") == []
    assert identifiers_in("model 11IJL9 and i7-1355U, 10-Stage, 128GB") == ["11IJL9", "i7-1355U"]
    assert variant_group("Acme", "Nova (Blue, 128 GB)") == "acme nova"


def test_typo_tolerant_tokens():
    assert similar_token("motoroal", "motorola")
    assert similar_token("purified", "purifiers")
    assert not similar_token("one", "ones")
    assert not similar_token("70", "71")
    assert similar_token("moisturizer", "moisturizing")
    assert not similar_token("founder", "foundation")
    assert not similar_token("organic", "organization")


def test_card_of_another_model_code_is_not_the_anchor():
    page = """Home
/
Appliances
/
Dishwashers
/
BRAND Dishwashers
/
BRAND QX66GW01 Free Standing Dishwasher
Trending
BRAND QX66GI01 Free Standing 13 Place Settings Dishwasher
16% OFF
₹56,390
₹47,590
AD
BRAND QX66GW01 Free Standing 13 Place...
more
4.4
12%
50,590
₹44,590"""
    rec = extract_record("BRAND QX66GW01 Free Standing 13 Place Settings Dishwasher", page, {})
    assert rec is not None and rec.price == 44590.0
