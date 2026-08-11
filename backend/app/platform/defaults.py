"""
Shared default values that can be overridden via environment.
"""
import os
from pathlib import Path

from dotenv import load_dotenv

# platform/ → app/ → backend/
_backend_root = Path(__file__).resolve().parent.parent.parent
load_dotenv(_backend_root / ".env", override=False)

DEFAULT_EMBEDDING_MODEL = (
    os.environ.get("DEFAULT_EMBEDDING_MODEL")
    or os.environ.get("EMBEDDING_MODEL")
    or "jina/jina-embeddings-v2-base-de"
).strip()
