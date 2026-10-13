"""Broad item listings ("products under 600"): a few items per category, the full category
breakdown, in-stock items first and an offer to narrow the list."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog.answer_context import ItemContext
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.query import LIST_LIMIT, run
from app.services.catalog.shaping import in_stock_first

BREAKDOWN = "Lipstick (8), Kajal (5), Foundation (2), Foundation Brush (1), Liquid Foundation (1), other (1)"


def _row(name, category, price, availability="in stock"):
    return SimpleNamespace(
        document_id=uuid.uuid4(), url=f"https://shop.example/{name.replace(' ', '-')}", name=name, brand="Glow",
        category=category, category_path=["Beauty", category] if category else ["Beauty"], price=price,
        list_price=None, currency="INR", availability=availability,
        attributes={"highlights": [], "fields": {}}, variant_group=None, source_id="s1", identifiers=[],
    )


@pytest.fixture()
def index():
    rows = [_row(f"Glow Velvet Lipstick {n}", "Lipstick", 199 + n) for n in range(8)]
    rows += [_row(f"Glow Kohl Kajal {n}", "Kajal", 149 + n) for n in range(5)]
    rows += [
        _row("Glow Mini Gift Box", None, 99),
        _row("Glow Matte Match Foundation", "Foundation", 599, "out of stock"),
        _row("Glow Skin Tint Foundation", "Foundation", 549),
        _row("Glow Luxe Foundation", "Foundation", 1299),
        _row("Glow Dewy Liquid Foundation", "Liquid Foundation", 499),
        _row("Glow Blend Foundation Brush", "Foundation Brush", 399),
    ]
    return CatalogIndex([_entry(r) for r in rows])


def test_broad_price_list_spreads_across_named_categories_first(index):
    r = run(index, "give me list of products available below 600rs")
    assert r.total == 18 and len(r.rows) == LIST_LIMIT
    assert [e.category for e in r.rows[:5]] == ["Lipstick", "Kajal", "Foundation", "Foundation Brush", "Liquid Foundation"]
    assert "Glow Mini Gift Box" not in [e.name for e in r.rows[:5]]
    assert dict((c, n) for c, n in r.category_counts) == {
        "Lipstick": 8, "Kajal": 5, "Foundation": 2, "Foundation Brush": 1, "Liquid Foundation": 1,
    }


def test_category_includes_its_subtypes_cheapest_first_out_of_stock_last(index):
    r = run(index, "foundation under 600")
    assert [e.name for e in r.rows] == [
        "Glow Dewy Liquid Foundation", "Glow Skin Tint Foundation", "Glow Matte Match Foundation",
    ]
    assert r.categories[0] == "Foundation"
    assert not r.category_counts


def test_named_subtype_stays_narrow(index):
    assert [e.name for e in run(index, "liquid foundation").rows] == ["Glow Dewy Liquid Foundation"]


def test_superlative_ignores_stock_order(index):
    r = run(index, "most expensive foundation under 600")
    assert r.single and r.rows[0].name == "Glow Matte Match Foundation"


def test_in_stock_first_keeps_order_within_groups(index):
    rows = sorted(index.entries, key=lambda e: e.price)
    ordered = in_stock_first(rows)
    assert ordered[-1].name == "Glow Matte Match Foundation"
    assert [e.price for e in ordered[:-1]] == sorted(e.price for e in ordered[:-1])


def test_prompt_states_total_breakdown_stock_and_narrowing(index):
    r = run(index, "products under 600")
    block = ItemContext(r, "products under 600").prompt_block([])
    assert f"All 18 matching items by category: {BREAKDOWN}." in block
    assert "narrow the list" in block


def test_prompt_marks_out_of_stock_rows(index):
    block = ItemContext(run(index, "foundation under 600")).prompt_block([])
    assert "out of stock" in block and "with that mark" in block and "Name every one of the 3 rows" in block
    assert "exclude none" in block
    assert "narrow the list" not in block


def test_price_list_answer_dropping_most_rows_is_replaced(index):
    ctx = ItemContext(run(index, "foundation under 600"))
    short = "Here are foundations under ₹600:\n- **Glow Skin Tint Foundation** — ₹549"
    full = short + "\n- **Glow Dewy Liquid Foundation** — ₹499\n- **Glow Matte Match Foundation** — ₹599 (out of stock)"
    assert ctx.contradicts(short) == "incomplete_list"
    assert ctx.contradicts(full) is None
    assert "Dewy Liquid" in ctx.fallback_answer() and "Matte Match" in ctx.fallback_answer()


def test_row_counts_only_when_named_before_its_own_price(index):
    ctx = ItemContext(run(index, "foundation under 600"))
    answer = "- **Glow Skin Tint Foundation** — ₹549 (MRP ₹599), like the Dewy Liquid and Matte Match ones."
    assert ctx.contradicts(answer) == "incomplete_list"


def test_unbounded_list_may_leave_rows_out(index):
    ctx = ItemContext(run(index, "foundation"))
    assert ctx.contradicts("Try the **Glow Skin Tint Foundation** — ₹549.") is None


def test_partial_list_answer_without_the_count_gets_it(index):
    ctx = ItemContext(run(index, "products under 600"))
    bare = "Here are some items priced below ₹600:\n- **Glow Velvet Lipstick 0** — ₹199\n- **Glow Kohl Kajal 0** — ₹149"
    done = ctx.complete(bare)
    assert done.startswith("18 items match, including Lipstick (8), Kajal (5), Foundation (2) and more.\n\n")
    assert ctx.complete(done) == done
    german = "Hier sind einige Produkte unter ₹600 für dich:\n- **Glow Velvet Lipstick 0** — ₹199"
    assert ctx.complete(german) == german


def test_review_histogram_rows_are_not_highlights():
    row = _row("Glow Velvet Lipstick", "Lipstick", 299)
    row.attributes["highlights"] = ["5 Star", "1 star: 0 (0%)", "4 Sterne", "Matte finish", "SPF 15"]
    assert _entry(row).highlights == ["Matte finish", "SPF 15"]


def test_fallback_answer_summarises_and_offers_to_narrow(index):
    answer = ItemContext(run(index, "products under 600")).fallback_answer()
    assert answer.startswith(f"18 items match ({BREAKDOWN}).")
    assert answer.rstrip().endswith("such as Lipstick?")
    stock = ItemContext(run(index, "foundation under 600")).fallback_answer()
    assert "out of stock" in stock
