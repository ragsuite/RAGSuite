"""Start-up repair for databases stamped with the old IDs of six renamed migrations.

The migrations now named ``a1c0e5b7d2f4`` … ``f6b5d0a2c7e9`` first ran under the IDs
``u1v2w3x4y5z6`` … ``z6a7b8c9d0e1``, which upstream later gave to a different chain
(Azure endpoint, org branding, multi-provider SSO). A database is on the old chain when it
has that chain's first column (``organization_members.workspace_permissions``) and lacks the
upstream chain's first column (``project_model_providers.endpoint``, from ``t0u1v2w3x4y5``,
an ancestor of every upstream ID). Only then is its version row moved to the new ID, so
``alembic upgrade heads`` applies the upstream chain and skips the already-applied one.

Run from container entrypoints before migrations: ``python -m app.alembic_revision_remap``.
"""
from __future__ import annotations

from typing import Dict, List, Tuple

from sqlalchemy import inspect, text

RENAMED: Dict[str, str] = {
    "u1v2w3x4y5z6": "a1c0e5b7d2f4",
    "v2w3x4y5z6a7": "b2d1f6c8e3a5",
    "w3x4y5z6a7b8": "c3e2a7d9f4b6",
    "x4y5z6a7b8c9": "d4f3b8e0a5c7",
    "y5z6a7b8c9d0": "e5a4c9f1b6d8",
    "z6a7b8c9d0e1": "f6b5d0a2c7e9",
}
OLD_CHAIN_MARKER = ("organization_members", "workspace_permissions")
UPSTREAM_CHAIN_MARKER = ("project_model_providers", "endpoint")


def _has_column(inspector, table: str, column: str) -> bool:
    if not inspector.has_table(table):
        return False
    return any(col["name"] == column for col in inspector.get_columns(table))


def remap(engine) -> List[Tuple[str, str]]:
    """Move old-chain version rows to their new IDs; returns the ``(old, new)`` pairs moved."""
    inspector = inspect(engine)
    if not inspector.has_table("alembic_version"):
        return []
    with engine.begin() as conn:
        stamped = {row[0] for row in conn.execute(text("SELECT version_num FROM alembic_version"))}
        old = sorted(stamped & RENAMED.keys())
        if not old:
            return []
        if not _has_column(inspector, *OLD_CHAIN_MARKER) or _has_column(inspector, *UPSTREAM_CHAIN_MARKER):
            return []
        moved = []
        for rev in old:
            new = RENAMED[rev]
            if new in stamped:
                conn.execute(text("DELETE FROM alembic_version WHERE version_num = :old"), {"old": rev})
            else:
                conn.execute(
                    text("UPDATE alembic_version SET version_num = :new WHERE version_num = :old"),
                    {"new": new, "old": rev},
                )
            moved.append((rev, new))
        return moved


def main() -> None:
    try:
        from app.db import engine

        for old, new in remap(engine):
            print(f"alembic revision remap: {old} -> {new}", flush=True)
    except Exception as exc:
        print(f"WARNING: alembic revision remap skipped: {exc}", flush=True)


if __name__ == "__main__":
    main()
