from app.services.rag import chunk_context as cc


def test_url_breadcrumb_drops_language_ids_and_extensions():
    url = "https://www.mohn-gmbh.com/en/products/hygiene-technology/hand-cleaning/soap-dispenser.html"
    assert cc.url_breadcrumb(url) == ["products", "hygiene technology", "hand cleaning", "soap dispenser"]


def test_url_breadcrumb_handles_locale_and_product_ids():
    url = "https://shop.example.com/de-de/notebooks/warner-n95-notebook/p/itm4f9a2c71b3d8e?pid=1"
    assert cc.url_breadcrumb(url) == ["notebooks", "warner n95 notebook"]


def test_url_breadcrumb_ignores_non_http():
    assert cc.url_breadcrumb("file://report.pdf") == []
    assert cc.url_breadcrumb("") == []


def test_header_title_crumbs_section_deduplicated():
    meta = {
        "title": "Soap dispenser",
        "url": "https://x.com/en/products/hand-cleaning/soap-dispenser.html",
        "section": "Technical data",
    }
    assert cc.build_header(meta) == "Soap dispenser > products > hand cleaning > Technical data"


def test_header_prefers_explicit_breadcrumb_and_strips_upload_prefix():
    meta = {
        "title": "3f2b8c1e-1d2a-4c3b-9e8f-0a1b2c3d4e5f_Price list 2026",
        "breadcrumb": "Home > Catalogue > Hoists",
        "url": "https://x.com/ignored/path",
    }
    assert cc.build_header(meta) == "Price list 2026 > Home > Catalogue > Hoists"


def test_site_block_header_ignores_first_seen_page_url():
    meta = {
        "title": "Site header · www.mohn-gmbh.com",
        "url": "https://www.mohn-gmbh.com/unternehmen/service/ersatzteilservice/sole-master-dry.html",
        "content_kind": "site_header",
    }
    assert cc.is_site_block(meta) and not cc.is_site_block({"url": meta["url"]})
    assert cc.build_header(meta) == "Site header · www.mohn-gmbh.com"


def test_header_is_capped():
    meta = {"title": "word " * 80, "section": "s" * 300}
    header = cc.build_header(meta)
    assert len(header) <= cc.MAX_HEADER_CHARS


def test_embedding_text_keeps_chunk_and_adds_llm_context():
    meta = {"title": "Manual", "ctx_llm": "This passage covers installation."}
    assert cc.embedding_text("Step 1", meta) == "Manual\nThis passage covers installation.\nStep 1"
    assert cc.embedding_text("Step 1", None) == "Step 1"


def test_annotate_sets_header_and_version_without_mutating_input():
    metas = [{"title": "Alpha"}, {"title": "Beta", "ctx_llm": "ctx"}]
    out = cc.annotate(metas, 2)
    assert out[0]["ctx_header"] == "Alpha" and out[0]["chunk_ctx_v"] == cc.CHUNK_CONTEXT_VERSION
    assert out[1]["chunk_ctx_v"] == cc.CHUNK_CONTEXT_VERSION_LLM
    assert "ctx_header" not in metas[0]
    assert cc.annotate(None, 3) is None


def test_passage_line_uses_stored_header():
    assert cc.passage_line({"ctx_header": "Price list > Hoists"}) == "Page: Price list > Hoists\n"
    assert cc.passage_line({}) == ""
    assert cc.passage_line(None) == ""
