"""Install / activate an Enterprise bundle under CE extensions/ (Phase 7)."""
from __future__ import annotations

import argparse
import json
import os
import shutil
import tarfile
import tempfile
from pathlib import Path
from typing import Any, Dict, Optional

from app.platform.bundle_checksums import verify_checksums
from app.platform.bundle_signature import verify_bundle_signature
from app.platform.ee_guard import allow_unsigned_bundle, require_license_claims_for_install
from app.platform.module_bootstrap import repo_root
from app.platform.semver_range import satisfies
from app.platform.version import PLATFORM_VERSION


def installed_ee_base() -> Path:
    return repo_root() / "extensions" / "installed" / "ee"


def data_ee_marker() -> Path:
    path = repo_root() / "backend" / "data" / "extensions"
    path.mkdir(parents=True, exist_ok=True)
    return path / "ee-current"


def _load_manifest(bundle_root: Path) -> Dict[str, Any]:
    path = bundle_root / "manifest.json"
    if not path.is_file():
        raise FileNotFoundError(f"manifest.json missing in {bundle_root}")
    return json.loads(path.read_text(encoding="utf-8"))


def _safe_members(tar: tarfile.TarFile, dest: Path):
    """Yield members that cannot escape ``dest`` (path traversal guard)."""
    dest_resolved = dest.resolve()
    for member in tar.getmembers():
        target = (dest / member.name).resolve()
        try:
            target.relative_to(dest_resolved)
        except ValueError as exc:
            raise RuntimeError(f"Unsafe path in archive: {member.name!r}") from exc
        yield member


def _extract_tar(archive: Path, dest: Path) -> Path:
    dest.mkdir(parents=True, exist_ok=True)
    with tarfile.open(archive, "r:gz") as tar:
        members = list(_safe_members(tar, dest))
        # Python 3.12+ supports filter=; older falls back to pre-validated members.
        try:
            tar.extractall(dest, members=members, filter="data")  # type: ignore[call-arg]
        except TypeError:
            tar.extractall(dest, members=members)
    # Expect single top-level ragsuite-ee-<ver>/
    children = [p for p in dest.iterdir() if p.is_dir()]
    if len(children) == 1:
        return children[0]
    # Already a bundle root
    if (dest / "manifest.json").is_file():
        return dest
    raise RuntimeError(f"Unexpected archive layout under {dest}")


def resolve_bundle_dir(source: Path) -> Path:
    source = source.expanduser().resolve()
    if source.is_file() and source.name.endswith(".tar.gz"):
        tmp = Path(tempfile.mkdtemp(prefix="ragsuite-bundle-"))
        return _extract_tar(source, tmp)
    if source.is_dir() and (source / "manifest.json").is_file():
        return source
    raise FileNotFoundError(f"Not a bundle archive or directory: {source}")


def install_bundle(
    source: Path,
    *,
    platform_version: str = PLATFORM_VERSION,
    skip_compat: bool = False,
    replace_previous: bool = True,
    require_license: bool = True,
    allow_unsigned: Optional[bool] = None,
) -> Path:
    """
    Verify checksums + signature + platform_compat, install under extensions/installed/ee/<ver>/.

    When ``replace_previous`` is True (default), after a successful install the previous
    EE version directories under ``extensions/installed/ee/`` are removed — only the new
    ACTIVE version remains. Does **not** touch Postgres, ``.env``, or ``offline.key``.

    ``require_license`` (default True) refuses install unless offline key is valid/grace.
    Signature required unless ``allow_unsigned`` / ``RAGSUITE_ALLOW_UNSIGNED_BUNDLE=1``.
    """
    if require_license:
        require_license_claims_for_install()

    unsigned = allow_unsigned_bundle() if allow_unsigned is None else bool(allow_unsigned)

    bundle_root = resolve_bundle_dir(source)
    ok, errors = verify_checksums(bundle_root)
    if not ok:
        raise RuntimeError("Bundle checksum verification failed:\n" + "\n".join(errors))

    sig_ok, sig_msg = verify_bundle_signature(bundle_root, allow_unsigned=unsigned)
    if not sig_ok:
        raise RuntimeError(f"Bundle signature verification failed: {sig_msg}")

    manifest = _load_manifest(bundle_root)
    version = str(manifest.get("version") or "").strip()
    if not version:
        raise RuntimeError("manifest.version missing")

    compat = str(manifest.get("platform_compat") or "").strip()
    if not skip_compat and compat:
        if not satisfies(platform_version, compat):
            raise RuntimeError(
                f"Platform {platform_version} does not satisfy bundle platform_compat={compat!r}"
            )

    modules_src = bundle_root / "modules"
    if not modules_src.is_dir():
        raise RuntimeError("bundle missing modules/")

    target = installed_ee_base() / version
    if target.exists():
        shutil.rmtree(target)
    target.mkdir(parents=True)
    # Copy entire verified bundle (manifest + checksums + modules)
    for name in ("manifest.json", "CHECKSUMS.sha256", "signature", "modules"):
        src = bundle_root / name
        dst = target / name
        if src.is_dir():
            shutil.copytree(src, dst)
        elif src.is_file():
            shutil.copy2(src, dst)

    set_active_version(version)
    if replace_previous:
        removed = prune_inactive_ee_versions(keep=version)
        if removed:
            print(f"Replaced previous EE version(s): {', '.join(removed)}")
    return target


