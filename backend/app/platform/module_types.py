"""Module manifest types (Phase 3 — ADR-002)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Literal, Optional

Edition = Literal["community", "enterprise", "platform"]
ModuleStatus = Literal["migrated", "partial", "legacy"]


@dataclass
class ModuleSurfaces:
    """Presence flags for Module interface surfaces (ADR-002)."""

    frontend: bool = False
    backend: bool = False
    routes: bool = False
    navigation: bool = False
    permissions: bool = False
    migration: bool = False
    seeder: bool = False
    api: bool = False
    settings: bool = False


@dataclass
class ModuleManifest:
    id: str
    version: str
    edition: Edition
    status: ModuleStatus = "partial"
    surfaces: ModuleSurfaces = field(default_factory=ModuleSurfaces)
    permissions: List[str] = field(default_factory=list)
    navigation: List[Dict[str, Any]] = field(default_factory=list)
    migrations: List[str] = field(default_factory=list)
    settings_schema: Optional[str] = None
    description: str = ""

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "ModuleManifest":
        raw_surfaces = data.get("surfaces") or {}
        surfaces = ModuleSurfaces(
            frontend=bool(raw_surfaces.get("frontend", False)),
            backend=bool(raw_surfaces.get("backend", False)),
            routes=bool(raw_surfaces.get("routes", False)),
            navigation=bool(raw_surfaces.get("navigation", False)),
            permissions=bool(raw_surfaces.get("permissions", False)),
            migration=bool(raw_surfaces.get("migration", False)),
            seeder=bool(raw_surfaces.get("seeder", False)),
            api=bool(raw_surfaces.get("api", False)),
            settings=bool(raw_surfaces.get("settings", False)),
        )
        edition = data.get("edition") or "community"
        status = data.get("status") or "partial"
        return cls(
            id=str(data["id"]),
            version=str(data.get("version") or "0.0.0"),
            edition=edition,  # type: ignore[arg-type]
            status=status,  # type: ignore[arg-type]
            surfaces=surfaces,
            permissions=list(data.get("permissions") or []),
            navigation=list(data.get("navigation") or []),
            migrations=list(data.get("migrations") or []),
            settings_schema=data.get("settings_schema"),
            description=str(data.get("description") or ""),
        )
