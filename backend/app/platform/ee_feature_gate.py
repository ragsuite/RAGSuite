"""Server-side Enterprise feature lock for assistant and MCP answers.

A feature is available only when a verified offline license is loaded and the
Enterprise module is actually loaded. Callers cannot pass a flag to skip this.
DEBUG does not unlock it.
"""
from __future__ import annotations

import importlib.util
import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

_LOCK_COPY = {
    "analytics": (
        "Advanced analytics is an Enterprise feature. "
        "Cohorts, trends, and cost are available in RAGSuite Enterprise. "
        "This edition cannot share those figures."
    ),
    "compare_models": (
        "Compare models is an Enterprise feature. "
        "Side-by-side model comparison is available in RAGSuite Enterprise."
    ),
}


def enterprise_lock_message(module_id: str) -> str:
    return _LOCK_COPY.get(
        module_id,
        "That capability is an Enterprise feature and is not included in this edition.",
    )


def _module_loaded(module_id: str) -> bool:
    try:
        from app.platform.module_loader import loaded_module_ids

        if module_id in loaded_module_ids():
            return True
    except Exception:
        logger.debug("enterprise gate: loaded module ids unavailable", exc_info=True)
    try:
        return importlib.util.find_spec(f"ragsuite_modules.{module_id}") is not None
    except Exception:
        return False


def enterprise_feature_denial(module_id: str) -> Optional[dict[str, Any]]:
    """Return a lock payload when the feature must not return data.

    None means the signed license includes the feature and its module is loaded.
    The payload never includes usage figures.
    """
    from app.platform.ee_guard import KNOWN_ENTERPRISE_MODULE_IDS
    from app.platform.entitlement_deps import has_feature_entitlement

    feature = (module_id or "").strip()
    if feature not in KNOWN_ENTERPRISE_MODULE_IDS:
        return {
            "enterprise_locked": True,
            "feature": feature or "enterprise",
            "message": enterprise_lock_message(feature),
        }
    if not has_feature_entitlement(feature) or not _module_loaded(feature):
        return {
            "enterprise_locked": True,
            "feature": feature,
            "message": enterprise_lock_message(feature),
        }
    return None
