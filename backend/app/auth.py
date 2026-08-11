"""Compatibility shim — Platform spine lives in ``app.platform`` (Phase 2)."""
from app.platform import auth as _mod

for _name in dir(_mod):
    if _name.startswith("__") and _name.endswith("__"):
        continue
    globals()[_name] = getattr(_mod, _name)

del _mod, _name
