"""Follow-up item questions inherit the previous item scope (category, brand, filters, item)."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog.followup import Scope, asks_about_shown, followup_queries, other_items_named
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.query import run


def _row(name, brand, category, price, highlights=(), seller="Shop One"):
    return SimpleNamespace(
        document_id=uuid.uuid4(), url=f"https://shop.example/{name.replace(' ', '-')}", name=name, brand=brand,
        category=category, category_path=["Home Goods", category], price=price, list_price=None,
        currency="INR", availability=None, attributes={"highlights": list(highlights), "fields": {"Seller": seller}},
        variant_group=None, source_id="s1", identifiers=[],
    )


@pytest.fixture()
def index():
    rows = [
        _row("Acme Nova 5G (Blue, 128 GB)", "Acme", "Mobiles", 13999, ["6 GB RAM | 128 GB ROM", "5000 mAh Battery"]),
        _row("Acme Nova 5G (Blue, 256 GB)", "Acme", "Mobiles", 15999, ["8 GB RAM | 256 GB ROM", "5000 mAh Battery"]),
        _row("Zeta Edge 70 Pro 5G (Gray, 256 GB)", "Zeta", "Mobiles", 32999, ["8 GB RAM | 256 GB ROM"]),
        _row("Budget B1 (Black, 32 GB)", "Budget", "Mobiles", 6499, ["3 GB RAM | 32 GB ROM", "6000 mAh Battery"]),
        _row("Budget B2 (Black, 64 GB)", "Budget", "Mobiles", 8499, ["4 GB RAM | 64 GB ROM", "5500 mAh Battery"]),
        _row("Clearflow RO Copper Water Purifier", "Clearflow", "Water Purifiers", 8999),
        _row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499),
        _row("Aquapure Max Mixer Grinder 750 W", "Aquapure", "Mixer Grinders", 3999),
        _row("Breeze Mixer Grinder 500 W", "Breeze", "Mixer Grinders", 2499),
    ]
    return CatalogIndex([_entry(r) for r in rows])


def _follow(index, first: str, message: str, *, is_followup: bool = True):
    scope = Scope.from_dict(Scope.of(run(index, first)).to_dict())
    for query, relax in followup_queries(index, message, scope, is_followup=is_followup):
        result = run(index, query, relax_terms=relax)
        if result is not None and (result.rows or result.closest or result.brand_counts):
            return result
    return None


def test_superlative_keeps_category_and_filters(index):
    r = _follow(index, "mobiles with 8 GB RAM and 256 GB storage", "which one is the cheapest?")
    assert r.single and r.rows[0].name == "Acme Nova 5G (Blue, 256 GB)"


def test_superlative_after_brand_listing_keeps_category(index):
    r = _follow(index, "water purifier brands", "please share the lowest price model", is_followup=False)
    assert r.single and r.rows[0].name == "Aquapure UV Water Purifier"


def test_pronoun_question_targets_the_single_item_shown(index):
    r = _follow(index, "cheapest water purifier", "who sells it?")
    assert r.mode == "lookup" and r.rows[0].name == "Aquapure UV Water Purifier"


def test_new_category_keeps_listed_brand(index):
    r = _follow(index, "aquapure water purifier", "and the mixer grinder?")
    assert [e.name for e in r.rows] == ["Aquapure Max Mixer Grinder 750 W"]


def test_scope_question_ranks_by_the_named_spec(index):
    r = _follow(index, "mobiles under 10000", "which one has the biggest battery?")
    assert r.single and [e.name for e in r.rows] == ["Budget B1 (Black, 32 GB)"]
    assert r.rank.unit == "mah" and r.rank.values[r.rows[0].document_id] == 6000


def test_switch_to_most_expensive_in_same_scope(index):
    r = _follow(index, "cheapest water purifier", "I mean the most expensive one")
    assert r.single and r.rows[0].name == "Clearflow RO Copper Water Purifier"


def test_variant_question_reports_missing_measure(index):
    r = _follow(index, "do you have acme nova", "do you have it in 1 TB?")
    assert r.mode == "lookup" and r.filters.get("unmatched") == ["1 TB"]


def test_message_naming_its_own_item_or_brand_stands_alone(index):
    scope = Scope.of(run(index, "cheapest water purifier"))
    assert followup_queries(index, "price of zeta edge 70 pro", scope, is_followup=True) == []
    assert followup_queries(index, "list Breeze products", scope, is_followup=True) == []
    assert followup_queries(index, "what is your return policy?", scope, is_followup=False) == []


@pytest.mark.parametrize("message", [
    "yes", "nah. how many days to return", "which payment methods u accept", "what about shipping fee",
    "ok n delivery time?", "seller?",
])
def test_message_without_explicit_item_reference_carries_no_item_scope(index, message):
    scope = Scope.from_dict(Scope.of(run(index, "cheapest water purifier")).to_dict())
    assert followup_queries(index, message, scope, is_followup=True) == []
    assert followup_queries(index, message, scope, is_followup=False) == []


def test_item_named_in_part_is_found_for_the_rewriter(index):
    scope = Scope.from_dict(Scope.of(run(index, "cheapest water purifier")).to_dict())
    assert other_items_named(index, "n the copper one?", scope) == ["Clearflow RO Copper Water Purifier"]
    assert other_items_named(index, "is it in stock?", scope) == []
    assert other_items_named(index, "n the aquapure uv one?", scope) == []


@pytest.mark.parametrize("message,expected", [
    ("how many filter stages are there?", True),
    ("what warranty period", True),
    ("n the copper one?", False),
    ("price of zeta edge 70 pro", False),
    ("any mixer grinder?", False),
    ("list all products", False),
])
def test_question_naming_nothing_asks_about_items_shown(index, message, expected):
    scope = Scope.from_dict(Scope.of(run(index, "cheapest water purifier")).to_dict())
    assert asks_about_shown(index, message, scope) is expected
    assert asks_about_shown(index, message, Scope(mode="lookup")) is False


@pytest.mark.parametrize("message", ["n the copper one?", "which one is better?"])
def test_pointing_away_from_the_single_item_shown_carries_no_scope(index, message):
    scope = Scope.from_dict(Scope.of(run(index, "cheapest water purifier")).to_dict())
    assert followup_queries(index, message, scope, is_followup=True) == []


def test_new_scope_after_missing_item_uses_the_message(index):
    r = _follow(index, "price of model 11IJL9", "ok, show me mobiles under 10000")
    assert {e.name for e in r.rows} == {"Budget B1 (Black, 32 GB)", "Budget B2 (Black, 64 GB)"}


def test_reference_without_rewriter_follow_up_flag(index):
    r = _follow(index, "do you have acme nova", "do you have the blue colour in it", is_followup=False)
    assert r.mode == "lookup" and r.rows[0].name.startswith("Acme Nova")


def test_whole_brand_listing_is_brand_wide(index):
    from app.services.catalog.followup import brand_wide

    assert brand_wide(index, "please share the list of products from Aquapure")
    assert not brand_wide(index, "what about Aquapure?")
    assert not brand_wide(index, "Aquapure water purifiers")
    r = run(index, "please share the list of products from Aquapure")
    assert {e.category for e in r.rows} == {"Water Purifiers", "Mixer Grinders"}


@pytest.mark.parametrize("message", [
    "give me list of items below 9000 rs", "show all products under 9000", "list of products available below 9000rs",
])
def test_catalog_wide_price_list_leaves_the_previous_category(index, message):
    from app.services.catalog.followup import catalog_wide

    scope = Scope.from_dict(Scope.of(run(index, "water purifiers under 10000")).to_dict())
    assert catalog_wide(index, message)
    assert followup_queries(index, message, scope, is_followup=True) == []
    r = run(index, message)
    assert {e.category for e in r.rows} == {"Mobiles", "Water Purifiers", "Mixer Grinders"}


@pytest.mark.parametrize("message", ["any other products like this?", "mobile products under 9000", "aquapure products"])
def test_pointing_back_or_naming_a_scope_is_not_catalog_wide(index, message):
    from app.services.catalog.followup import catalog_wide

    assert not catalog_wide(index, message)


def test_category_after_catalog_wide_price_list_keeps_the_price(index):
    r = _follow(index, "products under 9000", "what about mobiles?")
    assert {e.name for e in r.rows} == {"Budget B1 (Black, 32 GB)", "Budget B2 (Black, 64 GB)"}


def test_brand_listing_shows_each_model_before_its_variants():
    from app.services.catalog.shaping import spread_categories

    rows = [
        _row("Acme Nova 5G (Blue, 128 GB)", "Acme", "Mobiles", 13999),
        _row("Acme Nova 5G (Green, 128 GB)", "Acme", "Mobiles", 13999),
        _row("Acme Nova 5G (Red, 128 GB)", "Acme", "Mobiles", 13999),
        _row("Acme Orbit 5G (Black, 256 GB)", "Acme", "Mobiles", 19999),
    ]
    for r in rows:
        r.variant_group = "acme orbit 5g" if "Orbit" in r.name else "acme nova 5g"
    entries = [_entry(r) for r in rows]
    shown, _ = spread_categories(entries, 2)
    assert [e.name for e in shown] == ["Acme Nova 5G (Blue, 128 GB)", "Acme Orbit 5G (Black, 256 GB)"]
