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
