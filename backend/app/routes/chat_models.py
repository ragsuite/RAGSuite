from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..db import get_db
from ..auth import get_current_user_required, ensure_project_access
from ..settings import settings
from ..models import User, ChatbotSettings, Project
from ..schemas import ChatConfigCreate, ChatConfigUpdate, ChatConfigOut, LLMConfigUpdate, LLMConfigOut, ApiResponse
from ..defaults import DEFAULT_EMBEDDING_MODEL
from ..utils.mistral_models import format_mistral_chat_test_failure
from ..utils.llm_model_catalogs import build_available_providers_payload
from ..utils.provider_model_discovery import build_provider_enrichments
from ..services.audit_service import emit_audit
from pydantic import BaseModel
import openai
import os
import secrets
import hashlib
from typing import Optional
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/config-models",
    tags=["Chat Models"]
)

class TestConfig(BaseModel):
    provider: str
    # Empty string = use stored project key (frontend sends "" when key field is masked).
    api_key: Optional[str] = ""
    chat_model: Optional[str] = None
    embedding_model: Optional[str] = None
    use_stored_key: Optional[bool] = None
def create_success_response(data=None, message=""):
    return {
        "success": True,
        "data": data,
        "message": message
    }

def _resolve_project_for_model_test(
    db: Session,
    user: User,
    project_id: Optional[str],
) -> Project:
    """Prefer explicit project_id (query) so stored keys match the UI project."""
    if project_id:
        try:
            project_uuid = uuid.UUID(str(project_id))
        except (TypeError, ValueError):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid project_id")
        return ensure_project_access(db, user, project_uuid)
    return _get_active_project(db, user.id)

