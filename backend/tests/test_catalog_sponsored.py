"""Sponsored cards repeating the item's own name are not taken for the buy box."""
from app.services.catalog.extract import extract_record

PAGE = """Home
/
Footwear
/
Men's Sports Shoes
/
Acme Strider Air Cushion Walking Shoes For Men
Key Highlights
Acme BOLTFLEX Running Shoes For Men
76%
2,399
₹577
AD
Acme Strider Air Cushion Walking Shoes For Men
77%
2,699
₹611
AD
Selected Color:
OFFWHITE
Visit brand store
Acme Strider Air Cushion Walking Sh...
more
4.2
Top Discount of the Sale
75%
2,699
₹687
Buy at ₹652
Apply offers for maximum savings"""


def test_sponsored_card_with_the_same_name_is_skipped():
    rec = extract_record("Acme Strider Air Cushion Walking Shoes For Men", PAGE, {})
    assert rec is not None and rec.price == 687.0


def test_truncated_heading_name_is_completed_from_the_title():
    title = "Acme Strider Air Cushion Walking Shoes For Men - Buy Acme Strider Online at Best Prices"
    page = PAGE.replace("Home\n/\nFootwear\n/\nMen's Sports Shoes\n/\nAcme Strider Air Cushion Walking Shoes For Men\n", "")
    rec = extract_record(title, page, {})
    assert rec is not None and rec.price == 687.0
    assert rec.name == "Acme Strider Air Cushion Walking Shoes For Men"


def test_name_right_after_another_cards_ad_label_still_anchors():
    page = PAGE.replace("Selected Color:\nOFFWHITE\nVisit brand store\n", "")
    rec = extract_record("Acme Strider Air Cushion Walking Shoes For Men", page, {})
    assert rec is not None and rec.price == 687.0


def test_brand_prefix_counts_words_not_tokens():
    from app.services.catalog.text_extract import _with_brand_prefix

    assert _with_brand_prefix("Pulse 2 FE (Blue, 64 GB)", "Ai+ Pulse 2 FE (Blue, 64 GB) (4 GB RAM)") == (
        "Ai+ Pulse 2 FE (Blue, 64 GB)"
    )
    assert _with_brand_prefix("One 5G (Blue)", "Mivi One 5G (Blue, 128 GB)") == "Mivi One 5G (Blue)"


def test_without_a_restating_line_the_buy_box_price_is_used():
    page = """Home
/
Clothing
/
Ethnic Sets
/
Women Pure Silk Kurta Sharara Dupatta Set
Key Highlights
Rival Women Pure Silk Kurta Pant Dupatta Set
76%
4,199
₹1,007
AD
Acme Women Pure Silk Kurta Sharara Dupatta Set
79%
3,999
₹826
AD
Selected Color:
Brown
Lowest Price Live
79%
3,999
₹826
Buy at ₹784
Similar Products
Rival Women Pure Silk Kurta Palazzo Dupatta Set
76% OFF
₹4,199
₹1,313"""
    rec = extract_record("Acme Women Kurta Sharara Dupatta Set - Buy Acme Women Kurta Sharara Dupatta Set Online", page, {})
    assert rec is not None and rec.price == 826.0 and "Rival" not in rec.name


def test_heading_variant_is_kept_in_the_name():
    from app.services.catalog.page_cards import with_variant

    assert with_variant("Acme Ebony Glass Gas Stove", "Acme Ebony Glass Gas Stove (4 Burners)") == (
        "Acme Ebony Glass Gas Stove (4 Burners)"
    )
    assert with_variant("Acme Ebony (Black)", "Acme Ebony (Black) (2 Burners)") == "Acme Ebony (Black)"
    assert with_variant("Acme Ebony", "Other line") == "Acme Ebony"
