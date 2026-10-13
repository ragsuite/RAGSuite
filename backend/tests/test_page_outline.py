from app.services.page_outline import heading_anchors, sections_for_page

TEXT = (
    "Lifting devices\nIntro about our company and lifting.\n"
    "Technical data\nLoad 250 kg, height 1200 mm.\n"
    "Accessories\nHooks, chains and spare parts."
)


def test_heading_anchors_in_reading_order_and_whitespace_tolerant():
    anchors = heading_anchors(TEXT, ["Lifting  devices", "Technical data", "Missing heading", "Accessories"])
    assert [label for _, label in anchors] == ["Lifting devices", "Technical data", "Accessories"]
    assert anchors[0][0] < anchors[1][0] < anchors[2][0]


def test_sections_map_each_chunk_to_preceding_heading():
    chunks = [
        "Lifting devices\nIntro about our company and lifting.",
        "Technical data\nLoad 250 kg, height 1200 mm.",
        "Accessories\nHooks, chains and spare parts.",
    ]
    assert sections_for_page(TEXT, chunks, ["Lifting devices", "Technical data", "Accessories"]) == [
        "Lifting devices",
        "Technical data",
        "Accessories",
    ]


def test_no_outline_gives_empty_sections():
    assert sections_for_page(TEXT, ["a", "b"], None) == ["", ""]
    assert sections_for_page(TEXT, ["a"], []) == [""]


def test_chunk_before_first_heading_has_no_section():
    text = "Preface text that is long enough.\nChapter one\nBody of chapter one."
    chunks = ["Preface text that is long enough.", "Chapter one\nBody of chapter one."]
    assert sections_for_page(text, chunks, ["Chapter one"]) == ["", "Chapter one"]
