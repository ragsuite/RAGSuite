"""Platform ↔ bundle ↔ license compatibility report (Phase 13)."""
from __future__ import annotations

import json
import logging
import os
from dataclasses import asdict, dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional

from app.platform.bundle_install import active_bundle_version, installed_ee_base
from app.platform.license_state import license_status, reset_license_cache
from app.platform.module_bootstrap import repo_root
from app.platform.semver_range import satisfies
from app.platform.version import PLATFORM_VERSION

logger = logging.getLogger(__name__)

LICENSE_SCHEMA = "ragsuite.license.v1"


@dataclass
class CompatCheck:
    name: str
    ok: bool
    level: str  # info | warn | error
    detail: str
    data: Dict[str, Any] = field(default_factory=dict)


@dataclass
class CompatReport:
    platform_version: str
    ok: bool
    checks: List[CompatCheck] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "platform_version": self.platform_version,
            "ok": self.ok,
            "checks": [asdict(c) for c in self.checks],
        }


def active_bundle_manifest_path() -> Optional[Path]:
    version = active_bundle_version()
    if not version:
        return None
    path = installed_ee_base() / version / "manifest.json"
    return path if path.is_file() else None


def load_active_bundle_manifest() -> Optional[Dict[str, Any]]:
    path = active_bundle_manifest_path()
    if path is None:
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.warning("compat: cannot read ACTIVE manifest: %s", exc)
        return None


def active_bundle_platform_compatible(
    platform_version: str = PLATFORM_VERSION,
) -> tuple[bool, str, Optional[str]]:
    """Return (ok, detail, platform_compat_expr).

    No ACTIVE bundle ⇒ compatible (CE-only).
    Missing/empty platform_compat ⇒ compatible (treat as unrestricted).
    """
    version = active_bundle_version()
    if not version:
        return True, "no ACTIVE EE bundle", None
    manifest = load_active_bundle_manifest()
    if manifest is None:
        return False, f"ACTIVE={version} but manifest.json missing/unreadable", None
    compat = str(manifest.get("platform_compat") or "").strip()
    if not compat:
        return True, f"ACTIVE={version} has empty platform_compat", ""
    if satisfies(platform_version, compat):
        return True, f"Platform {platform_version} satisfies platform_compat={compat!r}", compat
    return (
        False,
        f"Platform {platform_version} does not satisfy ACTIVE bundle platform_compat={compat!r}",
        compat,
    )


def _check_platform() -> CompatCheck:
    return CompatCheck(
        name="platform_version",
        ok=True,
        level="info",
        detail=f"PLATFORM_VERSION={PLATFORM_VERSION}",
        data={"platform_version": PLATFORM_VERSION},
    )


def _check_active_bundle(platform_version: str) -> CompatCheck:
    ok, detail, compat = active_bundle_platform_compatible(platform_version)
    version = active_bundle_version()
    return CompatCheck(
        name="active_bundle_compat",
        ok=ok,
        level="error" if not ok else "info",
        detail=detail,
        data={
            "active_version": version,
            "platform_compat": compat,
            "platform_version": platform_version,
        },
    )


def _check_license_schema() -> CompatCheck:
    reset_license_cache()
    st = license_status(force=True)
    if st.state == "absent":
        return CompatCheck(
            name="license_schema",
            ok=True,
            level="info",
            detail="no offline key (CE — activate not required)",
            data={"state": st.state, "schema": None},
        )
    if st.state == "invalid":
        # Unsupported schema or bad signature — hard fail for doctor
        unsupported = st.detail and "schema" in (st.detail or "").lower()
        return CompatCheck(
            name="license_schema",
            ok=False,
            level="error",
            detail=st.detail or "invalid offline key",
            data={"state": st.state, "unsupported_schema": bool(unsupported)},
        )
    schema = None
    if st.claims:
        # claims summary from license_status does not include schema; re-read blob lightly
        schema = LICENSE_SCHEMA  # verified path already accepted schema
    return CompatCheck(
        name="license_schema",
        ok=True,
        level="info",
        detail=f"license state={st.state}; schema={LICENSE_SCHEMA}",
        data={"state": st.state, "schema": schema or LICENSE_SCHEMA},
    )


def _check_license_expiry() -> CompatCheck:
    reset_license_cache()
    st = license_status(force=True)
    if st.state in ("absent", "valid", "grace"):
        level = "warn" if st.state == "grace" else "info"
        return CompatCheck(
            name="license_expiry",
            ok=True,
            level=level,
            detail=st.detail or f"license state={st.state}",
            data={"state": st.state},
        )
    if st.state == "expired":
        return CompatCheck(
            name="license_expiry",
            ok=True,  # CE continues; warn only
            level="warn",
            detail=st.detail or "license expired past grace — EE modules off",
            data={"state": st.state},
        )
    return CompatCheck(
        name="license_expiry",
        ok=True,
        level="info",
        detail=f"license state={st.state}",
        data={"state": st.state},
    )


def _check_alembic() -> CompatCheck:
    """Best-effort: warn if DATABASE_URL set and current revision != head."""
    db_url = (os.environ.get("DATABASE_URL") or "").strip()
    if not db_url:
        return CompatCheck(
            name="alembic",
            ok=True,
            level="info",
            detail="DATABASE_URL unset — skip alembic probe",
            data={},
        )
    try:
        from alembic.config import Config
        from alembic.script import ScriptDirectory
        from alembic.runtime.migration import MigrationContext
        from sqlalchemy import create_engine

        backend = repo_root() / "backend"
        ini = backend / "alembic.ini"
        if not ini.is_file():
            return CompatCheck(
                name="alembic",
                ok=True,
                level="warn",
                detail="alembic.ini missing",
                data={},
            )
        cfg = Config(str(ini))
        cfg.set_main_option("script_location", str(backend / "alembic"))
        cfg.set_main_option("sqlalchemy.url", db_url)
        script = ScriptDirectory.from_config(cfg)
        heads = script.get_heads()
        engine = create_engine(db_url)
        with engine.connect() as conn:
            context = MigrationContext.configure(conn)
            current = context.get_current_revision()
        engine.dispose()
        if current is None:
            return CompatCheck(
                name="alembic",
                ok=True,
                level="warn",
                detail="DB has no alembic_version — first boot may stamp/upgrade",
                data={"current": None, "heads": list(heads)},
            )
        if current not in heads and heads:
            return CompatCheck(
                name="alembic",
                ok=True,
                level="warn",
                detail=f"DB revision {current} behind head(s) {heads} — run alembic upgrade head",
                data={"current": current, "heads": list(heads)},
            )
        return CompatCheck(
            name="alembic",
            ok=True,
            level="info",
            detail=f"alembic current={current} at head",
            data={"current": current, "heads": list(heads)},
        )
    except Exception as exc:  # pragma: no cover — env-dependent
        return CompatCheck(
            name="alembic",
            ok=True,
            level="warn",
            detail=f"alembic probe failed: {exc}",
            data={},
        )


def build_compat_report(*, platform_version: str = PLATFORM_VERSION) -> CompatReport:
    checks = [
        _check_platform(),
        _check_active_bundle(platform_version),
        _check_license_schema(),
        _check_license_expiry(),
        _check_alembic(),
    ]
    ok = all(c.ok for c in checks)
    return CompatReport(platform_version=platform_version, ok=ok, checks=checks)


def doctor_should_fail(report: CompatReport) -> bool:
    """Hard doctor failure: ACTIVE incompat or unsupported/invalid license schema."""
    for c in report.checks:
        if c.name in ("active_bundle_compat", "license_schema") and not c.ok:
            return True
    return False
