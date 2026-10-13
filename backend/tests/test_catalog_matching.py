"""Category matching tiers, spec ranking, comparisons and filler words over a small catalog."""
from __future__ import annotations

import uuid
from types import SimpleNamespace

import pytest

from app.services.catalog.category_match import fold_plural
from app.services.catalog.followup import Scope, followup_queries
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.normalize import memory_pair
from app.services.catalog.query import run
from app.services.catalog.spec_rank import rank_request


def _row(name, brand, category, price, highlights=()):
    return SimpleNamespace(
        document_id=uuid.uuid4(), url=f"https://shop.example/{name.replace(' ', '-')}", name=name, brand=brand,
        category=category, category_path=["Shop", category], price=price, list_price=None, currency="INR",
        availability=None, attributes={"highlights": list(highlights), "fields": {}}, variant_group=None,
        source_id="s1", identifiers=[],
    )


@pytest.fixture()
def index():
    rows = [
        _row("Acme Nova 5G (Blue, 128 GB)", "Acme", "Mobiles", 13999, ["8 GB RAM | 128 GB ROM", "5000 mAh Battery"]),
        _row("Acme Nova Max 5G (Blue, 256 GB)", "Acme", "Mobiles", 19999, ["12 GB RAM | 256 GB ROM", "7000 mAh Battery"]),
        _row("Nada Phone (2a) (Black, 128 GB)", "Nada", "Mobiles", 24999, ["8 GB RAM | 128 GB ROM", "5500 mAh Battery"]),
        _row("Vista 80 cm HD Ready Smart TV", "Vista", "Televisions", 10999),
        _row("Vista 108 cm 4K Smart TV", "Vista", "Televisions", 24999),
        _row("Orbit 109 cm 4K Smart Google TV", "Orbit", "Televisions", 30999),
        _row("Coolair 1.5 Ton 3 Star Split Inverter AC", "Coolair", "Air Conditioners", 32990),
        _row("Coolair 1 Ton 3 Star Split Inverter AC", "Coolair", "Air Conditioners", 27990),
        _row("Frostline 1 Ton 5 Star Split Inverter AC", "Frostline", "Air Conditioners", 35990),
        _row("Spinx 500 W Mixer Grinder", "Spinx", "Mixer Juicer Grinder", 945),
        _row("Spinx 750 W Mixer Grinder", "Spinx", "Mixer Juicer Grinder", 2499),
        _row("Oakwood Side Table", "Oakwood", "Tables", 899),
        _row("Pad Tab 11 Tablet", "Pad", "Tablets", 14999),
        _row("Heatwave 20 L Grill Microwave Oven", "Heatwave", "Microwave Ovens", 8290),
        _row("Heatwave 9 L Oven Toaster Grill", "Heatwave", "Oven Toaster Grills", 2999),
        _row("Orbit 139 cm 4K Smart TV for Gaming", "Orbit", "Televisions", 71999, ["Ideal for Gamestation consoles"]),
        _row("Orbit 164 cm 4K TV Feature for Playbox 5", "Orbit", "Televisions", 89999),
    ]
    return CatalogIndex([_entry(r) for r in rows])


def test_plural_folding():
    assert fold_plural("tvs")[1] == "tv" and "battery" in fold_plural("batteries")


@pytest.mark.parametrize(
    "query, category",
    [
        ("cheapest TVs", "Televisions"),          # synonym after plural folding
        ("cheapest phone", "Mobiles"),            # everyday synonym
        ("do you sell ACs", "Air Conditioners"),  # word that marks the category's item names
        ("mixer grinders under 1000", "Mixer Juicer Grinder"),  # label head noun
    ],
)
def test_category_tiers(index, query, category):
    assert run(index, query).categories[:1] == [category]


def test_exact_label_wins_over_near_spelling(index):
    assert run(index, "side tables").categories == ["Tables"]


def test_category_word_is_not_a_model_name(index):
    r = run(index, "8/128 phones?")
    assert r.mode == "list" and r.filters["measures"] == ["8 GB", "128 GB"]
    assert {e.brand for e in r.rows} == {"Acme", "Nada"}


def test_memory_pair_shorthand():
    assert [m.text for m in memory_pair("8/128 phones")] == ["8 GB", "128 GB"]
    assert memory_pair("delivery on 12/10") == [] and memory_pair("1/2 price") == []


def test_amount_shorthand_is_not_a_feature_word(index):
    r = run(index, "TV under 20k")
    assert [e.price for e in r.rows] == [10999]


