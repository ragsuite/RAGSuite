"""Ensure migrated modules do not import other modules (Phase 3 independence)."""
from __future__ import annotations

import re
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]  # backend/tests → backend → repo
MODULES = REPO / "modules"

IMPORT_PATTERNS = [
    re.compile(r"^\s*from\s+ragsuite_modules\.([a-z0-9_]+)\b"),
    re.compile(r"^\s*import\s+ragsuite_modules\.([a-z0-9_]+)\b"),
    re.compile(r"^\s*from\s+\.\.\.([a-z0-9_]+)\b"),  # unlikely
]


def test_modules_root_exists():
    assert MODULES.is_dir(), f"missing {MODULES}"


def test_no_cross_module_imports():
    violations: list[str] = []
    for mod_dir in sorted(MODULES.iterdir()):
        if not mod_dir.is_dir() or mod_dir.name.startswith("."):
            continue
        own_id = mod_dir.name
        for path in mod_dir.rglob("*.py"):
            text = path.read_text(encoding="utf-8")
            for i, line in enumerate(text.splitlines(), 1):
                for pat in IMPORT_PATTERNS[:2]:
                    m = pat.match(line)
                    if not m:
                        continue
                    other = m.group(1)
                    if other != own_id and other not in ("backend",):
                        # ragsuite_modules.<id>...
                        if other != own_id:
                            violations.append(f"{path.relative_to(REPO)}:{i}: imports module '{other}'")
    assert not violations, "Module independence violations:\n" + "\n".join(violations)


def test_migrated_modules_have_register():
    for mod_id in ("system_health", "notifications", "documents", "audit_basic", "trust_center"):
        reg = MODULES / mod_id / "backend" / "register.py"
        assert reg.is_file(), f"missing {reg}"
        manifest = MODULES / mod_id / "manifest.yaml"
        assert manifest.is_file()
        assert "status: migrated" in manifest.read_text(encoding="utf-8")
