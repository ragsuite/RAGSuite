"""
One-time backfill: hash all existing plaintext API keys.

Run ONCE after the alembic migration adds the key_hash column,
and BEFORE deploying the dual-verify auth code.

Usage (from backend/ directory):
    .venv/bin/python scripts/backfill_api_key_hashes.py

Expected output:
    Backfilling N rows...
    Done. Remaining unhashed: 0

If 'Remaining unhashed: 0' — safe to deploy the new auth code.
"""
import hashlib
import sys
import os

# Allow running from the backend/ dir
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.db import SessionLocal
from app.models import APIKey

db = SessionLocal()
try:
    rows = db.query(APIKey).filter(APIKey.key_hash == None).all()
    print(f"Backfilling {len(rows)} rows...")
    for row in rows:
        if row.key:
            row.key_hash = hashlib.sha256(row.key.encode()).hexdigest()
    db.commit()
    remaining = db.query(APIKey).filter(APIKey.key_hash == None).count()
    print(f"Done. Remaining unhashed: {remaining}")
    if remaining > 0:
        print("WARNING: Some rows could not be hashed (null key?). Inspect manually.")
        sys.exit(1)
finally:
    db.close()