def prune_inactive_ee_versions(*, keep: str) -> list[str]:
    """
    Remove installed EE version directories other than ``keep``.
    Never deletes ACTIVE marker itself; never touches app data outside this tree.
    """
    keep = (keep or "").strip()
    base = installed_ee_base()
    if not base.is_dir() or not keep:
        return []
    removed: list[str] = []
    for child in list(base.iterdir()):
        if child.name == "ACTIVE":
            continue
        if child.is_dir() and child.name != keep:
            shutil.rmtree(child)
            removed.append(child.name)
    return sorted(removed)


def set_active_version(version: str) -> Path:
    """Point ACTIVE (+ diagnostic marker) at an already-installed version. No deletes."""
    version = (version or "").strip()
    if not version:
        raise ValueError("version required")
    target = installed_ee_base() / version
    if not target.is_dir() or not (target / "modules").is_dir():
        raise FileNotFoundError(f"Installed bundle version not found: {version}")
    active = installed_ee_base() / "ACTIVE"
    active.parent.mkdir(parents=True, exist_ok=True)
    active.write_text(version + "\n", encoding="utf-8")
    data_ee_marker().write_text(version + "\n", encoding="utf-8")
    return target


def active_bundle_version() -> Optional[str]:
    active = installed_ee_base() / "ACTIVE"
    if not active.is_file():
        return None
    version = active.read_text(encoding="utf-8").strip()
    return version or None


def active_bundle_modules_root() -> Optional[Path]:
    active = installed_ee_base() / "ACTIVE"
    if not active.is_file():
        return None
    version = active.read_text(encoding="utf-8").strip()
    if not version:
        return None
    modules = installed_ee_base() / version / "modules"
    if modules.is_dir():
        return modules.resolve()
    return None


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Install RAGSuite Enterprise bundle")
    parser.add_argument("source", type=Path, help="Path to .tar.gz or extracted bundle dir")
    parser.add_argument(
        "--skip-compat",
        action="store_true",
        help="Skip platform_compat check (dev only)",
    )
    parser.add_argument(
        "--allow-unsigned",
        action="store_true",
        help="Lab only: allow missing/empty bundle signature (checksum-only)",
    )
    args = parser.parse_args(argv)
    if args.allow_unsigned:
        os.environ["RAGSUITE_ALLOW_UNSIGNED_BUNDLE"] = "1"
    target = install_bundle(
        args.source,
        skip_compat=args.skip_compat,
        allow_unsigned=args.allow_unsigned or None,
    )
    print(f"Installed bundle at {target}")
    active_ver = (installed_ee_base() / "ACTIVE").read_text().strip()
    print(f"ACTIVE → {active_ver}")
    others = [
        p.name
        for p in installed_ee_base().iterdir()
        if p.is_dir() and p.name != active_ver
    ]
    if others:
        print(f"(other EE dirs still present: {', '.join(sorted(others))})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
