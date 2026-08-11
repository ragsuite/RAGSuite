"""Phase 4 Extension loader — CE alone, missing EE, empty EE attach."""
from __future__ import annotations

import os
from pathlib import Path

import pytest
from fastapi import FastAPI

from app.platform.extension_loader import (
    discover_extension_roots,
    load_extensions,
    loaded_extension_ids,
    scanned_roots,
)
from app.platform.module_bootstrap import repo_root
from app.platform.module_loader import reset_registry


@pytest.fixture(autouse=True)
def _clean_ee_env(monkeypatch):
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    # Ignore any developer-installed EE bundle during Phase 4 loader tests
    monkeypatch.setattr(
        "app.platform.bundle_install.active_bundle_modules_root",
        lambda: None,
    )
    reset_registry()
    yield
    reset_registry()
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)


def test_extension_loader_ce_alone(monkeypatch):
    monkeypatch.delenv("RAGSUITE_EE_ROOT", raising=False)
    app = FastAPI()
    load_extensions(app)
    ids = loaded_extension_ids()
    assert "system_health" in ids
    assert "notifications" in ids
    assert "documents" in ids
    roots = scanned_roots()
    assert any(r.name == "modules" and r.parent == repo_root() for r in roots)
    # When EE unset, no path under a typical EE attach should appear as extra
    # beyond CE repo modules/extensions
    ce_names = {r.name for r in roots if r.parent == repo_root()}
    assert "modules" in ce_names


def test_extension_loader_missing_ee_root(monkeypatch, tmp_path):
    missing = tmp_path / "does-not-exist"
    monkeypatch.setenv("RAGSUITE_EE_ROOT", str(missing))
    app = FastAPI()
    load_extensions(app)  # must not raise
    ids = loaded_extension_ids()
    assert "documents" in ids
    # Missing EE root must not appear in scanned roots
    assert all(str(missing) not in str(r) for r in scanned_roots())


def test_extension_loader_ee_root_empty(monkeypatch, tmp_path):
    ee = tmp_path / "ee"
    (ee / "modules").mkdir(parents=True)
    (ee / "extensions").mkdir(parents=True)
    monkeypatch.setenv("RAGSUITE_EE_ROOT", str(ee))
    app = FastAPI()
    load_extensions(app)  # must not raise
    ids = loaded_extension_ids()
    assert set(ids) >= {"system_health", "notifications", "documents"}
    roots = scanned_roots()
    assert any(r == (ee / "modules").resolve() for r in roots)
    assert any(r == (ee / "extensions").resolve() for r in roots)


def test_discover_extension_roots_includes_repo_extensions():
    roots = discover_extension_roots()
    ext = repo_root() / "extensions"
    if ext.is_dir():
        assert ext.resolve() in [r.resolve() for r in roots]
