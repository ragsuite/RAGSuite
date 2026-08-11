"""Bootstrap ``ragsuite_modules`` namespace across one or more module roots."""
from __future__ import annotations

import os
import sys
from pathlib import Path
from types import ModuleType
from typing import Iterable, List


def repo_root() -> Path:
    """Return CE install / monorepo root (contains ``modules/`` / ``extensions/``).

    Prefer ``RAGSUITE_REPO_ROOT`` when set (CLI sets this to the customer install,
    e.g. ``~/ragsuite``) so EE bundles and ``offline.key`` stay in that tree.

    Native layout fallback: ``<repo>/backend/app/platform/module_bootstrap.py`` → parents[3].
    Docker layout (legacy): ``COPY backend/ .`` into ``/app`` → parents[2].
    """
    override = (os.environ.get("RAGSUITE_REPO_ROOT") or "").strip()
    if override:
        candidate = Path(override).expanduser().resolve()
        if candidate.is_dir() and (
            (candidate / "backend").is_dir()
            or (candidate / "modules").is_dir()
            or (candidate / "frontend").is_dir()
            or (candidate / "scripts").is_dir()
        ):
            return candidate

    here = Path(__file__).resolve()
    monorepo = here.parents[3]
    if (monorepo / "modules").is_dir() or (monorepo / "frontend").is_dir() or (monorepo / "backend").is_dir():
        return monorepo
    # Docker image: backend package lives at /app, modules at /app/modules
    return here.parents[2]


def ensure_ragsuite_modules_path(*extra_roots: Path) -> Path:
    """Make ``import ragsuite_modules.<id>...`` resolve under module package roots.

    Always includes ``<repo>/modules``. Additional roots (e.g. EE ``modules/``,
    ``extensions/`` dirs) are appended to the namespace ``__path__`` — edition-agnostic.
    """
    root = repo_root()
    modules_dir = root / "modules"
    paths: List[str] = [str(modules_dir)]
    for extra in extra_roots:
        if extra is None:
            continue
        p = Path(extra)
        if p.is_dir():
            s = str(p.resolve())
            if s not in paths:
                paths.append(s)

    name = "ragsuite_modules"
    if name not in sys.modules:
        pkg = ModuleType(name)
        pkg.__path__ = list(paths)  # type: ignore[attr-defined]
        sys.modules[name] = pkg
    else:
        pkg = sys.modules[name]
        existing: List[str] = list(getattr(pkg, "__path__", []) or [])
        for s in paths:
            if s not in existing:
                existing.append(s)
        pkg.__path__ = existing  # type: ignore[attr-defined]

    if str(root) not in sys.path:
        sys.path.insert(0, str(root))
    return modules_dir


def add_module_search_roots(roots: Iterable[Path]) -> None:
    """Append extension package roots to the ``ragsuite_modules`` namespace."""
    ensure_ragsuite_modules_path(*list(roots))
