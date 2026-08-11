"""Per-request FastAPI entitlement dependency (H5).

Provides ``requires_entitlement(*features)`` — a FastAPI ``Depends``-compatible
dependency factory that raises HTTP 403 when:
  - No valid license is loaded, or
  - The license is valid but a required feature is absent from claims, or
  - The license_id appears on the CRL.

Usage in EE module register.py::

    from app.platform.entitlement_deps import requires_entitlement

    def register(ctx: ModuleContext) -> None:
        ctx.register_router(
            router,
            name="sso_auth",
            dependencies=[requires_entitlement("sso:use")],
        )

Usage in individual endpoint handlers::

    @router.get("/data")
    async def get_data(
        _ent: None = requires_entitlement("analytics:read"),
    ): ...

The helper ``entitle_router(router, *features)`` is provided for routers that
were built before dependencies were known, though ``ctx.register_router(...,
dependencies=[...])`` is preferred.
"""
from __future__ import annotations

import logging
from typing import Any, Callable

from fastapi import Depends, HTTPException

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _feature_in_entitlements(feature: str, ent_set: set[str]) -> bool:
    """Match *feature* against the entitlements set.

    Exact match ("sso:use") or module-id prefix match ("sso" covers "sso:use").
    """
    if feature in ent_set:
        return True
    for claim in ent_set:
        if feature.startswith(claim + ":"):
            return True
    return False


def _make_check(*features: str) -> Callable[[], Any]:
    """Build the async check coroutine for the given feature set."""

    async def _check() -> None:
        from app.platform.license_state import get_claims

        claims = get_claims()
        if claims is None:
            raise HTTPException(
                status_code=403,
                detail=(
                    "Enterprise license required — no valid license found. "
                    "Install an offline.key with: ragsuite activate --key ./offline.key"
                ),
            )

        # CRL check (soft-fail: hard-fail only when cache is stale beyond max-age)
        try:
            from app.platform.crl_client import is_revoked

            if is_revoked(claims.license_id):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        "Enterprise license has been revoked. "
                        "Contact your NITSAN vendor to renew."
                    ),
                )
        except HTTPException:
            raise
        except RuntimeError as exc:
            # Hard-fail from stale CRL cache
            logger.warning("entitlement_deps: CRL hard-fail — denying: %s", exc)
            raise HTTPException(status_code=403, detail=str(exc)) from exc
        except Exception as exc:
            logger.warning("entitlement_deps: CRL check error (soft-fail allow): %s", exc)

        ent_set = set(claims.entitlements)
        for feature in features:
            if not _feature_in_entitlements(feature, ent_set):
                raise HTTPException(
                    status_code=403,
                    detail=(
                        f"Enterprise feature '{feature}' is not available in your license. "
                        "Contact your NITSAN vendor to upgrade."
                    ),
                )

    return _check


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def requires_entitlement(*features: str) -> Any:
    """Return a FastAPI ``Depends(...)`` that enforces the given EE features.

    Suitable for use in:
    - ``dependencies=[requires_entitlement("analytics:read")]`` on router/app
    - ``ctx.register_router(router, dependencies=[requires_entitlement("sso:use")])``
    - ``async def endpoint(_: None = requires_entitlement("feature"))`` in handlers
    """
    return Depends(_make_check(*features))


def entitle_router(router: Any, *features: str) -> None:
    """Append an entitlement dependency to every existing route on *router* in-place.

    Prefer ``ctx.register_router(router, dependencies=[requires_entitlement(...)])``
    which is cleaner. Use this helper only when the router was built before
    the dependency was known and cannot be re-created.
    """
    dep = requires_entitlement(*features)
    for route in getattr(router, "routes", []):
        deps = getattr(route, "dependencies", None)
        if deps is not None:
            deps.append(dep)
