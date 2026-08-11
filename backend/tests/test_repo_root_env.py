"""repo_root() respects RAGSUITE_REPO_ROOT for customer installs."""
from __future__ import annotations

from pathlib import Path

from app.platform.module_bootstrap import repo_root


def test_repo_root_honors_env(tmp_path, monkeypatch):
    install = tmp_path / "ragsuite"
    (install / "backend").mkdir(parents=True)
    (install / "scripts").mkdir()
    monkeypatch.setenv("RAGSUITE_REPO_ROOT", str(install))
    assert repo_root() == install.resolve()


def test_repo_root_ignores_empty_or_junk(tmp_path, monkeypatch):
    junk = tmp_path / "empty"
    junk.mkdir()
    monkeypatch.setenv("RAGSUITE_REPO_ROOT", str(junk))
    # Falls back to source-tree based resolution (this CE checkout)
    root = repo_root()
    assert root.is_dir()
    assert (root / "backend").is_dir() or (root / "modules").is_dir()
