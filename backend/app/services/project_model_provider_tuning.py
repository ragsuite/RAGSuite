"""Model-specific widget tuning stored on project provider configs.

Temperature, similarity threshold and max tokens depend on the chosen models, so
each provider keeps separate Chatbot (``chat_*``) and Search (``search_*``) values.
Column names match the widget settings rows, which stay the runtime source: sync
copies provider values into them. They are edited only in Model Configuration; a
NULL provider value means the widget keeps its stored value. Top K and the
reranker stay widget-only and are never handled here.
"""
from __future__ import annotations

from typing import Any, Dict, Literal, Mapping, Optional, Tuple

from .project_model_providers import ProviderConfigError

Surface = Literal["chat", "search"]
SURFACES: Tuple[Surface, ...] = ("chat", "search")
TUNING_FIELDS = ("temperature", "similarity_threshold", "max_tokens")

MAX_TEMPERATURE = {"anthropic": 1.0, "mistral": 1.0}
DEFAULT_MAX_TEMPERATURE = 2.0
MAX_TOKENS_LIMIT = 3000


def tuning_column(surface: Surface, field: str) -> str:
    return f"{surface}_{field}"


TUNING_COLUMNS: Tuple[str, ...] = tuple(tuning_column(s, f) for s in SURFACES for f in TUNING_FIELDS)


def surface_tuning_columns(surface: Surface) -> Tuple[str, ...]:
    return tuple(tuning_column(surface, field) for field in TUNING_FIELDS)


def _field_of(column: str) -> str:
    return column.split("_", 1)[1]


def validated_temperature(provider: str, value: Any) -> Optional[str]:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ProviderConfigError("Temperature must be a number")
    limit = MAX_TEMPERATURE.get(provider, DEFAULT_MAX_TEMPERATURE)
    if not 0 <= number <= limit:
        raise ProviderConfigError(f"Temperature must be between 0 and {limit:g} for this provider")
    return str(value)


def _validated_threshold(value: Any) -> Optional[float]:
    if value is None or value == "":
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        raise ProviderConfigError("Similarity threshold must be a number")
    if not 0 <= number <= 1:
        raise ProviderConfigError("Similarity threshold must be between 0 and 1")
    return number


def _validated_max_tokens(value: Any) -> Optional[int]:
    if value is None or value == "":
        return None
    try:
        number = int(float(value))
    except (TypeError, ValueError):
        raise ProviderConfigError("Max tokens must be a whole number")
    if not 0 <= number <= MAX_TOKENS_LIMIT:
        raise ProviderConfigError(f"Max tokens must be between 0 and {MAX_TOKENS_LIMIT}")
    return number


def validated_tuning_value(provider: str, field: str, value: Any) -> Any:
    if field == "temperature":
        return validated_temperature(provider, value)
    if field == "similarity_threshold":
        return _validated_threshold(value)
    return _validated_max_tokens(value)


def validated_tuning_updates(provider: str, data: Mapping[str, Any]) -> Dict[str, Any]:
    """Provider columns to write from a Model Configuration save payload.

    A legacy ``temperature`` (older clients) applies to both surfaces unless the
    payload also carries the surface-specific value.
    """
    updates: Dict[str, Any] = {}
    if "temperature" in data:
        legacy = validated_temperature(provider, data["temperature"])
        for surface in SURFACES:
            updates[tuning_column(surface, "temperature")] = legacy
    for column in TUNING_COLUMNS:
        if column in data:
            updates[column] = validated_tuning_value(provider, _field_of(column), data[column])
    return updates


def apply_tuning_updates(row: Any, updates: Mapping[str, Any]) -> bool:
    changed = False
    for column, value in updates.items():
        if getattr(row, column) != value:
            setattr(row, column, value)
            changed = True
    chat_temperature = tuning_column("chat", "temperature")
    if chat_temperature in updates and row.temperature != row.chat_temperature:
        # Legacy column stays in step so older code paths and a rollback keep working.
        row.temperature = row.chat_temperature
    return changed


def _stored_value(row: Any, surface: Surface, field: str) -> Any:
    value = getattr(row, tuning_column(surface, field))
    if value is None and field == "temperature":
        return row.temperature
    return value


def surface_tuning_values(row: Any, surface: Surface) -> Dict[str, Any]:
    """Widget column values to copy from the provider; NULL fields are left out."""
    values: Dict[str, Any] = {}
    for field in TUNING_FIELDS:
        value = _stored_value(row, surface, field)
        if value is not None:
            values[tuning_column(surface, field)] = value
    return values


def serialize_surface_tuning(row: Any) -> Dict[str, Dict[str, Any]]:
    return {
        surface: {field: (_stored_value(row, surface, field) if row else None) for field in TUNING_FIELDS}
        for surface in SURFACES
    }
