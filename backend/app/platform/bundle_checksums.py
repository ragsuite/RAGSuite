"""Checksum verify helpers shared by bundle install/verify (Phase 7)."""
from __future__ import annotations

import hashlib
from pathlib import Path
from typing import Dict, List, Tuple


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def iter_payload_files(root: Path) -> List[Path]:
    skip_names = {"CHECKSUMS.sha256", "signature"}
    files: List[Path] = []
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if rel.name in skip_names and len(rel.parts) == 1:
            continue
        files.append(path)
    return files


def read_checksums(checksums_file: Path) -> Dict[str, str]:
    mapping: Dict[str, str] = {}
    for line in checksums_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            raise ValueError(f"Bad checksum line: {line!r}")
        mapping[parts[1]] = parts[0]
    return mapping


def verify_checksums(root: Path, checksums_file: Path | None = None) -> Tuple[bool, List[str]]:
    cf = checksums_file or (root / "CHECKSUMS.sha256")
    if not cf.is_file():
        return False, [f"missing checksums file: {cf}"]
    expected = read_checksums(cf)
    errors: List[str] = []
    seen = set()
    for path in iter_payload_files(root):
        rel = path.relative_to(root).as_posix()
        seen.add(rel)
        digest = sha256_file(path)
        if rel not in expected:
            errors.append(f"unexpected file: {rel}")
        elif expected[rel] != digest:
            errors.append(f"checksum mismatch: {rel}")
    for rel in expected:
        if rel not in seen:
            errors.append(f"missing file: {rel}")
    return (len(errors) == 0), errors
