"""Record evidence, cross-URL duplicate collapse, answer guards and chat item memory."""
from __future__ import annotations

import asyncio
import uuid
from types import SimpleNamespace

from app.services import chat_item_memory
from app.services.catalog.answer_context import ItemContext
from app.services.catalog.index import CatalogIndex, _entry
from app.services.catalog.query import run
from app.services.chat_topic_memory import MEMORY_KEY
from app.services.rag import hybrid_fusion, item_answers, record_evidence


def _row(name, brand, category, price):
    return SimpleNamespace(
        document_id=uuid.uuid4(), url="https://shop.example/x", name=name, brand=brand, category=category,
        category_path=["Home", category], price=price, list_price=None, currency="INR", availability=None,
        attributes={}, variant_group=None, source_id="s1", identifiers=[],
    )


def _context(query: str) -> ItemContext:
    index = CatalogIndex([
        _entry(_row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499)),
        _entry(_row("Clearflow RO Water Purifier", "Clearflow", "Water Purifiers", 8999)),
    ])
    return ItemContext(run(index, query))


class _Collection:
    def __init__(self, rows):
        self.rows = rows
        self.where = None

    def get(self, where=None, limit=None, include=None):
        self.where = where
        return {
            "documents": [r[0] for r in self.rows],
            "metadatas": [r[1] for r in self.rows],
            "embeddings": [r[2] for r in self.rows],
        }


def test_record_evidence_picks_chunk_with_record_values():
    coll = _Collection([
        ("Header and offers", {"document_id": "d1", "chunk_index": 0}, [1.0, 0.0]),
        ("Aquapure UV ₹5,499 in stock", {"document_id": "d1", "chunk_index": 1}, [0.0, 1.0]),
        ("Other page", {"document_id": "d2", "chunk_index": 0}, [1.0, 0.0]),
    ])
    vdb = SimpleNamespace(get_collection=lambda name: coll)
    entries = record_evidence.fetch_entries(
        vdb, [("d1", ["Aquapure UV", "5,499"]), ("d2", [])], collection_name="c", project_id="p", user_id=None,
    )
    assert [e["doc"] for e in entries] == ["Aquapure UV ₹5,499 in stock", "Other page"]
    assert coll.where == {"$and": [{"document_id": {"$in": ["d1", "d2"]}}, {"project_id": "p"}]}
    entries = record_evidence.apply_query_vector(entries, [0.0, 1.0])
    assert entries[0]["dist"] <= record_evidence.RECORD_MAX_DISTANCE and "emb" not in entries[0]
    assert entries[1]["dist"] == record_evidence.RECORD_MAX_DISTANCE


def test_near_identical_pages_on_different_urls_collapse():
    body = "Acme Nova 5G Blue 128 GB price 13999 six GB RAM big battery fast charging display"
    entries = [
        {"doc": body, "id": "a", "meta": {"url": "https://shop.example/a?x=1"}, "dist": 0.2},
        {"doc": body + " offer", "id": "b", "meta": {"url": "https://shop.example/b"}, "dist": 0.21},
        {"doc": "Completely different text about fans", "id": "c", "meta": {"url": "https://shop.example/c"}, "dist": 0.3},
    ]
    docs, _ids, _metas, _dists = hybrid_fusion.dedupe_preserving_order(entries, lambda d, m: m["url"], 5)
    assert len(docs) == 2 and docs[1].startswith("Completely")
    assert not hybrid_fusion.NearDuplicateBodies().seen("short text")


def test_records_block_leads_prompt_context():
    ctx = _context("lowest priced water purifier")
    metas = [{"document_id": ctx.rows[0].document_id}]
    text = item_answers.context_with_records(ctx, "[S1]\npassage", metas)
    assert text.startswith("ITEM RECORDS") and "PAGE PASSAGES:\n[S1]" in text
    assert item_answers.context_with_records(None, "x", metas) == "x"


def test_refusal_with_rows_becomes_record_answer():
    ctx = _context("lowest priced water purifier")
    meta: dict = {}
    metas = [{"document_id": ctx.rows[0].document_id}]
    text, used = item_answers.guard_answer(ctx, "QUERY_OUT_OF_CONTEXT", metas, refused=True, retrieval_meta=meta)
    assert "Aquapure UV Water Purifier" in text and used == [1]
    assert meta["item_records"]["guard"] == "refused"
    assert item_answers.guard_answer(
        ctx, "The Aquapure UV Water Purifier is ₹5,499.", metas, refused=False, retrieval_meta=meta
    ) is None
    assert item_answers.guard_answer(None, "x", metas, refused=True, retrieval_meta=meta) is None


