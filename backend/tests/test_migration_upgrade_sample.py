"""Phase 13 — sample DB upgrade preserves users/projects (no reinstall / data loss)."""
from __future__ import annotations

import os
import subprocess
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from sqlalchemy import create_engine, select, text
from sqlalchemy.orm import sessionmaker

from app.models import Base, Organization, Project, User


@pytest.fixture()
def memory_db():
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session, engine
    session.close()
    engine.dispose()


def test_sample_schema_reapply_preserves_users_projects(memory_db):
    """Simulate in-place upgrade: schema apply → insert → re-apply → rows remain."""
    session, engine = memory_db

    org = Organization(name="MigrateCo", slug="migrate-co")
    session.add(org)
    session.flush()

    user = User(
        username="migrate_user",
        email="migrate@example.com",
        hashed_password="x" * 60,
        is_active=True,
        is_admin=False,
        org_id=org.id,
        email_verified_at=datetime.now(timezone.utc),
    )
    session.add(user)
    session.flush()

    project = Project(
        id=uuid.uuid4(),
        name="Keep Me",
        description="must survive upgrade",
        owner_id=user.id,
        org_id=org.id,
        is_active=True,
    )
    session.add(project)
    session.commit()

    user_id = user.id
    user_email = user.email
    project_id = project.id
    project_name = project.name

    # Idempotent schema re-apply (proxy for alembic upgrade head on already-migrated DB)
    Base.metadata.create_all(engine)
    session.expire_all()

    u2 = session.execute(select(User).where(User.id == user_id)).scalar_one()
    p2 = session.execute(select(Project).where(Project.id == project_id)).scalar_one()
    assert u2.email == user_email
    assert u2.username == "migrate_user"
    assert p2.name == project_name
    assert p2.owner_id == user_id


def _run_live_alembic_sample() -> bool:
    url = (os.environ.get("DATABASE_URL") or "").strip()
    return url.startswith("postgresql") and os.environ.get("RAGSUITE_MIGRATION_SAMPLE") == "1"


@pytest.mark.skipif(
    not _run_live_alembic_sample(),
    reason="Opt-in: DATABASE_URL=postgresql://... and RAGSUITE_MIGRATION_SAMPLE=1",
)
def test_alembic_upgrade_head_idempotent_preserves_sample_rows():
    """Against real Postgres: upgrade head twice; inserted users/projects remain."""
    db_url = os.environ["DATABASE_URL"]
    backend = Path(__file__).resolve().parents[1]
    env = {**os.environ, "DATABASE_URL": db_url}
    alembic_bin = os.environ.get("PYTEST_ALEMBIC_BIN") or str(backend / ".venv" / "bin" / "alembic")
    if not Path(alembic_bin).is_file():
        alembic_bin = "alembic"

    def alembic(*args: str) -> None:
        proc = subprocess.run(
            [alembic_bin, *args],
            cwd=str(backend),
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        if proc.returncode != 0:
            raise AssertionError(
                f"alembic {' '.join(args)} failed:\n{proc.stdout}\n{proc.stderr}"
            )

    alembic("upgrade", "head")

    engine = create_engine(db_url)
    Session = sessionmaker(bind=engine)
    session = Session()
    marker = f"p13_{uuid.uuid4().hex[:10]}"
    user = None
    project = None
    try:
        user = User(
            username=marker,
            email=f"{marker}@example.com",
            hashed_password="x" * 60,
            is_active=True,
            is_admin=False,
            is_2fa_enabled=False,
            email_2fa_enabled=False,
            email_verified_at=datetime.now(timezone.utc),
        )
        # Set common NOT NULL flags if present on the mapped class
        if hasattr(User, "must_change_password"):
            setattr(user, "must_change_password", False)
        session.add(user)
        session.flush()
        project = Project(
            id=uuid.uuid4(),
            name=f"proj-{marker}",
            description="phase13",
            owner_id=user.id,
            is_active=True,
        )
        session.add(project)
        session.commit()
        user_id = user.id
        project_id = project.id

        alembic("upgrade", "head")

        session.close()
        session = Session()
        u2 = session.execute(select(User).where(User.id == user_id)).scalar_one()
        p2 = session.execute(select(Project).where(Project.id == project_id)).scalar_one()
        assert u2.email == f"{marker}@example.com"
        assert p2.name == f"proj-{marker}"
    finally:
        try:
            session.rollback()
            if project is not None:
                session.execute(
                    text("DELETE FROM projects WHERE name = :n"), {"n": f"proj-{marker}"}
                )
            if user is not None:
                session.execute(text("DELETE FROM users WHERE username = :u"), {"u": marker})
            session.commit()
        except Exception:
            session.rollback()
        session.close()
        engine.dispose()
