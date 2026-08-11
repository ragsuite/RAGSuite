"""
Ad-hoc audit module stress checks (read-only). Run from backend/:
  .venv/bin/python scripts/audit_stress_check.py
"""
from __future__ import annotations

import sys
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import and_, or_

from app.db import SessionLocal
from app.models import AuditEvent, Project, User
from app.services.audit_service import ACCOUNT_SCOPED_EVENT_TYPES, V1_EVENT_TYPES

FAILURES: list[str] = []
WARNINGS: list[str] = []


def fail(msg: str) -> None:
    FAILURES.append(msg)


def warn(msg: str) -> None:
    WARNINGS.append(msg)


def project_scoped_filter(query, filter_pid, user_id):
    """Mirror audit.py list filter for project scope."""
    return query.filter(
        or_(
            AuditEvent.project_id == filter_pid,
            and_(
                AuditEvent.project_id.is_(None),
                AuditEvent.user_id == user_id,
                AuditEvent.event_type.in_(ACCOUNT_SCOPED_EVENT_TYPES),
            ),
        )
    )


def main() -> int:
    db = SessionLocal()
    try:
        users = db.query(User).limit(5).all()
        if not users:
            fail("No users in DB — cannot run checks")
            return 1

        user = users[0]
        projects = (
            db.query(Project)
            .filter(Project.owner_id == user.id)
            .order_by(Project.created_at)
            .all()
        )
        events = db.query(AuditEvent).limit(5000).all()
        by_type = defaultdict(int)
        for e in events:
            by_type[e.event_type] += 1

        print(f"User id={user.id} projects={len(projects)} audit_rows_sampled={len(events)}")

        # Catalog vs DB
        unknown_in_db = {t for t in by_type if t not in V1_EVENT_TYPES}
        if unknown_in_db:
            warn(f"DB has non-catalog event types: {sorted(unknown_in_db)}")

        account_null = [
            e
            for e in events
            if e.project_id is None and e.event_type in ACCOUNT_SCOPED_EVENT_TYPES
        ]
        account_null_other = [
            e
            for e in events
            if e.project_id is None and e.event_type not in ACCOUNT_SCOPED_EVENT_TYPES
        ]
        if account_null_other:
            warn(
                f"{len(account_null_other)} rows with project_id=null but not auth.* "
                f"(types: {sorted({e.event_type for e in account_null_other})})"
            )

        failed_logins_no_user = [
            e
            for e in events
            if e.event_type == "auth.login.failed" and e.user_id is None
        ]
        if failed_logins_no_user:
            warn(
                f"{len(failed_logins_no_user)} auth.login.failed with user_id=null "
                "(won't appear in project-scoped lists for any logged-in user)"
            )

        if len(projects) >= 2:
            p_a, p_b = projects[0], projects[1]
            q_a = project_scoped_filter(
                db.query(AuditEvent).filter(
                    or_(
                        and_(
                            AuditEvent.project_id.is_(None),
                            AuditEvent.user_id == user.id,
                        ),
                        AuditEvent.project_id.in_([p_a.id, p_b.id]),
                    )
                ),
                p_a.id,
                user.id,
            )
            q_b = project_scoped_filter(
                db.query(AuditEvent).filter(
                    or_(
                        and_(
                            AuditEvent.project_id.is_(None),
                            AuditEvent.user_id == user.id,
                        ),
                        AuditEvent.project_id.in_([p_a.id, p_b.id]),
                    )
                ),
                p_b.id,
                user.id,
            )
            ids_a = {r.id for r in q_a.all()}
            ids_b = {r.id for r in q_b.all()}
            only_b = [
                e
                for e in events
                if e.project_id == p_b.id and e.id in ids_b and e.id not in ids_a
            ]
            if only_b and any(e.id in ids_a for e in only_b):
                fail("Project B events leaked into project A scoped query")
            auth_in_a = [e for e in account_null if e.user_id == user.id and e.id in ids_a]
            auth_in_b = [e for e in account_null if e.user_id == user.id and e.id in ids_b]
            if account_null and user.id in {e.user_id for e in account_null}:
                if not auth_in_a or not auth_in_b:
                    fail(
                        "Account auth events not included in both project scoped lists "
                        f"(A has {len(auth_in_a)}, B has {len(auth_in_b)})"
                    )
                else:
                    print(
                        f"OK: auth events appear in both project lists "
                        f"({len(auth_in_a)} in A view)"
                    )
            cross = [
                e
                for e in events
                if e.project_id == p_b.id and e.id in ids_a
            ]
            if cross:
                fail(f"{len(cross)} project-B-only events visible in project-A filter")
            else:
                print("OK: project-specific events do not cross projects")

        # account_only simulation
        acct = db.query(AuditEvent).filter(
            AuditEvent.project_id.is_(None),
            AuditEvent.user_id == user.id,
        )
        acct_proj = [e for e in acct.all() if e.project_id is not None]
        if acct_proj:
            fail("account_only query returned project-scoped rows")

        # Invalid project id access (logic only)
        fake_owner_mismatch = db.query(Project).filter(Project.owner_id != user.id).first()
        if fake_owner_mismatch:
            print("OK: other-owner projects exist for isolation testing (manual API)")

        # Emit coverage: grep-based check
        emitted_types = set(by_type.keys())
        missing_emit = V1_EVENT_TYPES - emitted_types
        if missing_emit and events:
            warn(
                f"Never emitted in DB sample (may be unused flows): "
                f"{sorted(missing_emit)[:15]}{'...' if len(missing_emit) > 15 else ''}"
            )

        # Performance smell
        if len(events) >= 100:
            warn("count()+offset pagination on growing table — no retention/index stress tested")

    finally:
        db.close()

    print("\n--- FAILURES ---")
    for f in FAILURES:
        print(f"  [FAIL] {f}")
    print("\n--- WARNINGS ---")
    for w in WARNINGS:
        print(f"  [WARN] {w}")
    if not FAILURES and not WARNINGS:
        print("No automated DB issues detected.")
    return 1 if FAILURES else 0


if __name__ == "__main__":
    raise SystemExit(main())
