"""Top K and the reranker toggle apply project-wide, whichever admin saves them."""
from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.models import Base, ChatbotSettings, Project, SearchSettings, User
from app.schemas import RagQuery
from app.services import project_retrieval_settings_sync as sync
from app.services.chat_execution_snapshot import _reranker_status, build_execution_snapshot
from app.services.search_run_context import merge_search_rag_params

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "b2d1f6c8e3a5_project_wide_retrieval_settings.py"
)


@pytest.fixture()
def engine():
    eng = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(eng)
    return eng


@pytest.fixture()
def db(engine):
    session = sessionmaker(bind=engine)()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def project(db):
    owner = User(username="owner", email="owner@example.com", hashed_password="x" * 60)
    member = User(username="member", email="member@example.com", hashed_password="x" * 60)
    db.add_all([owner, member])
    db.flush()
    proj = Project(name="Main", owner_id=owner.id)
    db.add(proj)
    db.commit()
    proj.member_id = member.id
    return proj


def _chat_rows(db, project, *, owner=(8, False), member=(8, True)):
    owner_row = ChatbotSettings(
        user_id=project.owner_id, project_id=project.id, chat_top_k=owner[0], chat_use_reranker=owner[1],
        chat_similarity_threshold=0.3,
    )
    member_row = ChatbotSettings(
        user_id=project.member_id, project_id=project.id, chat_top_k=member[0], chat_use_reranker=member[1],
        chat_similarity_threshold=0.45,
    )
    db.add_all([owner_row, member_row])
    db.commit()
    return owner_row, member_row


def _search_rows(db, project, *, owner=(5, False), member=(5, True)):
    owner_row = SearchSettings(
        user_id=project.owner_id, project_id=project.id, search_top_k=owner[0], search_use_reranker=owner[1],
    )
    member_row = SearchSettings(
        user_id=project.member_id, project_id=project.id, search_top_k=member[0], search_use_reranker=member[1],
    )
    db.add_all([owner_row, member_row])
    db.commit()
    return owner_row, member_row


def test_touches_retrieval_settings_only_for_top_k_and_reranker():
    assert sync.touches_retrieval_settings("chat", {"chat_use_reranker": True})
    assert sync.touches_retrieval_settings("search", {"search_top_k": 7})
    assert not sync.touches_retrieval_settings("chat", {"chat_similarity_threshold": 0.3, "search_top_k": 3})


def test_member_save_reaches_owner_row_and_keeps_model_tuning(db, project):
    owner_row, member_row = _chat_rows(db, project)
    member_row.chat_top_k = 12
    member_row.chat_use_reranker = True
    db.commit()

    assert sync.propagate_retrieval_settings(db, project.id, "chat", member_row) == 1
    db.refresh(owner_row)
    assert (owner_row.chat_top_k, owner_row.chat_use_reranker) == (12, True)
    assert owner_row.chat_similarity_threshold == 0.3


def test_propagation_is_noop_when_rows_already_agree(db, project):
    _owner_row, member_row = _chat_rows(db, project, owner=(8, True), member=(8, True))
    assert sync.propagate_retrieval_settings(db, project.id, "chat", member_row) == 0


def test_search_propagation_and_canonical_row_is_owner(db, project):
    owner_row, member_row = _search_rows(db, project)
    assert sync.canonical_retrieval_row(db, project.id, "search").id == owner_row.id

    member_row.search_use_reranker = False
    member_row.search_top_k = 9
    db.commit()
    sync.propagate_retrieval_settings(db, project.id, "search", member_row)
    db.refresh(owner_row)
    assert (owner_row.search_top_k, owner_row.search_use_reranker) == (9, False)


def test_chat_config_out_shows_what_chat_runs(db, project):
    from app.routes.chat_models import _chatbot_settings_to_chat_config_out

    _owner_row, member_row = _chat_rows(db, project, owner=(6, False), member=(10, True))
    out = _chatbot_settings_to_chat_config_out(member_row, db=db)
    assert (out["chat_top_k"], out["chat_use_reranker"]) == (6, False)
    assert out["chat_similarity_threshold"] == 0.45


def test_chat_config_out_fills_runtime_defaults_for_null_values(db, project):
    from app.routes.chat_models import _chatbot_settings_to_chat_config_out

    owner_row, _member_row = _chat_rows(db, project)
    owner_row.chat_top_k = None
    owner_row.chat_use_reranker = None
    db.commit()
    out = _chatbot_settings_to_chat_config_out(owner_row, db=db)
    assert (out["chat_top_k"], out["chat_use_reranker"]) == (sync.DEFAULT_CHAT_TOP_K, False)


