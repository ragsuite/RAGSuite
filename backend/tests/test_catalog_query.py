"""Exact item questions over the in-memory catalog index (vocabulary comes from the data)."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog.answer_checks import price_spellings
from app.services.catalog.answer_context import ItemContext, money
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.query import run


def _row(name, brand, category, price, highlights=(), path=None, identifiers=()):
    return SimpleNamespace(
        document_id=uuid.uuid4(), url=f"https://shop.example/{name.replace(' ', '-')}", name=name, brand=brand,
        category=category, category_path=path or ["Home Goods", category], price=price, list_price=None,
        currency="INR", availability=None, attributes={"highlights": list(highlights), "fields": {}},
        variant_group=None, source_id="s1", identifiers=list(identifiers),
    )


@pytest.fixture()
def index():
    rows = [
        _row("Acme Nova 5G (Blue, 128 GB)", "Acme", "Mobiles", 13999, ["6 GB RAM | 128 GB ROM"]),
        _row("Acme Nova 5G (Green, 128 GB)", "Acme", "Mobiles", 13999, ["6 GB RAM | 128 GB ROM"]),
        _row("Zeta Edge 70 Pro 5G (Gray, 256 GB)", "Zeta", "Mobiles", 32999, ["8 GB RAM | 256 GB ROM"]),
        _row("Zeta Edge 70 Pro+ 5G (Gray, 256 GB)", "Zeta", "Mobiles", 39999, ["12 GB RAM | 256 GB ROM"]),
        _row("Budget B1 (Black, 32 GB)", "Budget", "Mobiles", 6499, ["3 GB RAM | 32 GB ROM"]),
        _row("Clearflow RO Copper Water Purifier", "Clearflow", "Water Purifiers", 8999, ["Copper infusion"]),
        _row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499, ["7 L tank"]),
        _row("Breeze BLDC Fan 1200 mm", "Breeze", "Ceiling Fans", 3499, ["28 W"], identifiers=["BF-1200X"]),
    ]
    return CatalogIndex([_entry(r) for r in rows])


def test_typo_name_lookup_is_exact(index):
    r = run(index, "do you have the zetta edge 70 pro mobile?")
    assert r.mode == "lookup" and r.exact
    assert r.rows[0].name.startswith("Zeta Edge 70 Pro 5G")


def test_partial_name_lists_all_variants_as_closest(index):
    r = run(index, "acme nova price")
    assert r.mode == "lookup"
    assert {e.name for e in r.rows} == {"Acme Nova 5G (Blue, 128 GB)", "Acme Nova 5G (Green, 128 GB)"}


def test_lowest_in_category_is_single_row(index):
    r = run(index, "which is the lowest priced water purifier?")
    assert r.mode == "list" and r.single
    assert [e.name for e in r.rows] == ["Aquapure UV Water Purifier"]


def test_highest_and_top_n(index):
    assert run(index, "most expensive mobile").rows[0].price == 39999
    assert [e.price for e in run(index, "top 2 cheapest mobiles").rows] == [6499, 13999]


def test_price_filter_is_exact(index):
    r = run(index, "mobiles under 15000")
    assert r.total == 3 and all(e.price <= 15000 for e in r.rows)


def test_measure_filter_and_closest_when_none(index):
    assert [e.price for e in run(index, "mobiles with 8 GB RAM").rows] == [32999]
    r = run(index, "mobiles with 16 GB RAM")
    assert r.rows == [] and r.closest


def test_brands_of_category(index):
    r = run(index, "which brands of water purifiers do you have?")
    assert r.mode == "brands"
    assert sorted(b for b, _ in r.brand_counts) == ["Aquapure", "Clearflow"]


def test_brand_list(index):
    r = run(index, "show me products from zeta")
    assert r.mode == "list" and {e.brand for e in r.rows} == {"Zeta"}


def test_feature_word_filters(index):
    assert [e.brand for e in run(index, "water purifiers with copper").rows] == ["Clearflow"]
    assert run(index, "water purifiers with alkaline magic") is None


def test_identifier_lookup_and_missing(index):
    assert run(index, "details of BF-1200X").rows[0].brand == "Breeze"
    missing = run(index, "price of model 11IJL9")
    assert missing.mode == "missing" and missing.rows == []


def test_non_item_question_is_left_to_retrieval(index):
    assert run(index, "what is your return policy?") is None
    assert run(None, "mobiles under 15000") is None


def test_prompt_block_and_fallback(index):
    r = run(index, "which is the lowest priced water purifier?")
    ctx = ItemContext(r)
    block = ctx.prompt_block([None, r.rows[0].document_id])
    assert "Aquapure UV Water Purifier" in block and "[S2]" in block and "row 1 only" in block
    assert ctx.passage_indices([None, r.rows[0].document_id]) == [2]
    assert "₹5,499" in ctx.fallback_answer()
    assert ctx.contradicts("The cheapest is the Clearflow RO Copper Water Purifier.") == "wrong_item"
    assert ctx.contradicts("The Aquapure UV Water Purifier costs ₹5,499.") is None


def test_money_and_price_spellings():
    assert money(109999, "INR") == "₹109,999"
    assert money(89.9, "EUR") == "€89.90"
    assert "1,09,999" in price_spellings(109999)
    assert "13.999" in price_spellings(13999)


def test_ties_same_name_variants_and_brand_spread():
    rows = [
        _row("Flame Ebony Glass Gas Stove", "Flame", "Gas Stoves", 1234),
        _row("Flame Ebony Glass Gas Stove", "Flame", "Gas Stoves", 2421),
        _row("Flame Ebony Glass Gas Stove", "Flame", "Gas Stoves", 1234),
        _row("Pilot One Gas Stove", "Pilot", "Gas Stoves", 1234),
        _row("Flame Pan 24 cm", "Flame", "Cookware", 499),
        _row("Flame Kettle 1 L", "Flame", "Kettles", 699),
    ]
    idx = CatalogIndex([_entry(r) for r in rows])
    assert sorted(e.price for e in run(idx, "price of flame ebony glass gas stove").rows) == [1234, 2421]
    cheapest = run(idx, "cheapest gas stove")
    assert cheapest.single and {e.brand for e in cheapest.rows} == {"Flame", "Pilot"}
    assert "share the same price" in ItemContext(cheapest).prompt_block([])
    assert ItemContext(cheapest).contradicts("The Pilot One Gas Stove is ₹1,234.") is None
    listing = run(idx, "list flame products")
    assert listing.category_counts[0] == ["Gas Stoves", 2]
    assert [e.category for e in listing.rows[:3]] == ["Gas Stoves", "Cookware", "Kettles"]


def test_item_named_with_its_brand_and_generic_words(index):
    r = run(index, "price of aquapure uv water purifier")
    assert r.mode == "lookup" and r.rows[0].name == "Aquapure UV Water Purifier"


def test_answer_naming_another_item_with_shared_feature_words_contradicts():
    rows = [
        _row("Purex ETERNA PREMIA 7 L RO + UV + UF + Copper Water Purifier", "Purex", "Water Purifiers", 11499),
        _row("Purex ETERNA PREMIA 7 L RO + UV + UF + Copper Water Purifier", "Purex", "Water Purifiers", 12999),
    ]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "i mean the lowest priced water purifier"))
    assert ctx.result.single and ctx.result.rows[0].price == 11499
    assert ctx.contradicts("The cheapest is Purex PEP-STAR 7 L RO + UV + UF + Copper at ₹9,499.") == "wrong_item"


def test_answer_quoting_another_price_for_a_similar_name_contradicts():
    rows = [
        _row("Greenchef Glace Glass Automatic Hob", "Greenchef", "Gas Stoves", 6269),
        _row("Greenchef Ebony Glass Manual Gas Stove", "Greenchef", "Gas Stoves", 2421),
    ]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "most expensive gas stove"))
    wrong = "The Greenchef Marvella Glass Top hob with automatic ignition is ₹11,199 (MRP ₹17,165)."
    assert ctx.contradicts(wrong) == "wrong_item"
    assert ctx.contradicts("The Greenchef Glace Glass Automatic Hob costs ₹6,269.") is None
    assert ctx.contradicts("The Greenchef Glace Glass Automatic Hob is the priciest.") is None
    assert ctx.contradicts("Greenchef Glace Glass Automatic Hob: ₹16,269") == "wrong_item"
    leading_other = ("The most expensive is the Greenchef Marvella Glass Top Automatic Hob with an MRP of ₹17,165. "
                     "Other options: Greenchef Glace Glass Automatic Hob — ₹6,269.")
    assert ctx.contradicts(leading_other) == "wrong_item"
    assert ctx.contradicts("Greenchef Glace Glass Automatic Hob — ₹6,269 (MRP ₹16,999).") is None


def test_filter_bound_quoted_first_is_not_a_contradiction():
    rows = [
        _row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499),
        _row("Clearflow RO Water Purifier", "Clearflow", "Water Purifiers", 8999),
    ]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "cheapest water purifier under 10000"))
    assert ctx.result.single
    assert ctx.contradicts("Under ₹10,000 the cheapest is the Aquapure UV Water Purifier at ₹5,499.") is None


def test_soft_denial_of_matching_rows_contradicts():
    rows = [
        _row("Penguin Random House India Pvt. Ltd How To Be Unbothered", "Penguin Random House India Pvt. Ltd", "Books", 191),
        _row("Penguin Random House India Pvt. Ltd Humans First, Machines Second", "Penguin Random House India Pvt. Ltd", "Books", 450),
    ]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "What is the price of Penguin Random House India Pvt?"))
    assert ctx.result.rows
    denial = "No relevant information about **Penguin Random House India Pvt.** or its prices is available in the provided documents."
    assert ctx.contradicts(denial) == "denied_rows"
    assert ctx.contradicts("Humans First, Machines Second costs ₹450; a paperback edition is not listed.") is None
    assert "₹450" in ctx.fallback_answer()


def test_attribute_denial_citing_row_details_is_not_a_refusal():
    rows = [
        _row("Zeta Edge 70 Pro (Tea Green, 256 GB)", "Zeta", "Mobiles", 39999),
        _row("Zeta Edge 70 Pro (Titan Blue, 256 GB)", "Zeta", "Mobiles", 39999),
    ]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "yellow Zeta Edge 70 Pro"))
    assert ctx.result.rows
    answer = "Yellow is not listed for the Zeta Edge 70 Pro. The available colours are Tea Green and Titan Blue."
    assert ctx.contradicts(answer) is None
    assert ctx.contradicts("No information about a yellow Zeta Edge 70 Pro is available.") == "denied_rows"


def test_missing_detail_with_related_facts_is_not_a_denial():
    rows = [_row("Glowly Magic Wand Waterproof Concealer", "Glowly", "Concealers", 424)]
    ctx = ItemContext(run(CatalogIndex([_entry(r) for r in rows]), "Glowly Magic Wand Waterproof Concealer"))
    assert ctx.result.rows
    answer = (
        "The Glowly Magic Wand Waterproof Concealer does not have an expiry date listed. "
        "It is long-wearing, crease-resistant and blends easily under the eyes."
    )
    assert ctx.contradicts(answer) is None
    assert ctx.contradicts(
        "The Glowly Magic Wand Waterproof Concealer has larger item dimensions (9.3 x 2.7 x 20.1 cm) "
        "compared to the Twist And Shout Fadeproof Kajal, whose dimensions are not listed."
    ) is None
    assert ctx.contradicts("The Glowly Magic Wand Waterproof Concealer is not listed.") == "denied_rows"
    assert ctx.contradicts(
        "Sorry, the Glowly Magic Wand Waterproof Concealer is not listed."
    ) == "denied_rows"