def test_item_memory_round_trip(monkeypatch):
    from app.services.catalog import service

    index = CatalogIndex([
        _entry(_row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499)),
        _entry(_row("Clearflow RO Water Purifier", "Clearflow", "Water Purifiers", 8999)),
    ])
    monkeypatch.setattr(service, "project_index", lambda db, pid: index)
    monkeypatch.setattr(service, "_schedule_backfill", lambda db, pid: None)
    ctx = ItemContext(run(index, "lowest priced water purifier"))
    turn = {"type": "assistant", "content": "...", MEMORY_KEY: ["water purifier"]}
    chat_item_memory.apply_to_turn(turn, ctx)
    assert turn[chat_item_memory.ITEMS_KEY] == ["Aquapure UV Water Purifier"]
    assert turn[MEMORY_KEY][0] == "Aquapure UV Water Purifier"
    assert chat_item_memory.last_scope([turn]).categories == ["Water Purifiers"]

    resolution = SimpleNamespace(
        rag_query="warranty of the cheapest mixer", reason="contextualized", is_ambiguous=False, processed_query=None,
    )
    item = chat_item_memory.resolve_item_context(None, "p", resolution, [turn], "what is its warranty")
    assert item.rag_query == "what is its warranty Aquapure UV Water Purifier"
    assert item.context.rows[0].name == "Aquapure UV Water Purifier"

    ambiguous = SimpleNamespace(rag_query="which is the most expensive?", reason="deterministic_ambiguity",
                                is_ambiguous=True, processed_query=None)
    item = chat_item_memory.resolve_item_context(None, "p", ambiguous, [turn], "which is the most expensive?")
    assert item.context.rows[0].name == "Clearflow RO Water Purifier" and not ambiguous.is_ambiguous

    llm_calls = []

    async def llm_rewrite(msg, hist, **ctx):
        llm_calls.append(msg)
        return msg, False

    turn_ctx = chat_item_memory.ItemTurn(None, "p", [turn], "who sells it?")
    rewritten, ambiguous = asyncio.run(turn_ctx.contextualizer(llm_rewrite)("who sells it?", []))
    assert rewritten == "who sells it? Aquapure UV Water Purifier" and not ambiguous and llm_calls == []
    done = turn_ctx.resolve(SimpleNamespace(rag_query=rewritten, reason="contextualized", is_ambiguous=False))
    assert done.context.rows[0].name == "Aquapure UV Water Purifier" and done.rag_query is None

    plain = SimpleNamespace(rag_query="hello", reason="standalone", is_ambiguous=False, processed_query="pq")
    item = chat_item_memory.resolve_item_context(None, "p", plain, [turn], "hello")
    assert item.context is None and item.query_for(plain) == "hello" and item.processed_for(plain) == "pq"


def test_self_contained_reply_survives_a_rewrite_with_unknown_anchor(monkeypatch):
    from app.services.catalog import service

    index = CatalogIndex([
        _entry(_row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499)),
        _entry(_row("Clearflow RO Water Purifier", "Clearflow", "Water Purifiers", 8999)),
    ])
    monkeypatch.setattr(service, "project_index", lambda db, pid: index)
    monkeypatch.setattr(service, "_schedule_backfill", lambda db, pid: None)
    message = "ok, show me water purifiers under 6000"
    resolution = SimpleNamespace(rag_query="Zenvo 3310 water purifiers under 6000", reason="reply_resolved",
                                 is_ambiguous=False, processed_query=None)
    item = chat_item_memory.resolve_item_context(None, "p", resolution, [], message)
    assert item.rag_query == message
    assert [r.name for r in item.context.rows] == ["Aquapure UV Water Purifier"]


def test_whole_brand_listing_drops_the_previous_category(monkeypatch):
    from app.services.catalog import service

    index = CatalogIndex([
        _entry(_row("Aquapure UV Water Purifier", "Aquapure", "Water Purifiers", 5499)),
        _entry(_row("Aquapure Max Mixer Grinder", "Aquapure", "Mixer Grinders", 3999)),
        _entry(_row("Clearflow RO Water Purifier", "Clearflow", "Water Purifiers", 8999)),
    ])
    monkeypatch.setattr(service, "project_index", lambda db, pid: index)
    monkeypatch.setattr(service, "_schedule_backfill", lambda db, pid: None)
    turn = {"type": "assistant", "content": "..."}
    chat_item_memory.apply_to_turn(turn, ItemContext(run(index, "water purifier brands")))
    message = "please share the list of products from Aquapure"
    resolution = SimpleNamespace(rag_query="list of Aquapure water purifiers", reason="contextualized",
                                 is_ambiguous=False, processed_query=None)
    item = chat_item_memory.resolve_item_context(None, "p", resolution, [turn], message)
    assert item.rag_query == message
    assert {r.name for r in item.context.rows} == {"Aquapure UV Water Purifier", "Aquapure Max Mixer Grinder"}


def test_item_name_words_do_not_trip_query_guards():
    index = CatalogIndex([_entry(_row("Harper The Secret Garden", "Harper", "Books", 233))])
    ctx = ItemContext(run(index, "price of harper the secret garden"))
    assert "secret" not in item_answers.outside_item_names(ctx, "What is the price of Harper The Secret Garden?").lower()
    assert "pin" in item_answers.outside_item_names(ctx, "secret pin of harper the secret garden")
    assert item_answers.outside_item_names(None, "my secret") == "my secret"
