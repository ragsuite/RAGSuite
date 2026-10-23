"""Optional live Elasticsearch fixtures (set ELASTICSEARCH_URL)."""
from __future__ import annotations

import os

import pytest

ENV = "ELASTICSEARCH_URL"

requires_elasticsearch = pytest.mark.skipif(
    not os.environ.get(ENV), reason=f"{ENV} not set (Elasticsearch integration tests)"
)
