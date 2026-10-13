"""Variant values (colours) from the records: narrowing, "not in that colour" alternatives,
value-only follow-ups and topic switches."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog import variants
from app.services.catalog.answer_context import ItemContext
from app.services.catalog.followup import Scope, followup_queries
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.query import run
from app.services.rag import item_answers


def _row(name, brand, category, price, *, color=None, seller="Shop One", group=None, parent="Electronics"):
    fields = {"Seller": seller, **({"Color": color} if color else {})}
    return SimpleNamespace(
        document_id=uuid.uuid4(), url=f"https://shop.example/{name.replace(' ', '-')}", name=name, brand=brand,
        category=category, category_path=[parent, category], price=price, list_price=None, currency="INR",
        availability=None, attributes={"highlights": [], "fields": fields}, variant_group=group,
        source_id="s1", identifiers=[],
    )


@pytest.fixture()
def index():
    rows = [
        _row("Moto Edge 70 Fusion Snapdragon (Pantone Blue Surf, 128 GB)", "Moto", "Mobiles", 30999,
             color="Pantone Blue Surf", group="moto edge 70 fusion"),
        _row("Moto Edge 70 Fusion Snapdragon (Pantone Blue Surf, 256 GB)", "Moto", "Mobiles", 34999,
             color="Pantone Blue Surf", group="moto edge 70 fusion"),
        _row("Moto Edge 70 Pro (Titan Blue, 256 GB)", "Moto", "Mobiles", 39999, color="Titan Blue", group="moto edge 70 pro"),
        _row("Acme Nova 5G (Navy, 128 GB)", "Acme", "Mobiles", 55299, color="Navy", group="acme nova 5g"),
        _row("Acme Nova 5G (Silver Shadow, 128 GB)", "Acme", "Mobiles", 55299, color="Silver Shadow", group="acme nova 5g"),
        _row("Nada Phone (Black, 128 GB)", "Nada", "Mobiles", 29999, color="Black", seller="Shop One", group="nada phone"),
        _row("Nada Phone (Blue, 128 GB)", "Nada", "Mobiles", 29999, color="Blue", seller="Shop Two", group="nada phone"),
        _row("Sunny S1 (Yellow, 64 GB)", "Sunny", "Mobiles", 9999, color="Yellow", group="sunny s1"),
        _row("Pad Tab 11 (Yellow)", "Pad", "Tablets", 45399, color="Yellow", group="pad tab 11"),
        _row("Sole Runner Sneakers (Yellow)", "Sole", "Shoes", 999, color="Yellow", group="sole runner sneakers",
             parent="Footwear"),
        _row("Zen Buds Pro Earbuds", "Zen", "Audio", 2999),
        _row("Kito Pro Mixer", "Kito", "Kitchen", 3999),
        _row("Lumo Pro Desk Lamp", "Lumo", "Lighting", 1499),
        _row("Vista 80 cm Smart TV", "Vista", "Televisions", 14490),
        _row("Vista Book 14 Laptop", "Vista", "Laptops", 63990),
        _row("Arc Aspire 14 Laptop", "Arc", "Laptops", 34990),
    ]
    return CatalogIndex([_entry(r) for r in rows])


def _follow(index, first, message, *, is_followup=True):
    scope = Scope.from_dict(Scope.of(run(index, first)).to_dict())
    for query, relax in followup_queries(index, message, scope, is_followup=is_followup):
        result = run(index, query, relax_terms=relax)
        if result is not None and (result.rows or result.closest or result.brand_counts):
            return result
    return None


def test_vocabulary_comes_from_fields_named_in_item_names(index):
    vocab = index.variants
    assert vocab.keys == {"Color"}  # the seller changes within a family but is never in the name
    assert {("yellow",), ("navy",), ("pantone", "blue", "surf")} <= vocab.values


def test_values_are_matched_longest_first_and_never_from_plain_words(index):
    assert variants.values_in(index.variants, "the pantone blue surf one") == [("pantone", "blue", "surf")]
    assert variants.values_in(index.variants, "is it good for light use") == []


def test_near_tied_names_prefer_the_one_with_the_words_the_user_typed(index):
    r = run(index, "is moto edge 70 fusion available?")
    assert r.mode == "lookup" and {e.price for e in r.rows} == {30999, 34999}


def test_named_value_narrows_the_variants(index):
    r = run(index, "acme nova in navy")
    assert r.mode == "lookup" and [e.name for e in r.rows] == ["Acme Nova 5G (Navy, 128 GB)"]
    assert not r.filters.get("unmatched") and not r.closest


def test_missing_value_keeps_the_variants_and_offers_related_alternatives_only(index):
    r = run(index, "moto edge 70 fusion in yellow")
    assert {e.price for e in r.rows} == {30999, 34999}
    assert r.filters["unmatched"] == ["yellow"] and r.filters["alternatives_for"] == ["yellow"]
    assert [e.name for e in r.closest] == ["Sunny S1 (Yellow, 64 GB)", "Pad Tab 11 (Yellow)"]


def test_answer_says_not_available_then_variants_then_alternatives(index):
    ctx = ItemContext(run(index, "moto edge 70 fusion in yellow"))
    answer = ctx.fallback_answer()
    assert answer.index("No listed variant has yellow") < answer.index("Moto Edge 70 Fusion") < answer.index(
        "Other items available in yellow") < answer.index("Sunny S1")
    assert "OTHER ITEMS IN YELLOW" in ctx.prompt_block([])


def test_answer_that_skips_the_alternatives_gets_them_appended_once(index):
    ctx = ItemContext(run(index, "moto edge 70 fusion in yellow"))
    bare = "The Moto Edge 70 Fusion is not available in yellow; it comes in Pantone Blue Surf only."
    done = item_answers.complete_answer(ctx, bare)
    assert done.startswith(bare) and "Available in yellow instead: **Sunny S1 (Yellow, 64 GB)** – ₹9,999" in done
    assert item_answers.complete_answer(ctx, done) == done
    assert item_answers.complete_answer(None, bare) == bare


@pytest.mark.parametrize("message", ["in yellow color", "do you have it in yellow?"])
def test_value_only_followup_stays_on_the_item(index, message):
    r = _follow(index, "is moto edge 70 fusion available?", message, is_followup=False)
    assert r.mode == "lookup" and {e.brand for e in r.rows} == {"Moto"} and r.filters["unmatched"] == ["yellow"]


def test_value_only_followup_selects_the_matching_variant(index):
    r = _follow(index, "acme nova 5g price", "in navy?", is_followup=False)
    assert [e.name for e in r.rows] == ["Acme Nova 5G (Navy, 128 GB)"]


def test_unavailable_value_does_not_stick_to_the_next_turn(index):
    scope = Scope.of(run(index, "in yellow color moto edge 70 fusion"))
    assert "yellow" not in scope.query.lower() and "moto" in scope.query.lower()


def test_question_naming_another_item_switches_topic(index):
    scope = Scope.of(run(index, "is moto edge 70 fusion available?"))
    assert followup_queries(index, "is the pad tab 11 available in yellow?", scope, is_followup=True) == []


def test_short_question_about_another_category_drops_the_previous_brand(index):
    r = _follow(index, "vista tvs", "cheapest laptop", is_followup=False)
    assert r.single and r.rows[0].name == "Arc Aspire 14 Laptop"


def test_linked_question_about_another_category_keeps_the_brand(index):
    r = _follow(index, "vista tvs", "and laptops?")
    assert [e.name for e in r.rows] == ["Vista Book 14 Laptop"]
