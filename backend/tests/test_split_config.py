from app.services.rag.split_config import (
    SplitConfigError,
    chunk_text_custom,
    parse_split_config,
    validate_split_fields,
)
from app.services.rag.chunk_profiles import profile_for_source
from app.services.rag.utils_rag import chunk_text, chunks_for_crawled_document


def test_docling_reading_is_uncoupled_from_native_split():
    assert parse_split_config({"extract_engine": "docling"}) is None
    assert parse_split_config({"split_config": {"mode": "native"}, "extract_engine": "docling"}) is None


def test_missing_split_config_is_native():
    assert parse_split_config(None) is None
    assert parse_split_config({}) is None
    assert parse_split_config({"mode": "native"}) is None
    assert parse_split_config({"split_config": {"mode": "native"}}) is None
    assert validate_split_fields(split_mode=None) is None
    assert validate_split_fields(split_mode="native") is None


def test_native_crawled_html_unchanged_with_none_split_config():
    text = "Intro sentence.\nRAM: 8 GB\nColour: Blue\nWarranty: 1 Year\nClosing words."
    expected = chunks_for_crawled_document("https://x.test/p.html", text)
    assert chunks_for_crawled_document("https://x.test/p.html", text, split_config=None) == expected
    assert chunks_for_crawled_document("https://x.test/p.html", text, split_config={}) == expected


def test_custom_paragraph_packs_800_200():
    para_a = "A" * 500
    para_b = "B" * 500
    text = f"{para_a}\n\n{para_b}"
    chunks = chunk_text_custom(text, 800, 200, "\n\n")
    assert len(chunks) >= 2
    assert "\n\n" in chunks[0] or chunks[0].startswith("A")
    joined = "".join(chunks)
    assert "A" * 50 in joined and "B" * 50 in joined


def test_custom_delimiter_triple_pipe():
    text = "one|||two|||three"
    chunks = chunk_text_custom(text, 8, 0, "|||")
    assert chunks == ["one|||", "two|||", "three"]
    packed = chunk_text_custom(text, 400, 0, "|||")
    assert packed == ["one|||two|||three"]


def test_validate_custom_fields_and_errors():
    stored = validate_split_fields(
        split_mode="custom",
        chunk_size=800,
        chunk_overlap=200,
        delimiter_preset="paragraph",
    )
    assert stored["mode"] == "custom"
    assert stored["delimiter_preset"] == "paragraph"
    cfg = parse_split_config(stored)
    assert cfg is not None and cfg.delimiter == "\n\n"

    stored_custom = validate_split_fields(
        split_mode="custom",
        chunk_size=800,
        chunk_overlap=200,
        delimiter_preset="custom",
        delimiter_custom="|||",
    )
    assert parse_split_config(stored_custom).delimiter == "|||"

    try:
        validate_split_fields(split_mode="custom", chunk_size=50, chunk_overlap=10, delimiter_preset="sentence")
        raise AssertionError("expected SplitConfigError")
    except SplitConfigError:
        pass


def test_invalid_custom_parses_as_native():
    assert parse_split_config({"mode": "custom", "chunk_size": 10, "chunk_overlap": 0, "delimiter_preset": "paragraph"}) is None


def test_profile_for_source_unchanged():
    assert profile_for_source(filename="manual.pdf") == "pdf_manual"
    text = "Hello world. " * 20
    assert chunk_text(text, 1200) == chunk_text(text, 1200)


def test_custom_crawled_skips_table_packing():
    rows = [f"Model: X{i:03d}; Price: {1000 + i}" for i in range(80)]
    text = "\n".join(["Intro.", "Price list"] + rows)
    custom = {
        "mode": "custom",
        "chunk_size": 800,
        "chunk_overlap": 200,
        "delimiter_preset": "paragraph",
    }
    custom_chunks = chunks_for_crawled_document("https://x.test/p.html", text, split_config=custom)
    native_chunks = chunks_for_crawled_document("https://x.test/p.html", text)
    assert custom_chunks
    assert custom_chunks != native_chunks


def test_job_payload_without_split_config_stays_native():
    from app.services.rag.split_config import snapshot_split_config

    assert snapshot_split_config(None) is None
    assert snapshot_split_config({}) is None
    text = "Intro sentence.\nRAM: 8 GB\nColour: Blue"
    assert chunks_for_crawled_document("https://x.test/p.html", text, split_config=None) == chunks_for_crawled_document(
        "https://x.test/p.html", text
    )
