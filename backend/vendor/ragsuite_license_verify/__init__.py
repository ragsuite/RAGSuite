"""Offline license verification for RAGSuite CE (Phase 10 wiring)."""
from .verify import (
    LicenseClaims,
    LicenseExpiredError,
    LicenseVerifyError,
    default_public_key_pem,
    has_any_entitlement,
    has_entitlement,
    verify_license,
)

__all__ = [
    "LicenseClaims",
    "LicenseExpiredError",
    "LicenseVerifyError",
    "default_public_key_pem",
    "has_any_entitlement",
    "has_entitlement",
    "verify_license",
]