def _get_active_project(db: Session, user_id: int) -> Project:
    """Resolve active project via org ACL (never invent owner-only Main Project)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # First, check if user is in onboarding and has temp project
    try:
        from .onboarding import _ob_get
        onboarding_data = _ob_get(user_id)
        if "data_source" in onboarding_data:
            temp_project_id = onboarding_data["data_source"].get("temp_project_id")
            if temp_project_id:
                import uuid
                temp_project = db.query(Project).filter(
                    and_(
                        Project.id == uuid.UUID(temp_project_id),
                        Project.owner_id == user_id
                    )
                ).first()
                if temp_project:
                    return temp_project
    except Exception:
        pass

    from ..auth import ensure_user_active_project
    project = ensure_user_active_project(db, user)
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No project found for current user",
        )
    return project

def _mask_api_key(key: Optional[str]) -> Optional[str]:
    """
    Return a masked version of an API key safe to send to the browser.
    Full key is NEVER returned — only first-4 + '...' + last-4 characters.
    The frontend must treat a value containing '...' as a sentinel meaning
    "key already saved; only replace if user types a new one."
    """
    from ..utils.api_key import mask_api_key

    return mask_api_key(key)


def _chatbot_settings_to_chat_config_out(
    chatbot_settings: ChatbotSettings,
    *,
    db: Optional[Session] = None,
    user_id: Optional[int] = None,
) -> dict:
    """Convert ChatbotSettings to ChatConfigOut format"""
    from ..utils.api_key import build_provider_api_key_masks

    provider_api_keys = {}
    if db is not None and user_id is not None:
        provider_api_keys = build_provider_api_key_masks(
            db,
            user_id=user_id,
            project_id=chatbot_settings.project_id,
            profile_type="chat",
            active_provider=chatbot_settings.model_provider,
            active_api_key=chatbot_settings.api_key,
        )

    return {
        "model_provider": chatbot_settings.model_provider or "ollama",
        "chat_model": chatbot_settings.chat_model or "",
        "search_model": None,  # Not in ChatbotSettings, will be in SearchSettings
        "embedding_model": chatbot_settings.embedding_model if hasattr(chatbot_settings, 'embedding_model') and chatbot_settings.embedding_model else DEFAULT_EMBEDDING_MODEL,
        "api_key": _mask_api_key(chatbot_settings.api_key),  # SECURITY: never return raw key to browser
        "provider_api_keys": provider_api_keys,
        "chat_temperature": chatbot_settings.chat_temperature,
        "chat_top_p": chatbot_settings.chat_top_p,
        "chat_best_of": chatbot_settings.chat_best_of,
        "chat_frequency_penalty": chatbot_settings.chat_frequency_penalty,
        "chat_presence_penalty": chatbot_settings.chat_presence_penalty,
        # RAG parameters with defaults
        "chat_top_k": chatbot_settings.chat_top_k if chatbot_settings.chat_top_k is not None else 8,
        "chat_similarity_threshold": chatbot_settings.chat_similarity_threshold if chatbot_settings.chat_similarity_threshold is not None else 0.7,
        "chat_max_tokens": chatbot_settings.chat_max_tokens if chatbot_settings.chat_max_tokens is not None else 1000,
        "chat_use_reranker": chatbot_settings.chat_use_reranker if chatbot_settings.chat_use_reranker is not None else False,
    }

@router.get("/", response_model=ApiResponse)
def get_chat_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    project_id: Optional[str] = Query(None),
):
    # Prefer explicit project_id so UI project matches stored keys during switch races
    active_project = _resolve_project_for_model_test(db, current_user, project_id)
    
    # Get or create chatbot_settings for this project
    chatbot_settings = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == active_project.id
        )
    ).first()
    
    if not chatbot_settings:
        # Create default chatbot_settings if not exists with proper defaults
        chatbot_settings = ChatbotSettings(
            user_id=current_user.id,
            project_id=active_project.id,
            # Set default RAG parameters explicitly
            chat_top_k=8,
            chat_similarity_threshold=0.7,
            chat_max_tokens=1000,
            chat_use_reranker=False
        )
        db.add(chatbot_settings)
        db.commit()
        db.refresh(chatbot_settings)
    
    # Convert to ChatConfigOut format
    config_data = _chatbot_settings_to_chat_config_out(
        chatbot_settings, db=db, user_id=current_user.id
    )
        
    return create_success_response(
        data=config_data,
        message="Chat Config retrieved successfully"
    )

def _get_static_api_key() -> str:
    """
    Returns a single static API key for custom-llm.
    This same key is used for all users when they select custom LLM.
    Format similar to OpenAI keys: rag-suite_{long random alphanumeric string}
    """
    # Single static API key for all custom LLM users — rotate via CUSTOM_LLM_INTERNAL_API_KEY env var
    return settings.custom_llm_internal_api_key

@router.post("/", response_model=ApiResponse)
def update_chat_config(
    config_in: ChatConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    project_id: Optional[str] = Query(None),
):
    from ..utils.api_key import (
        is_masked_api_key,
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
    )

    # Prefer explicit project_id so UI project matches stored keys during switch races
    active_project = _resolve_project_for_model_test(db, current_user, project_id)
    
    # Get or create chatbot_settings for this project
    chatbot_settings = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == active_project.id
        )
    ).first()
    
    if not chatbot_settings:
        chatbot_settings = ChatbotSettings(
            user_id=current_user.id,
            project_id=active_project.id
        )
        db.add(chatbot_settings)
    
    update_data = config_in.model_dump(exclude_unset=True)
    
    # For chat configuration, explicitly exclude search_model and all search_* fields
    # Chat and search models should be updated independently
    search_fields = ["search_model", "search_temperature", "search_top_p", "search_best_of", 
                     "search_frequency_penalty", "search_presence_penalty"]
    for field in search_fields:
        if field in update_data:
            update_data.pop(field)
            logger.info(f"Excluded {field} from chat config update for user {current_user.id}")
    
    # Normalize provider name
    provider = update_data.get("model_provider", chatbot_settings.model_provider or "").lower()
    if "custom" in provider or "ollama" in provider:
        provider_normalized = "ollama"
    else:
        provider_normalized = normalize_provider_for_connection_test(provider) or provider
    
    # If provider is custom-llm/ollama, do NOT overwrite a real hosted API key with the
    # internal static placeholder (OpenAI→Ollama→OpenAI used to destroy the OpenAI key).
    if provider_normalized == "ollama":
        update_data["model_provider"] = "ollama"
        static_key = (_get_static_api_key() or "").strip()
        existing = (getattr(chatbot_settings, "api_key", None) or "").strip()
        if existing and existing != static_key:
            update_data.pop("api_key", None)
        else:
            update_data["api_key"] = static_key
    else:
        # SECURITY: if frontend echoed back a masked key (contains '...'), discard it —
        # do NOT overwrite the real stored key with the masked sentinel value.
        incoming_key = update_data.get("api_key")
        if incoming_key and (is_masked_api_key(incoming_key) or "..." in str(incoming_key)):
            update_data.pop("api_key")
            logger.debug("Discarded masked api_key echo from frontend for user %s", current_user.id)

        # When switching to a provider with a cached profile key and no new key typed,
        # restore that provider's key into active settings (never delete other providers).
        if "api_key" not in update_data:
            profile_key = resolve_stored_provider_api_key(
                db,
                user_id=current_user.id,
                project_id=active_project.id,
                provider=provider_normalized,
                profile_type="chat",
                settings_api_key=chatbot_settings.api_key,
                settings_provider=chatbot_settings.model_provider,
            )
            current_family = normalize_provider_for_connection_test(chatbot_settings.model_provider)
            if profile_key and (
                current_family != provider_normalized
                or not (chatbot_settings.api_key or "").strip()
            ):
                update_data["api_key"] = profile_key

    # Update only chat-specific fields
    allowed_fields = [
        "model_provider", "chat_model", "embedding_model", "api_key",
        "chat_temperature", "chat_top_p", "chat_best_of", 
        "chat_frequency_penalty", "chat_presence_penalty",
        "chat_top_k", "chat_similarity_threshold", "chat_max_tokens", "chat_use_reranker"
    ]
    
    for key, value in update_data.items():
        if key in allowed_fields:
            setattr(chatbot_settings, key, value)
        
    db.commit()
    db.refresh(chatbot_settings)

    from ..services.reindex_service import invalidate_item_embedding_coverage_cache
    from .embeddings import invalidate_embedding_status_cache

    invalidate_item_embedding_coverage_cache(str(active_project.id))
    invalidate_embedding_status_cache(str(active_project.id))

    _upsert_chat_model_config_profile(db, current_user.id, chatbot_settings)

    emit_audit(
        event_type="config.chat_model.updated",
        request=request,
        user_id=current_user.id,
        project_id=active_project.id,
        resource_type="chatbot_settings",
        resource_id=str(chatbot_settings.id),
        summary="Chat model configuration updated",
    )

    # Convert to ChatConfigOut format
    config_data = _chatbot_settings_to_chat_config_out(
        chatbot_settings, db=db, user_id=current_user.id
    )
    
    return create_success_response(
        data=config_data,
        message="Chat Config updated successfully"
    )

def _upsert_chat_model_config_profile(db, user_id: int, chatbot_settings) -> None:
    """Sync ChatbotSettings model into ModelConfigProfile (profile_type='chat') for compare feature."""
    from ..models import ModelConfigProfile
    from sqlalchemy import and_
    from ..utils.api_key import normalize_provider_for_connection_test

    provider = (chatbot_settings.model_provider or "ollama").lower()
    provider_key = normalize_provider_for_connection_test(provider)
    model_name = chatbot_settings.chat_model or ""
    if not model_name:
        return
    try:
        project_id = getattr(chatbot_settings, "project_id", None)
        extra = {k: v for k, v in {
            "temperature": chatbot_settings.chat_temperature,
            "top_p": chatbot_settings.chat_top_p,
            "max_tokens": chatbot_settings.chat_max_tokens,
        }.items() if v is not None}
        existing = db.query(ModelConfigProfile).filter(and_(
            ModelConfigProfile.user_id == user_id,
            ModelConfigProfile.project_id == project_id,
            ModelConfigProfile.provider == provider,
            ModelConfigProfile.model_name == model_name,
            ModelConfigProfile.profile_type == "chat",
        )).first()
        if existing:
            existing.api_key = chatbot_settings.api_key
            existing.extra_params = extra or None
        else:
            db.add(ModelConfigProfile(
                user_id=user_id,
                project_id=project_id,
                provider=provider,
                model_name=model_name,
                profile_type="chat",
                api_key=chatbot_settings.api_key,
                embedding_model=None,
                compare_enabled=True,
                extra_params=extra or None,
            ))

        if provider_key and provider_key != "ollama" and chatbot_settings.api_key:
            profiles = db.query(ModelConfigProfile).filter(and_(
                ModelConfigProfile.user_id == user_id,
                ModelConfigProfile.project_id == project_id,
                ModelConfigProfile.profile_type == "chat",
            )).all()
            for profile in profiles:
                if normalize_provider_for_connection_test(profile.provider) != provider_key:
                    continue
                if profile.model_name == model_name:
                    continue
                profile.api_key = chatbot_settings.api_key

        db.commit()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Failed to upsert chat ModelConfigProfile: {e}")
        db.rollback()


import asyncio
from ..services.llmconn import LLMFactory

@router.post("/test", response_model=ApiResponse)
async def test_chat_config(
    test_config: TestConfig,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    project_id: Optional[str] = Query(None),
):
    """
    Test the LLM configuration by making a simple request to the provider.
    Uses LLMFactory for Chat interactions and direct instantiation for Embeddings.
    """
    results = {}
    from ..utils.api_key import (
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
        resolve_usable_api_key_for_connection_test,
    )

    provider_key = normalize_provider_for_connection_test(test_config.provider)

    active_project = _resolve_project_for_model_test(db, current_user, project_id)
    chatbot_settings = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == active_project.id,
        )
    ).first()
    stored_key = resolve_stored_provider_api_key(
        db,
        user_id=current_user.id,
        project_id=active_project.id,
        provider=provider_key,
        profile_type="chat",
        settings_api_key=chatbot_settings.api_key if chatbot_settings else None,
        settings_provider=chatbot_settings.model_provider if chatbot_settings else None,
    )
    resolved_api_key, key_failure = resolve_usable_api_key_for_connection_test(
        provider_key,
        test_config.api_key,
        stored_key,
    )

    if key_failure:
        data = {}
        if test_config.chat_model:
            data["chat_model"] = key_failure
        if test_config.embedding_model:
            data["embedding_model"] = key_failure
        if not data:
            data["chat_model"] = key_failure
        return create_success_response(
            data=data,
            message="Configuration test completed",
        )

    if provider_key != "ollama" and not resolved_api_key:
        return create_success_response(
            data={"chat_model": "Failed: No API key provided"},
            message="Configuration test completed",
        )

    loop = asyncio.get_event_loop()
    # Chat is the primary connection probe; embed is optional and only runs after chat succeeds.
    # Keep totals under the frontend ~30s HTTP budget.
    chat_timeout_s = 18
    embed_timeout_s = 8
    probe_timeout_s = 15.0

    async def _run_chat_test() -> str:
        _provider = provider_key
        _model = test_config.chat_model
        _api_key = resolved_api_key

        def _test_chat():
            llm = LLMFactory.get_llm(
                provider=_provider,
                model_name=_model,
                api_key=_api_key,
                allow_ollama_fallback=False,
                request_timeout=probe_timeout_s,
            )
            return str(llm.complete("Reply with Yes."))

        try:
            result = await asyncio.wait_for(loop.run_in_executor(None, _test_chat), timeout=chat_timeout_s)
            return f"Success: {result}"
        except asyncio.TimeoutError:
            return f"Failed: Timed out after {chat_timeout_s}s"
        except Exception as e:
            if provider_key == "mistral":
                return format_mistral_chat_test_failure(_model or "", _api_key or "", e)
            return f"Failed: {str(e)}"

    async def _run_embed_test() -> str:
        _provider = provider_key
        _model = test_config.embedding_model
        _api_key = resolved_api_key

        def _test_embed():
            from ..services.rag.embedder_factory import get_raw_embedder

            embed_model = get_raw_embedder(_provider, _model, _api_key)
            embedding = embed_model.get_text_embedding("Hello")
            return f"Success: Vector of length {len(embedding)} generated"

        try:
            return await asyncio.wait_for(loop.run_in_executor(None, _test_embed), timeout=embed_timeout_s)
        except asyncio.TimeoutError:
            return f"Failed: Timed out after {embed_timeout_s}s"
        except Exception as e:
            return f"Failed: {str(e)}"

    # Run chat then embed on the same request sequentially.
    # Parallel run_in_executor workers race on openai/llama-index lazy imports
    # (importlib _ModuleLock on openai.resources.chat) and surface as
    # "deadlock detected by _ModuleLock(...)" in the UI.
    if test_config.chat_model:
        results["chat_model"] = await _run_chat_test()
    if test_config.embedding_model:
        results["embedding_model"] = await _run_embed_test()

    return create_success_response(
        data=results,
        message="Configuration test completed"
    )


@router.get("/models", status_code=status.HTTP_200_OK)
async def get_available_models(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    project_id: Optional[str] = Query(None),
):
    """
    Get list of available LLM providers and their models.

    Curated catalogs are always returned; when the project has stored API keys,
    live key-scoped models are merged in (additive). Saved chat/embedding ids
    are injected so the current selection cannot disappear from the picker.
    """
    enrichments = None
    try:
        active_project = _resolve_project_for_model_test(db, current_user, project_id)
        chatbot_settings = db.query(ChatbotSettings).filter(
            and_(
                ChatbotSettings.user_id == current_user.id,
                ChatbotSettings.project_id == active_project.id,
            )
        ).first()
        enrichments = build_provider_enrichments(
            db=db,
            user_id=current_user.id,
            project_id=active_project.id,
            profile_type="chat",
            settings_api_key=chatbot_settings.api_key if chatbot_settings else None,
            settings_provider=chatbot_settings.model_provider if chatbot_settings else None,
            selected_chat=chatbot_settings.chat_model if chatbot_settings else None,
            selected_embedding=chatbot_settings.embedding_model if chatbot_settings else None,
        )
    except Exception as exc:
        logger.debug("Available-models enrichment skipped: %s", exc)
        enrichments = None

    return build_available_providers_payload(enrichments=enrichments)

