"""Table-aware chunking: large tables split by whole rows with their heading repeated."""
from app.services.rag.table_chunks import chunk_with_tables, split_segments
from app.services.rag.utils_rag import chunk_text, chunks_for_crawled_document


def _rows(n: int) -> list:
    return [f"Model: X{i:03d}; Price: {1000 + i}; Storage: {i} GB" for i in range(n)]


def test_pages_without_large_tables_chunk_as_before():
    text = "Intro sentence.\nRAM: 8 GB\nColour: Blue\nWarranty: 1 Year\nClosing words."
    assert chunks_for_crawled_document("https://x.test/p.html", text) == chunk_text(text, 1400)


def test_large_table_is_packed_by_rows_with_heading():
    text = "\n".join(["Some prose about the range.", "Price list"] + _rows(80) + ["After the table."])
    chunks = chunk_with_tables(text, 600, chunk_text)
    table_chunks = [c for c in chunks if "Model: X" in c]
    assert len(table_chunks) > 1
    for chunk in table_chunks:
        assert chunk.startswith("Price list\n")
        assert all(line == "Price list" or line.startswith("Model: X") for line in chunk.split("\n"))
        assert len(chunk) <= 600
    rows_seen = [line for c in table_chunks for line in c.split("\n") if line.startswith("Model")]
    assert rows_seen == _rows(80)
    assert any("After the table." in c for c in chunks)


def test_short_row_runs_stay_prose():
    segments = split_segments(["Note: one", "Text line", "a | b", "c | d"])
    assert all(not is_table for is_table, _ in segments)


def test_long_heading_is_not_repeated():
    heading = "A very long paragraph line that reads like prose rather than a heading " * 2
    text = "\n".join([heading] + _rows(80))
    chunks = chunk_with_tables(text, 600, chunk_text)
    assert all(not c.startswith("Model") or heading.strip() not in c for c in chunks[1:])
