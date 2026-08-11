"""Module registration context (Phase 3)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Sequence, TYPE_CHECKING

from app.platform import events as platform_events
from app.platform.module_types import ModuleManifest

if TYPE_CHECKING:
    from fastapi import APIRouter, FastAPI


@dataclass
class ModuleContext:
    """Passed to each Module.register(); Platform-owned registration APIs only."""

    app: "FastAPI"
    manifest: ModuleManifest
    registered_routers: List[str] = field(default_factory=list)
    declared_permissions: List[str] = field(default_factory=list)
    declared_navigation: List[Dict[str, Any]] = field(default_factory=list)
    declared_migrations: List[str] = field(default_factory=list)
    declared_settings: List[str] = field(default_factory=list)

    def register_router(
        self,
        router: "APIRouter",
        *,
        name: Optional[str] = None,
        dependencies: Optional[Sequence[Any]] = None,
    ) -> None:
        """Include *router* on the FastAPI app.

        ``dependencies`` (optional): list of ``Depends(...)`` objects applied to
        every route on this router at include-time (e.g. entitlement guards).
        Pass ``[requires_entitlement("sso:use")]`` from EE module register.py files.
        """
        kwargs: Dict[str, Any] = {}
        if dependencies:
            kwargs["dependencies"] = list(dependencies)
        self.app.include_router(router, **kwargs)
        self.registered_routers.append(name or self.manifest.id)

    def declare_permissions(self, keys: List[str]) -> None:
        self.declared_permissions.extend(keys)

    def declare_navigation(self, items: List[Dict[str, Any]]) -> None:
        self.declared_navigation.extend(items)

    def declare_migrations(self, refs: List[str]) -> None:
        self.declared_migrations.extend(refs)

    def declare_settings(self, panel_id: str) -> None:
        self.declared_settings.append(panel_id)

    def publish(self, event_name: str, **payload: Any) -> None:
        platform_events.publish(event_name, **payload)

    def subscribe(self, event_name: str, handler: Any) -> None:
        platform_events.subscribe(event_name, handler)
