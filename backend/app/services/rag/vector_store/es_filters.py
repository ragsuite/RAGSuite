"""Translate Chroma-shaped ``where`` filters into an Elasticsearch bool query."""
from __future__ import annotations

from typing import Any, Dict, List, Mapping, Optional

PROMOTED = {"project_id", "document_id", "source_file", "user_id", "chunk_id"}


def _field(key: str) -> str:
    return key if key in PROMOTED else f"metadata.{key}"


def _term(key: str, value: Any) -> Dict[str, Any]:
    return {"term": {_field(key): value}}


def _clause(key: str, cond: Any) -> Dict[str, Any]:
    if not isinstance(cond, dict):
        return _term(key, cond)
    if len(cond) != 1:
        return {"bool": {"must": [_clause(key, {op: val}) for op, val in cond.items()]}}
    op, value = next(iter(cond.items()))
    field = _field(key)
    if op == "$eq":
        return _term(key, value)
    if op == "$ne":
        return {"bool": {"must_not": [_term(key, value)]}}
    if op == "$in":
        return {"terms": {field: list(value)}}
    if op == "$nin":
        return {"bool": {"must_not": [{"terms": {field: list(value)}}]}}
    if op in {"$gt", "$gte", "$lt", "$lte"}:
        return {"range": {field: {op[1:]: value}}}
    return _term(key, value)


def to_es_query(where: Optional[Mapping[str, Any]]) -> Dict[str, Any]:
    if not where:
        return {"match_all": {}}
    if "$and" in where:
        return {"bool": {"must": [to_es_query(part) for part in where["$and"]]}}
    if "$or" in where:
        return {"bool": {"should": [to_es_query(part) for part in where["$or"]], "minimum_should_match": 1}}
    if len(where) == 1:
        key, cond = next(iter(where.items()))
        return _clause(str(key), cond)
    return {"bool": {"must": [_clause(str(key), cond) for key, cond in where.items()]}}
