"""Old-chain version rows move to the renamed IDs; every other database is left alone."""
from pathlib import Path

import pytest
from sqlalchemy import create_engine, text

from app import alembic_revision_remap as remap_mod

VERSIONS = Path(__file__).resolve().parents[1] / "alembic" / "versions"


def _db(versions, *, old_chain=True, upstream_chain=False):
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE alembic_version (version_num VARCHAR(32) PRIMARY KEY)"))
        for v in versions:
            conn.execute(text("INSERT INTO alembic_version VALUES (:v)"), {"v": v})
        cols = "id INTEGER" + (", workspace_permissions TEXT" if old_chain else "")
        conn.execute(text(f"CREATE TABLE organization_members ({cols})"))
        cols = "id INTEGER" + (", endpoint TEXT" if upstream_chain else "")
        conn.execute(text(f"CREATE TABLE project_model_providers ({cols})"))
    return engine


def _versions(engine):
    with engine.connect() as conn:
        return sorted(r[0] for r in conn.execute(text("SELECT version_num FROM alembic_version")))


def test_old_chain_head_moves_to_new_id_and_keeps_other_heads():
    engine = _db(["z6a7b8c9d0e1", "z8a9b0c1d2e3"])
    assert remap_mod.remap(engine) == [("z6a7b8c9d0e1", "f6b5d0a2c7e9")]
    assert _versions(engine) == ["f6b5d0a2c7e9", "z8a9b0c1d2e3"]
    assert remap_mod.remap(engine) == []


@pytest.mark.parametrize("old", sorted(remap_mod.RENAMED))
def test_every_old_id_maps_to_an_existing_migration(old):
    new = remap_mod.RENAMED[old]
    assert len(list(VERSIONS.glob(f"{new}_*.py"))) == 1
    engine = _db([old])
    remap_mod.remap(engine)
    assert _versions(engine) == [new]


def test_upstream_chain_database_is_untouched():
    engine = _db(["z6a7b8c9d0e1"], old_chain=True, upstream_chain=True)
    assert remap_mod.remap(engine) == []
    assert _versions(engine) == ["z6a7b8c9d0e1"]


def test_database_without_old_chain_column_is_untouched():
    engine = _db(["z6a7b8c9d0e1"], old_chain=False)
    assert remap_mod.remap(engine) == []
    assert _versions(engine) == ["z6a7b8c9d0e1"]


def test_already_present_new_id_drops_the_duplicate_row():
    engine = _db(["z6a7b8c9d0e1", "f6b5d0a2c7e9"])
    remap_mod.remap(engine)
    assert _versions(engine) == ["f6b5d0a2c7e9"]


def test_fresh_database_is_a_no_op():
    assert remap_mod.remap(create_engine("sqlite://")) == []


def test_alembic_revision_ids_are_unique():
    import re
    from collections import defaultdict

    by = defaultdict(list)
    for path in VERSIONS.glob("*.py"):
        text = path.read_text(encoding="utf-8", errors="ignore")
        match = re.search(r"^revision\s*[:=]\s*['\"]([^'\"]+)['\"]", text, re.M)
        if match:
            by[match.group(1)].append(path.name)
    dups = {rev: files for rev, files in by.items() if len(files) > 1}
    assert not dups, f"duplicate Alembic revision IDs: {dups}"