def test_filler_words_do_not_block_an_operation(index):
    assert run(index, "cheapest mixer grinder plz").rows[0].price == 945
    assert run(index, "sabse sasta mobile konsa hai?").rows[0].price == 13999
    assert run(index, "What is the most affordable mobile available?").rows[0].price == 13999


def test_unknown_name_is_kept(index):
    assert run(index, "cheapest Zentrix phone") is None


def test_rank_request_detection():
    assert rank_request("which has the biggest battery?").attribute == "battery"
    assert rank_request("phone with most RAM").descending
    assert rank_request("most expensive phone") is None and rank_request("less than 20000") is None


def test_rank_by_spec(index):
    r = run(index, "which mobile has the biggest battery?")
    assert r.single and r.rows[0].brand == "Acme" and r.rank.values[r.rows[0].document_id] == 7000


def test_compare_looks_up_each_item(index):
    r = run(index, "Compare the price of Acme Nova Max and Nada Phone 2a")
    assert r.filters.get("compared") and {e.brand for e in r.rows} == {"Acme", "Nada"}


def test_which_category_is_cheaper_compares_both_items(index):
    r = run(index, "Which phone is cheaper: Acme Nova Max or Nada Phone 2a?")
    assert r.filters.get("compared") and {e.brand for e in r.rows} == {"Acme", "Nada"}


def test_compare_reports_the_missing_item(index):
    r = run(index, "Compare Acme Nova Max vs Zorro X9 Ultra")
    assert r.filters["unmatched_items"] == ["Zorro X9 Ultra"]


def _follow(index, first, message, *, is_followup=True):
    scope = Scope.from_dict(Scope.of(run(index, first)).to_dict())
    for query, relax in followup_queries(index, message, scope, is_followup=is_followup):
        result = run(index, query, relax_terms=relax)
        if result is not None and (result.rows or result.brand_counts):
            return result
    return None


def test_brand_only_followup_keeps_category_and_filters(index):
    r = _follow(index, "TVs under 30000", "only vista", is_followup=False)
    assert r.categories == ["Televisions"] and {e.brand for e in r.rows} == {"Vista"}


def test_category_switch_keeps_the_sort(index):
    r = _follow(index, "most expensive mobile?", "and TVs?", is_followup=False)
    assert r.single and r.rows[0].price == 89999


def test_feature_words_carry_into_the_followup(index):
    r = _follow(index, "split ACs with 5 star", "which one is cheapest?")
    assert r.rows[0].brand == "Frostline"


def test_singular_category_word_can_be_part_of_the_name(index):
    r = run(index, "price of Heatwave 20 L Grill")
    assert [e.price for e in r.rows] == [8290]


@pytest.mark.parametrize("query", ["Price of Orbit Gamestation 9?", "Price of Orbit Playbox 9?"])
def test_model_the_catalog_lacks_is_missing(index, query):
    r = run(index, query)
    assert r.mode == "missing" and not r.rows


def test_brand_question_about_a_site_topic_is_left_to_the_pages(index, monkeypatch):
    from app.services.catalog import service
    from app.services.rag import lexical_index

    topic = run(index, "Who is the Founder of Orbit?")
    assert topic.mode == "missing" and topic.filters["unknown_terms"] == ["founder"]
    monkeypatch.setattr(lexical_index, "project_mentions", lambda _p, words: words == ["founder"])
    assert service._asks_about_site_topic("p1", topic)
    assert not service._asks_about_site_topic("p1", run(index, "Orbit Gamestation price"))
    assert not service._asks_about_site_topic("p1", run(index, "Price of Orbit Gamestation 9?"))


def test_model_named_with_its_number_is_found(index):
    assert [e.price for e in run(index, "Price of Orbit Playbox 5").rows] == [89999]


def test_correction_keeps_the_previous_question(index):
    r = _follow(index, "cheapest TV", "i mean from mixer grinders", is_followup=False)
    assert r.single and r.rows[0].price == 945


def test_definite_category_after_a_brand_listing_keeps_the_brand(index):
    r = _follow(index, "Show me products from Vista", "what is the price of the TVs?", is_followup=False)
    assert {e.brand for e in r.rows} == {"Vista"}
    r = _follow(index, "Show me products from Vista", "do you have TVs", is_followup=False)
    assert r is None


@pytest.mark.parametrize("message", ["with 8 GB RAM", "only under 15000", "which has the biggest battery?"])
def test_refinement_without_anchor_keeps_the_scope(index, message):
    r = _follow(index, "mobiles under 20000", message, is_followup=False)
    assert r is not None and r.categories == ["Mobiles"] and all(e.price <= 20000 for e in r.rows)