def test_search_config_out_shows_what_the_widget_runs(db, project):
    from app.routes.search_models import _search_settings_to_llm_config_out

    _owner_row, member_row = _search_rows(db, project, owner=(4, False), member=(8, True))
    out = _search_settings_to_llm_config_out(member_row, db=db)
    assert (out["search_top_k"], out["search_use_reranker"]) == (4, False)


def test_saved_search_params_use_canonical_top_k_and_reranker(db, project):
    owner_row, member_row = _search_rows(db, project, owner=(4, True), member=(8, False))
    member_row.search_similarity_threshold = 0.4
    req = RagQuery(query="q", use_saved_rag_params=True)

    top_k, threshold, reranker = merge_search_rag_params(
        req, member_row, auth_type="user", retrieval_settings=owner_row
    )
    assert (top_k, threshold, reranker) == (4, 0.4, True)
    assert merge_search_rag_params(req, member_row, auth_type="user")[::2] == (8, False)


def test_request_params_win_when_saved_params_are_not_requested(db, project):
    owner_row, member_row = _search_rows(db, project)
    req = RagQuery(query="q", topK=3, useReranker=True)
    assert merge_search_rag_params(req, member_row, auth_type="user", retrieval_settings=owner_row) == (3, 0.2, True)


def test_any_reranker_enabled(db, project):
    assert not sync.any_reranker_enabled(db)
    _chat_rows(db, project, owner=(8, False), member=(8, False))
    assert not sync.any_reranker_enabled(db)
    _search_rows(db, project, owner=(5, False), member=(5, True))
    assert sync.any_reranker_enabled(db)


def _load_migration():
    spec = importlib.util.spec_from_file_location("project_wide_retrieval_settings_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_aligns_rows_to_owner_values(engine, db, project):
    owner_row, member_row = _chat_rows(db, project, owner=(6, False), member=(12, True))
    s_owner, s_member = _search_rows(db, project, owner=(4, True), member=(9, False))
    orphan = Project(name="No owner row", owner_id=project.owner_id)
    db.add(orphan)
    db.flush()
    orphan_row = ChatbotSettings(user_id=project.member_id, project_id=orphan.id, chat_top_k=15, chat_use_reranker=True)
    db.add(orphan_row)
    db.commit()

    migration = _load_migration()
    with engine.begin() as conn:
        for table, (top_k, reranker) in migration._TABLES.items():
            migration._align(conn, table, top_k, reranker)
    db.expire_all()

    assert (member_row.chat_top_k, member_row.chat_use_reranker) == (6, False)
    assert (owner_row.chat_top_k, owner_row.chat_use_reranker) == (6, False)
    assert (s_member.search_top_k, s_member.search_use_reranker) == (4, True)
    assert (orphan_row.chat_top_k, orphan_row.chat_use_reranker) == (15, True)


@pytest.mark.parametrize(
    ("use_reranker", "meta", "expected"),
    [
        (False, {"reranked": True}, "off"),
        (True, {"reranked": True}, "applied"),
        (True, {"reranked": False, "rerank_skipped_reason": "clear_top1"}, "skipped (clear_top1)"),
        (True, {}, None),
    ],
)
def test_reranker_status(use_reranker, meta, expected):
    assert _reranker_status(use_reranker, meta) == expected


def test_reranker_status_added_to_ee_snapshot(monkeypatch):
    names = (
        "ragsuite_modules",
        "ragsuite_modules.query_tracing",
        "ragsuite_modules.query_tracing.backend",
        "ragsuite_modules.query_tracing.backend.snapshot",
    )
    for name in names:
        monkeypatch.setitem(sys.modules, name, types.ModuleType(name))
    sys.modules[names[-1]].build_execution_snapshot = lambda **_: {"runtime_params": {"use_reranker": True}}

    snap = build_execution_snapshot(
        effective_rag_params={"use_reranker": True},
        retrieval_meta={"reranked": True},
    )
    assert snap["runtime_params"]["reranker_status"] == "applied"


def test_reranker_warmup_only_loads_model_when_a_project_uses_it(engine, db, project, monkeypatch):
    from app.platform import app_factory, db as platform_db
    from app.services.rag import singleton

    loads = []
    monkeypatch.setattr(platform_db, "SessionLocal", sessionmaker(bind=engine))
    monkeypatch.setattr(singleton, "get_cross_encoder", lambda: loads.append(1) or object())

    _chat_rows(db, project, owner=(8, False), member=(8, False))
    app_factory._warmup_reranker()
    assert loads == []

    db.query(ChatbotSettings).update({ChatbotSettings.chat_use_reranker: True})
    db.commit()
    app_factory._warmup_reranker()
    assert loads == [1]
