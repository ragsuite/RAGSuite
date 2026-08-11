"""Compatibility import path for tests and tools.

Allows ``import ragsuite_license_verify`` without manually mutating PYTHONPATH.
The real implementation lives in ``backend/vendor/ragsuite_license_verify``.
"""

from importlib.util import module_from_spec, spec_from_file_location
from pathlib import Path
import sys

_VERIFY_PATH = Path(__file__).resolve().parents[1] / "vendor" / "ragsuite_license_verify" / "verify.py"
_SPEC = spec_from_file_location("_ragsuite_license_verify_impl", _VERIFY_PATH)
if _SPEC is None or _SPEC.loader is None:  # pragma: no cover
    raise ImportError(f"Cannot load license verifier from {_VERIFY_PATH}")
_MOD = module_from_spec(_SPEC)
sys.modules[_SPEC.name] = _MOD
_SPEC.loader.exec_module(_MOD)
sys.modules[__name__ + ".verify"] = _MOD
verify = _MOD

LicenseClaims = _MOD.LicenseClaims
LicenseExpiredError = _MOD.LicenseExpiredError
LicenseVerifyError = _MOD.LicenseVerifyError
default_public_key_pem = _MOD.default_public_key_pem
has_any_entitlement = _MOD.has_any_entitlement
has_entitlement = _MOD.has_entitlement
verify_license = _MOD.verify_license

__all__ = [
    "LicenseClaims",
    "LicenseExpiredError",
    "LicenseVerifyError",
    "default_public_key_pem",
    "has_any_entitlement",
    "has_entitlement",
    "verify_license",
]
