"""Save pipeline for project provider configs: validate, verify with the provider, persist.

Empty or masked API key input keeps the stored key. The HTTP route saves through
``save_verified_provider_config`` so a key the provider rejects is never stored.
"""
from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Mapping, Optional

from sqlalchemy.orm import Session

from ..models import ProjectModelProvider
from ..utils.api_key import _profile_key_is_usable, is_masked_api_key
from .project_model_provider_tuning import apply_tuning_updates, validated_tuning_updates
from .project_model_provider_verification import summarize_results, verify_before_save
from .project_model_providers import (
    CHAT_ONLY_PROVIDERS,
    RETIRED_PARAM_FIELDS,
    ProviderConfigError,
    get_provider_config,
    normalize_provider,
)


def _merge_api_key(provider: str, incoming: Optional[str], stored: Optional[str]) -> Optional[str]:
    if provider == "ollama":
        return None
    candidate = (incoming or "").strip()
    if not candidate or is_masked_api_key(candidate):
        return stored
    if len(candidate) < 8:
        raise ProviderConfigError("API key looks too short")
    return candidate


@dataclass
class PreparedProviderSave:
    """Validated save input; nothing is written until ``persist_provider_save``."""

    project_id: uuid.UUID
    provider: str
    row: Optional[ProjectModelProvider]
    chat_model: str
    embedding_model: Optional[str]
    api_key: Optional[str]
    # Per-surface tuning columns present in the payload (see project_model_provider_tuning).
    tuning: Dict[str, Any]

    @property
    def key_changed(self) -> bool:
        return self.row is None or self.api_key != self.row.api_key

    @property
    def needs_verification(self) -> bool:
        """Hosted providers are probed unless an already verified config only changes tuning."""
        if self.provider == "ollama":
            return False
        row = self.row
        return (
            row is None
            or self.key_changed
            or self.chat_model != row.chat_model
            or self.embedding_model != row.embedding_model
            or row.last_test_status != "success"
        )


def prepare_provider_save(
    db: Session, *, project_id: uuid.UUID, provider: str, data: Mapping[str, Any]
) -> PreparedProviderSave:
    provider = normalize_provider(provider)
    row = get_provider_config(db, project_id, provider)
    chat_model = (data.get("chat_model") or (row.chat_model if row else "") or "").strip()
    if not chat_model:
        raise ProviderConfigError("Chat model is required")

    new_key = _merge_api_key(provider, data.get("api_key"), row.api_key if row else None)
    if provider != "ollama" and not _profile_key_is_usable(provider, new_key):
        raise ProviderConfigError("API key is required for this provider")

    embedding = (data.get("embedding_model") or "").strip() or None
    return PreparedProviderSave(
        project_id=project_id,
        provider=provider,
        row=row,
        chat_model=chat_model,
        embedding_model=None if provider in CHAT_ONLY_PROVIDERS else embedding,
        api_key=new_key,
        tuning=validated_tuning_updates(provider, data),
    )


def persist_provider_save(
    db: Session,
    prepared: PreparedProviderSave,
    *,
    user_id: Optional[int],
    verification: Optional[Dict[str, str]] = None,
) -> ProjectModelProvider:
    key_changed = prepared.key_changed
    row = prepared.row
    if row is None:
        row = ProjectModelProvider(project_id=prepared.project_id, provider=prepared.provider)
        db.add(row)
    row.chat_model = prepared.chat_model
    row.embedding_model = prepared.embedding_model
    row.api_key = prepared.api_key
    apply_tuning_updates(row, prepared.tuning)
    for field in RETIRED_PARAM_FIELDS:
        setattr(row, field, None)
    if verification:
        row.last_test_status = "success"
        row.last_test_message = summarize_results(verification)
        row.last_tested_at = datetime.now(timezone.utc)
    elif key_changed:
        row.last_test_status = None
        row.last_test_message = None
        row.last_tested_at = None
    row.updated_by = user_id
    db.commit()
    db.refresh(row)
    return row


def save_provider_config(
    db: Session,
    *,
    project_id: uuid.UUID,
    provider: str,
    user_id: Optional[int],
    data: Mapping[str, Any],
) -> ProjectModelProvider:
    """Save without probing the provider (internal callers and tests)."""
    prepared = prepare_provider_save(db, project_id=project_id, provider=provider, data=data)
    return persist_provider_save(db, prepared, user_id=user_id)


async def save_verified_provider_config(
    db: Session,
    *,
    project_id: uuid.UUID,
    provider: str,
    user_id: Optional[int],
    data: Mapping[str, Any],
) -> ProjectModelProvider:
    """Save only after the provider accepts the key; raises ProviderConfigError otherwise."""
    prepared = prepare_provider_save(db, project_id=project_id, provider=provider, data=data)
    verification = None
    if prepared.needs_verification:
        verification, failure = await verify_before_save(
            prepared.provider,
            chat_model=prepared.chat_model,
            embedding_model=prepared.embedding_model,
            api_key=prepared.api_key,
        )
        if failure:
            raise ProviderConfigError(failure)
    return persist_provider_save(db, prepared, user_id=user_id, verification=verification)
