"""Translate Chroma ``where`` filters into parameterised SQL.

Supported: plain equality, ``$eq/$ne/$in/$nin/$gt/$gte/$lt/$lte`` and nested
``$and``/``$or``. Hot keys live in typed columns (indexed); every other key is read
from ``metadata`` jsonb with type-exact comparison, like Chroma's typed metadata.
"""
from __future__ import annotations

import itertools
import json
import re
from typing import Any, Dict, List, Mapping, Optional, Tuple

# key -> (column, python type the column holds)
PROMOTED: Dict[str, Tuple[str, type]] = {
    "project_id": ("project_id", str),
    "document_id": ("document_id", str),
    "source_file": ("source_file", str),
    "user_id": ("user_id", int),
}

_COMPARE = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<="}
# Keys matching this are inlined as SQL literals so expression indexes on
# ``metadata -> 'key'`` can serve them; anything else is bound as a parameter.
_LITERAL_KEY = re.compile(r"[A-Za-z0-9_.-]{1,128}")


class FilterError(ValueError):
    pass


def promoted_values(meta: Mapping[str, Any]) -> Dict[str, Any]:
    """Typed column values for a chunk; a column stays NULL when the type differs."""
    out: Dict[str, Any] = {}
    for key, (column, kind) in PROMOTED.items():
        value = meta.get(key) if meta else None
        if kind is int:
            ok = isinstance(value, int) and not isinstance(value, bool)
        else:
            ok = isinstance(value, kind)
        out[column] = value if ok else None
    return out


class _Builder:
    def __init__(self) -> None:
        self.params: Dict[str, Any] = {}
        self._ids = itertools.count()

    def bind(self, value: Any) -> str:
        name = f"w{next(self._ids)}"
        self.params[name] = value
        return f":{name}"

    @staticmethod
    def _column_for(key: str, values: List[Any]) -> Optional[str]:
        spec = PROMOTED.get(key)
        if spec is None or not values:
            return None
        column, kind = spec
        for v in values:
            if kind is int and (not isinstance(v, int) or isinstance(v, bool)):
                return None
            if kind is not int and not isinstance(v, kind):
                return None
        return column

    def key(self, key: str) -> str:
        return f"'{key}'" if _LITERAL_KEY.fullmatch(key) else self.bind(key)

    def _jsonb(self, key: str, value: Any) -> str:
        return f"(metadata -> {self.key(key)}) = CAST({self.bind(json.dumps(value))} AS jsonb)"

    def field(self, key: str, cond: Any) -> str:
        if not isinstance(cond, dict):
            cond = {"$eq": cond}
        if len(cond) != 1:
            return "(" + " AND ".join(self.field(key, {op: v}) for op, v in cond.items()) + ")"
        op, value = next(iter(cond.items()))
        if op in ("$eq", "$ne"):
            column = self._column_for(key, [value])
            expr = f"{column} = {self.bind(value)}" if column else self._jsonb(key, value)
            if op == "$eq":
                return expr
            present = f"{column} IS NOT NULL" if column else f"metadata ? {self.key(key)}"
            return f"(NOT ({present}) OR NOT ({expr}))"
        if op in ("$in", "$nin"):
            values = list(value or [])
            if not values:
                return "FALSE" if op == "$in" else "TRUE"
            column = self._column_for(key, values)
            if column:
                expr = f"{column} = ANY({self.bind(values)})"
                present = f"{column} IS NOT NULL"
            else:
                expr = "(" + " OR ".join(self._jsonb(key, v) for v in values) + ")"
                present = f"metadata ? {self.key(key)}"
            return expr if op == "$in" else f"(NOT ({present}) OR NOT {expr})"
        if op in _COMPARE:
            sql_op = _COMPARE[op]
            column = self._column_for(key, [value])
            if column:
                return f"{column} {sql_op} {self.bind(value)}"
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise FilterError(f"{op} needs a number for key {key!r}")
            path = self.key(key)
            return (
                f"(jsonb_typeof(metadata -> {path}) = 'number' "
                f"AND (metadata ->> {path})::double precision {sql_op} {self.bind(float(value))})"
            )
        raise FilterError(f"Unsupported filter operator {op!r}")

    def clause(self, where: Mapping[str, Any]) -> str:
        parts: List[str] = []
        for key, cond in where.items():
            if key in ("$and", "$or"):
                subs = [self.clause(c) for c in (cond or [])]
                if not subs:
                    parts.append("TRUE" if key == "$and" else "FALSE")
                    continue
                joiner = " AND " if key == "$and" else " OR "
                parts.append("(" + joiner.join(subs) + ")")
            elif key.startswith("$"):
                raise FilterError(f"Unsupported logical operator {key!r}")
            else:
                parts.append(self.field(key, cond))
        if not parts:
            return "TRUE"
        return parts[0] if len(parts) == 1 else "(" + " AND ".join(parts) + ")"


def build_where(where: Optional[Mapping[str, Any]]) -> Tuple[str, Dict[str, Any]]:
    """``(sql, params)`` for a Chroma ``where`` dict; ``("TRUE", {})`` when empty."""
    if not where:
        return "TRUE", {}
    builder = _Builder()
    return builder.clause(where), builder.params
