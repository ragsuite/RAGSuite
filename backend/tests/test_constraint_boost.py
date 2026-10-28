"""Query-time constraint boost parses chunk text and only reorders."""
import pytest

from app.services.rag.constraint_boost import (
    boost_entries,
    boost_location_evidence,
    parse_amount,
    prices_in,
    ratings_in,
)


def _e(doc, i):
    return {"doc": doc, "id": f"c{i}", "meta": {}, "dist": 0.3}


@pytest.mark.parametrize(
    "raw,value",
    [
        ("49,999", 49999),
        ("1,00,000", 100000),
        ("49.999", 49999),
        ("49,99", 49.99),
        ("1.299,00", 1299.0),
        ("499", 499),
        ("12.50", 12.5),
    ],
)
def test_parse_amount(raw, value):
    assert parse_amount(raw) == pytest.approx(value)


def test_prices_and_ratings_in_text():
    text = "Lenovo IdeaPad ₹54,990 (was Rs. 69,990) 4.3★ 1,234 Ratings, battery 8 hours"
    assert prices_in(text) == [54990, 69990]
    assert ratings_in(text) == [4.3]
    assert prices_in("Preis: 49,99 € inkl. MwSt.") == [49.99]
    assert ratings_in("Rated 4 out of 5") == [4.0]


def test_price_fit_moves_up_without_dropping():
    entries = [
        _e("Laptop A ₹89,990 premium", 0),
        _e("Laptop B ₹45,990 budget 4.1★", 1),
        _e("Shipping policy page", 2),
    ]
    out, info = boost_entries(entries, {"price_max": 50000})
    assert [e["id"] for e in out] == ["c1", "c2", "c0"]
    assert info["applied"] and info["matched"] == 1 and info["demoted"] == 1
    assert len(out) == len(entries)


def test_rating_and_entities():
    entries = [_e("Generic headphones 3.5★", 0), _e("Sony headphones 4.6★", 1)]
    out, _ = boost_entries(entries, {"rating_min": 4}, ["Sony"])
    assert out[0]["id"] == "c1"


def test_no_match_keeps_order():
    entries = [_e("no prices here", 0), _e("still none", 1)]
    out, info = boost_entries(entries, {"price_max": 100})
    assert out is entries and not info["applied"] and info["reason"] == "no_match"


def test_no_constraints_noop():
    entries = [_e("x", 0)]
    out, info = boost_entries(entries, {}, [])
    assert out is entries and info["reason"] == "no_constraints"


def test_stable_among_ties():
    entries = [_e("₹10,000 a", 0), _e("₹20,000 b", 1), _e("₹90,000 c", 2), _e("₹30,000 d", 3)]
    out, _ = boost_entries(entries, {"price_max": 40000})
    assert [e["id"] for e in out] == ["c0", "c1", "c3", "c2"]


def test_location_evidence_ranks_above_brand_only():
    entries = [
        _e("NITSAN is an AI consulting partner for businesses worldwide.", 0),
        _e("At 24, he co-founded NITSAN – a TYPO3 Agency in Bhavnagar, India.", 1),
        _e("Unrelated shipping policy with no brand.", 2),
    ]
    out, info = boost_location_evidence(entries, "where is nitsan?")
    assert [e["id"] for e in out] == ["c1", "c0", "c2"]
    assert info["applied"] and info["matched"] == 1
    assert len(out) == 3
    kept, noop = boost_location_evidence(entries, "what does nitsan do?")
    assert kept is entries and not noop["applied"]
