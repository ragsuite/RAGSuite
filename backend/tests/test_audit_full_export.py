"""Enterprise audit export honours list filters and full retention."""
from __future__ import annotations

import csv
import io
import json
import uuid
from datetime import datetime, timezone

import pytest

pytestmark = pytest.mark.ee

from ragsuite_modules.audit_full.backend import export_routes  # noqa: E402
from app.schemas import AuditEventActorOut, AuditEventOut  # noqa: E402


class _FakeQuery:
    def __init__(self, rows):
        self._rows = rows
        self.limit_value = None

    def order_by(self, *_args):
        return self

    def limit(self, value):
        self.limit_value = value
        return self

    def all(self):
        return self._rows


def _event(**overrides) -> AuditEventOut:
    base = dict(
        id=uuid.uuid4(),
        timestamp=datetime(2026, 9, 1, 12, 0, tzinfo=timezone.utc),
        project_name="Docs",
        actor_type="user",
        actor=AuditEventActorOut(id=7, username="arun", email="a@example.com"),
        event_type="project.update",
        category="project",
        severity="info",
        status="success",
        action="update",
        resource_type="project",
        resource_id="p-1",
        summary="Renamed, project",
        ip_address="10.0.0.1",
    )
    base.update(overrides)
    return AuditEventOut(**base)


@pytest.fixture
def patched(monkeypatch):
    rows = [object(), object()]
    events = [_event(), _event(actor=None, project_name=None, summary="Login")]
    calls: dict = {}
    fake_query = _FakeQuery(rows)

    def fake_build(db, user, project, **kwargs):
        calls["kwargs"] = kwargs
        return fake_query

    by_row = dict(zip(map(id, rows), events))
    monkeypatch.setattr(export_routes, "build_audit_events_query", fake_build)
    monkeypatch.setattr(export_routes, "load_audit_row_context", lambda db, r: {})
    monkeypatch.setattr(export_routes, "audit_event_out", lambda row, names: by_row[id(row)])
    return calls, fake_query, events


def _filters(**overrides) -> dict:
    base = dict(
        project_id=None,
        account_only=False,
        all_projects=True,
        q="rename",
        category="project",
        severity="info",
        status="success",
        event_type=None,
        start_date=None,
        end_date=None,
    )
    base.update(overrides)
    return base


async def _export(fmt: str, limit: int = 100):
    return await export_routes.export_audit_events(
        format=fmt, limit=limit, db=None, current_user=None, active_project=None, **_filters()
    )


@pytest.mark.asyncio
async def test_csv_export_forwards_filters_and_lifts_retention(patched):
    calls, fake_query, _ = patched
    response = await _export("csv", limit=100)

    assert calls["kwargs"] == {**_filters(), "retention_days": None}
    assert fake_query.limit_value == 100
    assert response.media_type.startswith("text/csv")
    disposition = response.headers["content-disposition"]
    assert disposition.startswith('attachment; filename="audit-logs-')
    assert disposition.endswith('.csv"')

    rows = list(csv.reader(io.StringIO(response.body.decode())))
    assert rows[0] == export_routes.CSV_COLUMNS
    assert rows[1][7] == "Renamed, project"
    assert rows[1][8] == "arun"
    assert rows[2][8] == ""
    assert rows[2][10] == ""


@pytest.mark.asyncio
async def test_json_export_returns_serialized_events_as_attachment(patched):
    _, _, events = patched
    response = await _export("json")

    assert response.headers["content-disposition"].endswith('.json"')
    payload = json.loads(response.body)
    assert [item["id"] for item in payload] == [str(e.id) for e in events]
    assert payload[0]["actor"]["username"] == "arun"
