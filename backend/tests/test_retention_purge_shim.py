"""Community retention: the purge job is a no-op and the migration seeds project policies safely."""
from __future__ import annotations

import importlib.util
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Organization, Project, ProjectRetentionPolicy, User
from app.services import retention_purge_service

MIGRATION = (
    Path(__file__).resolve().parents[1]
    / "alembic"
    / "versions"
    / "a7c3e9f1b2d4_add_project_retention_policies.py"
)


def _migration_module():
    spec = importlib.util.spec_from_file_location("project_retention_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_purge_skips_when_enterprise_locked():
    denial = {"enterprise_locked": True, "feature": "compliance", "message": "locked"}
    with patch("app.platform.ee_feature_gate.enterprise_feature_denial", return_value=denial):
        result = retention_purge_service.run_retention_purge()
    assert result == {"skipped": True, "reason": "enterprise_locked"}


def test_purge_skips_when_module_missing():
    with patch("app.platform.ee_feature_gate.enterprise_feature_denial", return_value=None), patch.dict(
        "sys.modules", {"ragsuite_modules.compliance.backend.purge": None}
    ):
        result = retention_purge_service.run_retention_purge()
    assert result == {"skipped": True, "reason": "module_unavailable"}


def test_compliance_lock_copy_mentions_unlimited_history():
    from app.platform.ee_feature_gate import enterprise_lock_message

    assert "without a time limit" in enterprise_lock_message("compliance")


@pytest.fixture()
def seeded_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = sessionmaker(bind=engine)()
    org = Organization(name="Org", slug="org", retention_auto_delete=True, retention_days=90)
    session.add(org)
    session.flush()
    owner = User(
        username="owner",
        email="owner@example.com",
        hashed_password="x" * 60,
        is_active=True,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(owner)
    session.flush()
    scoped = Project(name="Scoped", owner_id=owner.id, org_id=org.id)
    legacy = Project(name="Legacy", owner_id=owner.id, org_id=None)
    session.add_all([scoped, legacy])
    session.commit()
    yield session, org, scoped, legacy
    session.close()


def test_migration_seed_preserves_existing_purge_scope(seeded_db):
    db, _org, scoped, legacy = seeded_db
    seed_sql = _migration_module().SEED_FROM_ORG_POLICY

    db.execute(text(seed_sql))
    db.execute(text(seed_sql))
    db.commit()

    assert db.query(ProjectRetentionPolicy).count() == 2
    scoped_row = db.get(ProjectRetentionPolicy, scoped.id)
    legacy_row = db.get(ProjectRetentionPolicy, legacy.id)
    assert (scoped_row.auto_delete, scoped_row.retention_days) == (True, 90)
    assert (legacy_row.auto_delete, legacy_row.retention_days) == (False, 90)
