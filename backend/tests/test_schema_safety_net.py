"""Entrypoint column safety net must not take table locks for columns that already exist."""
from unittest.mock import MagicMock

from app import schema_safety_net as ssn


def test_missing_columns_skips_existing():
    existing = {(table, column) for table, column, _ddl in ssn.COLUMNS[1:]}
    assert ssn.missing_columns(existing) == [ssn.COLUMNS[0]]


def test_main_issues_no_ddl_when_schema_is_complete(monkeypatch):
    monkeypatch.setattr(ssn, "_existing_columns", lambda: {(t, c) for t, c, _ in ssn.COLUMNS})
    monkeypatch.setattr(ssn, "backfill_org_branding", lambda: None)
    engine = MagicMock()
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.main()
    engine.begin.assert_not_called()


def test_main_caps_lock_wait_and_continues_after_failure(monkeypatch):
    monkeypatch.setattr(ssn, "_existing_columns", lambda: set())
    monkeypatch.setattr(ssn, "backfill_org_branding", lambda: None)
    statements = []
    conn = MagicMock()

    def execute(stmt):
        statements.append(str(stmt))
        if "ALTER TABLE chatbot_settings ADD COLUMN IF NOT EXISTS store_history_enabled" in str(stmt):
            raise RuntimeError("lock timeout")

    conn.execute.side_effect = execute
    engine = MagicMock()
    engine.begin.return_value.__enter__.return_value = conn
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.main()
    assert engine.begin.call_count == len(ssn.COLUMNS)
    assert sum("lock_timeout" in s for s in statements) == len(ssn.COLUMNS)
    assert sum(s.startswith("ALTER TABLE") for s in statements) == len(ssn.COLUMNS)


def test_branding_backfill_failure_never_blocks_boot(monkeypatch, capsys):
    engine = MagicMock()
    engine.begin.side_effect = RuntimeError("organizations missing")
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.backfill_org_branding()
    assert "org branding backfill skipped" in capsys.readouterr().out


def _vector_engine(present):
    conn = MagicMock()
    conn.dialect.name = "postgresql"
    conn.execute.return_value.scalar.return_value = present
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value = conn
    engine.begin.return_value.__enter__.return_value = conn
    return engine, conn


def test_vector_schema_is_left_alone_when_present(monkeypatch):
    engine, _conn = _vector_engine(present=True)
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.ensure_vector_store_schema()
    engine.begin.assert_not_called()


def test_vector_schema_is_created_with_capped_lock_wait_when_missing(monkeypatch):
    engine, conn = _vector_engine(present=False)
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.ensure_vector_store_schema()
    engine.begin.assert_called_once()
    statements = [str(c.args[0]) for c in conn.execute.call_args_list]
    assert any("lock_timeout" in s for s in statements)
    assert any("CREATE EXTENSION IF NOT EXISTS vector" in s for s in statements)


def test_vector_schema_failure_never_blocks_boot(monkeypatch, capsys):
    engine = MagicMock()
    engine.connect.side_effect = RuntimeError("db down")
    monkeypatch.setattr(ssn, "engine", engine)
    ssn.ensure_vector_store_schema()
    assert "vector store schema ensure skipped" in capsys.readouterr().out
