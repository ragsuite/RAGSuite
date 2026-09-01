from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_, not_
from ..db import get_db
from ..auth import get_current_user_required, get_project_id_or_user, resolve_embed_project_context, ensure_project_access
from ..settings import settings
from ..models import User, SearchSettings, Project, ModelConfigProfile
from ..defaults import DEFAULT_EMBEDDING_MODEL
from ..utils.mistral_models import MISTRAL_CHAT_MODEL_CATALOG, format_mistral_chat_test_failure
from ..services.audit_service import emit_audit
from ..schemas import (
    LLMConfigCreate, LLMConfigUpdate, LLMConfigOut, ApiResponse, ResponseType,
    SearchConfigurationUpdate, SearchConfigurationOut,
    SearchCustomizationUpdate, SearchCustomizationOut
)
from pydantic import BaseModel
from typing import Optional, List
import logging
import uuid

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/search/models",
    tags=["Search Models"]
)


def _mask_api_key(key: Optional[str]) -> Optional[str]:
    """Return masked api_key safe to send to the browser (first-4 + '...' + last-4)."""
    from ..utils.api_key import mask_api_key

    return mask_api_key(key)

class TestSearchConfig(BaseModel):
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

def _get_static_api_key() -> str:
    """
    Returns a single static API key for custom-llm.
    This same key is used for all users when they select custom LLM.
    Format similar to OpenAI keys: rag-suite_{long random alphanumeric string}
    """
    # Single static API key for all custom LLM users — rotate via CUSTOM_LLM_INTERNAL_API_KEY env var
    return settings.custom_llm_internal_api_key

def _get_active_project(db: Session, user_id: int) -> Project:
    """Get active non-temp project for a user (ACL-aware)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(
            status_code=404,
            detail="No active project found. Please activate a project first."
        )
    from ..auth import ensure_user_active_project
    active_project = ensure_user_active_project(db, user)
    if not active_project:
        raise HTTPException(
            status_code=404,
            detail="No active project found. Please activate a project first."
        )
    return active_project


def _resolve_project_for_search_models(
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

def _search_settings_to_llm_config_out(
    search_settings: SearchSettings,
    *,
    db: Optional[Session] = None,
    user_id: Optional[int] = None,
) -> dict:
    """Convert SearchSettings to LLMConfigOut format"""
    from ..utils.api_key import build_provider_api_key_masks

    # Get response_type from search_response_config
    response_type = ResponseType.LONG.value  # Default to "long"
    if search_settings.search_response_config and isinstance(search_settings.search_response_config, dict):
        saved_type = search_settings.search_response_config.get("response_type")
        if saved_type:
            response_type = saved_type

    provider_api_keys = {}
    if db is not None and user_id is not None:
        provider_api_keys = build_provider_api_key_masks(
            db,
            user_id=user_id,
            project_id=search_settings.project_id,
            profile_type="search",
            active_provider=search_settings.model_provider,
            active_api_key=search_settings.api_key,
        )
    
    return {
        "model_provider": search_settings.model_provider or "ollama",
        "search_model": search_settings.search_model,
        "embedding_model": search_settings.embedding_model if search_settings.embedding_model else DEFAULT_EMBEDDING_MODEL,
        "api_key": _mask_api_key(search_settings.api_key),  # SECURITY: never return raw key to browser
        "provider_api_keys": provider_api_keys,
        "search_temperature": search_settings.search_temperature,
        "search_top_p": search_settings.search_top_p,
        "search_best_of": search_settings.search_best_of,
        "search_frequency_penalty": search_settings.search_frequency_penalty,
        "search_presence_penalty": search_settings.search_presence_penalty,
        "response_type": response_type,  # Add response_type (long/short) for search answers
        # Search-specific RAG parameters
        "search_top_k": search_settings.search_top_k,
        "search_similarity_threshold": search_settings.search_similarity_threshold,
        "search_max_tokens": search_settings.search_max_tokens,
        "search_use_reranker": search_settings.search_use_reranker,
        # Note: Chat fields are NOT included in search config response - use /api/v1/config-models for chat config
    }

@router.get("/", response_model=ApiResponse)
def get_search_model_config(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user),
    project_id: Optional[str] = Query(None),
):
    """
    Get search model configuration - SEARCH ONLY.
    Returns the LLM configuration used specifically for search functionality.
    This endpoint is isolated from chat model configuration.
    """
    user_id = auth_result["user_id"]
    active_project = None

    if auth_result["type"] == "widget":
        project_id = auth_result.get("project_id")
        if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except: pass
    else:
        user = auth_result.get("user") or db.query(User).filter(User.id == user_id).first()
        active_project = _resolve_project_for_search_models(db, user, project_id)
    
    # Get or create search_settings for this project
    # Get or create search_settings for this project
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        # Create default search_settings if not exists
        search_settings = SearchSettings(
            user_id=user_id,
            project_id=active_project.id
        )
        db.add(search_settings)
        db.commit()
        db.refresh(search_settings)
    
    # Convert to LLMConfigOut format
    config_data = _search_settings_to_llm_config_out(
        search_settings, db=db, user_id=user_id
    )
        
    return create_success_response(
        data=config_data,
        message="Search model configuration retrieved successfully"
    )

@router.post("/", response_model=ApiResponse)
def update_search_model_config(
    config_in: LLMConfigUpdate,
    request: Request,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user),
    project_id: Optional[str] = Query(None),
):
    """
    Update search model configuration - SEARCH ONLY.
    Updates the LLM configuration used specifically for search functionality.
    This endpoint is isolated from chat model configuration.
    """
    from ..utils.api_key import (
        is_masked_api_key,
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
    )

    if auth_result["type"] == "widget":
        raise HTTPException(status_code=403, detail="Widgets cannot modify search model configuration")

    user_id = auth_result["user_id"]
    user = auth_result.get("user") or db.query(User).filter(User.id == user_id).first()
    active_project = _resolve_project_for_search_models(db, user, project_id)
    
    # Get or create search_settings for this project
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        search_settings = SearchSettings(
            user_id=user_id,
            project_id=active_project.id
        )
        db.add(search_settings)
    
    update_data = config_in.model_dump(exclude_unset=True)
    
    logger.info(f"🔍 Search config update request for user {user_id}, project {active_project.id}")
    logger.info(f"   Received update_data keys: {list(update_data.keys())}")
    logger.info(f"   Search generation params in request: temperature={update_data.get('search_temperature')}, top_p={update_data.get('search_top_p')}, best_of={update_data.get('search_best_of')}, frequency_penalty={update_data.get('search_frequency_penalty')}, presence_penalty={update_data.get('search_presence_penalty')}")
    
    # For search configuration, convert chat_* generation parameters to search_* parameters
    # This allows the frontend to use the same field names but we store them separately
    generation_param_mapping = {
        "chat_temperature": "search_temperature",
        "chat_top_p": "search_top_p",
        "chat_best_of": "search_best_of",
        "chat_frequency_penalty": "search_frequency_penalty",
        "chat_presence_penalty": "search_presence_penalty"
    }
    
    for chat_field, search_field in generation_param_mapping.items():
        if chat_field in update_data:
            # Convert chat_* to search_* if search_* is not already provided
            if search_field not in update_data:
                update_data[search_field] = update_data.pop(chat_field)
                logger.info(f"Converted {chat_field} to {search_field} for search config update")
            else:
                # If both are provided, use search_* and remove chat_*
                update_data.pop(chat_field)
                logger.info(f"Using {search_field} (ignoring {chat_field}) for search config update")
    
    # For search configuration, convert chat_* RAG parameters to search_* parameters
    rag_param_mapping = {
        "chat_top_k": "search_top_k",
        "chat_similarity_threshold": "search_similarity_threshold",
        "chat_max_tokens": "search_max_tokens",
        "chat_use_reranker": "search_use_reranker"
    }
    
    for chat_field, search_field in rag_param_mapping.items():
        if chat_field in update_data:
            # Convert chat_* to search_* if search_* is not already provided
            if search_field not in update_data:
                update_data[search_field] = update_data.pop(chat_field)
                logger.info(f"Converted {chat_field} to {search_field} for search config update")
            else:
                # If both are provided, use search_* and remove chat_*
                update_data.pop(chat_field)
                logger.info(f"Using {search_field} (ignoring {chat_field}) for search config update")
    
    # For search configuration, if chat_model is provided, save it to search_model instead
    # This allows the frontend to use the same field name but we store it separately
    if "chat_model" in update_data:
        update_data["search_model"] = update_data.pop("chat_model")
        logger.info(f"Converted chat_model to search_model for search config update")
    
    # Normalize provider name
    provider = update_data.get("model_provider", search_settings.model_provider or "").lower()
    if "custom" in provider or "ollama" in provider:
        provider_normalized = "ollama"
    else:
        provider_normalized = normalize_provider_for_connection_test(provider) or provider
    
    # If provider is custom-llm/ollama, do NOT overwrite a real hosted API key with the
    # internal static placeholder (OpenAI→Ollama→OpenAI used to destroy the OpenAI key).
    if provider_normalized == "ollama":
        update_data["model_provider"] = "ollama"
        static_key = (_get_static_api_key() or "").strip()
        existing = (getattr(search_settings, "api_key", None) or "").strip()
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
            logger.debug("Discarded masked api_key echo from frontend (search) for user %s", user_id)

        if "api_key" not in update_data:
            profile_key = resolve_stored_provider_api_key(
                db,
                user_id=user_id,
                project_id=active_project.id,
                provider=provider_normalized,
                profile_type="search",
                settings_api_key=search_settings.api_key,
                settings_provider=search_settings.model_provider,
            )
            current_family = normalize_provider_for_connection_test(search_settings.model_provider)
            if profile_key and (
                current_family != provider_normalized
                or not (search_settings.api_key or "").strip()
            ):
                update_data["api_key"] = profile_key

    # Handle response_type separately (it's stored in search_response_config JSON field)
    if "response_type" in update_data:
        response_type_value = update_data.pop("response_type")
        # Validate response_type
        if response_type_value not in [ResponseType.LONG.value, ResponseType.SHORT.value]:
            logger.warning(f"Invalid response_type '{response_type_value}', ignoring")
        else:
            # Get existing response config or create new one
            current_config = search_settings.search_response_config
            if not isinstance(current_config, dict):
                current_config = {}
            
            # Update response_type in the config
            current_config["response_type"] = response_type_value
            search_settings.search_response_config = current_config
            logger.info(f"   Setting response_type = {response_type_value} in search_response_config")
    
    # Update only search-specific fields
    allowed_fields = [
        "model_provider", "search_model", "embedding_model", "api_key",
        "search_temperature", "search_top_p", "search_best_of",
        "search_frequency_penalty", "search_presence_penalty",
        # Search-specific RAG parameters
        "search_top_k", "search_similarity_threshold", "search_max_tokens", "search_use_reranker"
    ]
    
    logger.info(f"   Allowed fields: {allowed_fields}")
    logger.info(f"   Fields to update after filtering: {[k for k in update_data.keys() if k in allowed_fields]}")
    
    for key, value in update_data.items():
        if key in allowed_fields:
            # Convert None to None explicitly, but allow empty strings and 0 values
            # Empty strings for string fields should be set to None
            if value == "" and key in ["search_temperature", "search_top_p", "search_frequency_penalty", "search_presence_penalty"]:
                value = None
            logger.info(f"   Setting {key} = {value} (type: {type(value).__name__})")
            setattr(search_settings, key, value)
        else:
            logger.warning(f"   Skipping {key} (not in allowed_fields)")
        
    db.commit()
    db.refresh(search_settings)

    from ..services.reindex_service import invalidate_item_embedding_coverage_cache
    from .embeddings import invalidate_embedding_status_cache

    invalidate_item_embedding_coverage_cache(str(active_project.id))
    invalidate_embedding_status_cache(str(active_project.id))

    logger.info(f"   ✅ After save - search_temperature={search_settings.search_temperature}, search_top_p={search_settings.search_top_p}, search_best_of={search_settings.search_best_of}, search_frequency_penalty={search_settings.search_frequency_penalty}, search_presence_penalty={search_settings.search_presence_penalty}")

    # Auto-upsert ModelConfigProfile so compare feature always has up-to-date profiles
    _upsert_model_config_profile(db, user_id, search_settings)

    emit_audit(
        event_type="config.search_model.created",
        request=request,
        user_id=user_id,
        project_id=active_project.id,
        resource_type="search_settings",
        resource_id=str(search_settings.id),
        summary="Search model configuration updated",
    )

    # Convert to LLMConfigOut format
    config_data = _search_settings_to_llm_config_out(
        search_settings, db=db, user_id=user_id
    )

    return create_success_response(
        data=config_data,
        message="Search model configuration updated successfully"
    )


def _upsert_model_config_profile(db, user_id: int, search_settings: SearchSettings) -> None:
    """Keep exactly one ModelConfigProfile per provider in sync with SearchSettings."""
    provider = (search_settings.model_provider or "ollama").lower()
    model_name = search_settings.search_model or ""
    if not model_name:
        return
    try:
        project_id = getattr(search_settings, "project_id", None)
        provider_profiles = db.query(ModelConfigProfile).filter(
            and_(
                ModelConfigProfile.user_id == user_id,
                ModelConfigProfile.project_id == project_id,
                ModelConfigProfile.provider == provider,
                ModelConfigProfile.profile_type == "search",
            )
        ).order_by(ModelConfigProfile.updated_at.desc()).all()

        profile = provider_profiles[0] if provider_profiles else None
        extra = {}
        if search_settings.search_temperature:
            extra["temperature"] = search_settings.search_temperature
        if search_settings.search_top_p:
            extra["top_p"] = search_settings.search_top_p
        if search_settings.search_max_tokens:
            extra["max_tokens"] = search_settings.search_max_tokens
        if profile:
            profile.model_name = model_name
            profile.api_key = search_settings.api_key
            profile.embedding_model = search_settings.embedding_model
            profile.extra_params = extra or None
            # Keep provider and model switch behavior predictable: newest choice wins.
            for duplicate in provider_profiles[1:]:
                db.delete(duplicate)
        else:
            profile = ModelConfigProfile(
                user_id=user_id,
                project_id=project_id,
                provider=provider,
                model_name=model_name,
                profile_type="search",
                api_key=search_settings.api_key,
                embedding_model=search_settings.embedding_model,
                compare_enabled=True,
                extra_params=extra or None,
            )
            db.add(profile)
        db.commit()
    except Exception as e:
        logger.warning(f"Failed to upsert ModelConfigProfile: {e}")
        db.rollback()

from ..services.llmconn import LLMFactory

@router.post("/test", response_model=ApiResponse)
async def test_search_model_config(
    test_config: TestSearchConfig,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user),
    project_id: Optional[str] = Query(None),
):
    """
    Test the search model configuration - SEARCH ONLY.
    Tests the LLM configuration by making a simple request to the provider.
    This endpoint is used specifically for testing search model configurations.
    """
    results = {}
    from ..utils.api_key import (
        normalize_provider_for_connection_test,
        resolve_stored_provider_api_key,
        resolve_usable_api_key_for_connection_test,
    )

    provider_key = normalize_provider_for_connection_test(test_config.provider)

    stored_key = None
    if auth_result.get("type") == "user":
        user = auth_result["user"]
        try:
            active_project = _resolve_project_for_search_models(db, user, project_id)
            search_settings = db.query(SearchSettings).filter(
                and_(
                    SearchSettings.user_id == user.id,
                    SearchSettings.project_id == active_project.id,
                )
            ).first()
            stored_key = resolve_stored_provider_api_key(
                db,
                user_id=user.id,
                project_id=active_project.id,
                provider=provider_key,
                profile_type="search",
                settings_api_key=search_settings.api_key if search_settings else None,
                settings_provider=search_settings.model_provider if search_settings else None,
            )
        except HTTPException:
            stored_key = None

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
        return {
            "success": True,
            "data": data,
            "message": "Configuration test completed",
        }

    if provider_key != "ollama" and not resolved_api_key:
        return {
            "success": True,
            "data": {"chat_model": "Failed: No API key provided"},
            "message": "Configuration test completed",
        }

    import asyncio

    loop = asyncio.get_event_loop()
    chat_timeout_s = 18
    embed_timeout_s = 8
    probe_timeout_s = 15.0

    async def _run_chat_test() -> str:
        def _test_chat():
            llm = LLMFactory.get_llm(
                provider=provider_key,
                model_name=test_config.chat_model,
                api_key=resolved_api_key,
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
                return format_mistral_chat_test_failure(
                    test_config.chat_model or "", resolved_api_key or "", e
                )
            return f"Failed: {str(e)}"

    async def _run_embed_test() -> str:
        def _test_embed():
            from ..services.rag.embedder_factory import get_raw_embedder

            embed_model = get_raw_embedder(provider_key, test_config.embedding_model, resolved_api_key)
            embedding = embed_model.get_text_embedding("Hello")
            return f"Success: Vector of length {len(embedding)} generated"

        try:
            return await asyncio.wait_for(loop.run_in_executor(None, _test_embed), timeout=embed_timeout_s)
        except asyncio.TimeoutError:
            return f"Failed: Timed out after {embed_timeout_s}s"
        except Exception as e:
            return f"Failed: {str(e)}"

    # Sequential probes — parallel executors deadlock on openai lazy imports
    # (_ModuleLock('openai.resources.chat')). Same contract as config-models/test.
    if test_config.chat_model:
        results["chat_model"] = await _run_chat_test()
    if test_config.embedding_model:
        results["embedding_model"] = await _run_embed_test()

    return create_success_response(
        data=results,
        message="Search model configuration test completed"
    )

@router.get("/available", status_code=status.HTTP_200_OK)
async def get_available_search_models(
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Get list of available LLM providers and their models for search - SEARCH ONLY.
    Returns the same model list as config-models but scoped to search functionality.
    """
    return [
        {
            "provider": "OpenAI",
            "value": "openai",
            "chat_models": [
                {"name": "GPT-4", "value": "gpt-4"},
                {"name": "GPT-4 Turbo", "value": "gpt-4-turbo"},
                {"name": "GPT-3.5 Turbo", "value": "gpt-3.5-turbo"},
                {"name": "GPT-4o", "value": "gpt-4o"},
                {"name": "GPT-4o-mini", "value": "gpt-4o-mini"},
                {"name": "GPT-5.4", "value": "gpt-5.4"},
                {"name": "GPT-5.4 Pro", "value": "gpt-5.4-pro"},
                {"name": "GPT-5.4 Mini", "value": "gpt-5.4-mini"},
                {"name": "GPT-5.4 Nano", "value": "gpt-5.4-nano"}
            ],
            "embedding_models": [
                {"name": "Text Embedding 3 Large", "value": "text-embedding-3-large"},
                {"name": "Text Embedding 3 Small", "value": "text-embedding-3-small"},
            ]
        },
        {
            "provider": "Anthropic",
            "value": "anthropic",
            "chat_models": [
                {"name": "Claude 3 Opus", "value": "claude-3-opus-20240229"},
                {"name": "Claude 3 Sonnet", "value": "claude-3-sonnet-20240229"},
                {"name": "Claude 3 Haiku", "value": "claude-3-haiku-20240307"},
                {"name": "Claude 3.5 Sonnet", "value": "claude-3-5-sonnet-20240620"}
            ],
            "embedding_models": []
        },
        {
            "provider": "Mistral",
            "value": "mistral",
            "chat_models": MISTRAL_CHAT_MODEL_CATALOG,
            "embedding_models": [
                {"name": "Mistral Embed", "value": "mistral-embed"}
            ]
        },
        {
            "provider": "Google Gemini",
            "value": "gemini",
            "chat_models": [
                {"name": "Gemini 2.0 Flash-lite", "value": "gemini-2.0-flash-lite"},
                {"name": "Gemini 2.0 Flash", "value": "gemini-2.0-flash"},
                {"name": "Gemini 3 Flash", "value": "gemini-3-flash-preview"}
            ],
            "embedding_models": [
                {"name": "Gemini Embedding 001", "value": "gemini-embedding-001"}
            ]
        },
        {
            "provider": "Custom LLM / Ollama",
            "value": "ollama",
            "chat_models": [
                {"name": "Custom Model (Default)", "value": "custom-default"},
                {"name": "Llama 3 8B", "value": "llama3:8b"},
                {"name": "Mistral", "value": "mistral"},
                {"name": "Gemma 2", "value": "gemma2"},
                {"name": "Gemma 3 27B Cloud", "value": "gemma3:27b-cloud"},
                {"name": "Gemma 4 31B Cloud", "value": "gemma4:31b-cloud"}
            ],
            "embedding_models": [
                {"name": "Jina v2 Base DE", "value": "jina/jina-embeddings-v2-base-de"}
            ]
        }
    ]

# Second router for search configuration and customization
search_config_router = APIRouter(
    prefix="/api/v1/search",
    tags=["Search Configuration"]
)

from ..auth import get_project_id_or_user, resolve_embed_project_context

@search_config_router.get("/configuration", response_model=SearchConfigurationOut)
async def get_search_configuration(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """Get search configuration settings"""
    # Extract user_id and active_project based on auth type
    user_id = auth_result["user_id"]
    
    # Logic to get active project (reused from auth/rag)
    # If widget, we already have project_id in auth_result if valid
    active_project = None
    if auth_result["type"] == "widget":
         project_id = auth_result.get("project_id")
         if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except:             pass
    elif auth_result["type"] == "api_key":
        active_project, user_id = resolve_embed_project_context(auth_result, db)
    else:
        active_project = _get_active_project(db, user_id)
        
    if not active_project:
        # Fallback for safety, though authed user should have one via _get_active_project
        # and widget should have one via auth check
        raise HTTPException(status_code=404, detail="Project not found")

    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        # Return defaults
        return SearchConfigurationOut(
            title=None,
            feedback_enabled=True,
            language="en",
            styleOption="plugin",
            boxLayout="box",
            searchIcon="search",
            loaderType="skeleton",
            background="#d5d4d4",
            textColor="#000000",
            borderRadius="semi-rounded",
            resultStyle="list"
        )
    
    return SearchConfigurationOut(
        title=search_settings.search_title,
        feedback_enabled=bool(getattr(search_settings, "feedback_enabled", True)),
        language=search_settings.search_language or "en",
        styleOption=search_settings.search_style_option or "plugin",
        boxLayout=search_settings.search_box_layout or "box",
        searchIcon=search_settings.search_icon or "search",
        loaderType=search_settings.search_loader_type or "skeleton",
        background=search_settings.search_background_color or "#d5d4d4",
        textColor=search_settings.search_text_color or "#000000",
        borderRadius=search_settings.search_border_radius or "semi-rounded",
        resultStyle=search_settings.search_result_style or "list"
    )

@search_config_router.post("/configuration")
async def update_search_configuration(
    config: SearchConfigurationUpdate,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """Update search configuration settings"""
    user_id = auth_result["user_id"]
    active_project = None

    if auth_result["type"] == "widget":
        project_id = auth_result.get("project_id")
        if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except: pass
    else:
        active_project = _get_active_project(db, user_id)
    
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        # Create new search settings
        search_settings = SearchSettings(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=active_project.id
        )
        db.add(search_settings)
    
    # Update fields
    if config.title is not None:
        search_settings.search_title = config.title
    if config.feedback_enabled is not None:
        search_settings.feedback_enabled = config.feedback_enabled
    if config.language is not None:
        search_settings.search_language = config.language
    if config.styleOption is not None:
        search_settings.search_style_option = config.styleOption
    if config.boxLayout is not None:
        search_settings.search_box_layout = config.boxLayout
    if config.searchIcon is not None:
        search_settings.search_icon = config.searchIcon
    if config.loaderType is not None:
        search_settings.search_loader_type = config.loaderType
    if config.background is not None:
        search_settings.search_background_color = config.background
    if config.textColor is not None:
        search_settings.search_text_color = config.textColor
    if config.borderRadius is not None:
        search_settings.search_border_radius = config.borderRadius
    if config.resultStyle is not None:
        search_settings.search_result_style = config.resultStyle
    
    db.commit()
    db.refresh(search_settings)
    
    return create_success_response(
        data=SearchConfigurationOut(
            title=search_settings.search_title,
            feedback_enabled=bool(getattr(search_settings, "feedback_enabled", True)),
            language=search_settings.search_language,
            styleOption=search_settings.search_style_option,
            boxLayout=search_settings.search_box_layout,
            searchIcon=search_settings.search_icon,
            loaderType=search_settings.search_loader_type,
            background=search_settings.search_background_color,
            textColor=search_settings.search_text_color,
            borderRadius=search_settings.search_border_radius,
            resultStyle=search_settings.search_result_style
        ),
        message="Search configuration updated successfully"
    )

@search_config_router.get("/customization", response_model=SearchCustomizationOut)
async def get_search_customization(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """Get search customization settings"""
    # Extract user_id and active_project based on auth type
    user_id = auth_result["user_id"]
    
    # Logic to get active project (reused from auth/rag)
    active_project = None
    if auth_result["type"] == "widget":
         project_id = auth_result.get("project_id")
         if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except:             pass
    elif auth_result["type"] == "api_key":
        active_project, user_id = resolve_embed_project_context(auth_result, db)
    else:
        active_project = _get_active_project(db, user_id)
        
    if not active_project:
        raise HTTPException(status_code=404, detail="Project not found")

    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        # Return defaults
        return SearchCustomizationOut(
            searchFormType="withBtn",
            buttonType="icon",
            searchButtonText="Search",
            searchInputPlaceholder=None,
            recentSearch=True,
            recentSearchTitle=None,
            showSpeechInput=True,
            showSpeechOutput=True,
            predefinedQuestions=False,
            questionsPosition="below-search",
            questionsLimit=5,
            questions=[]
        )
    
    return SearchCustomizationOut(
        searchFormType=search_settings.search_form_type or "withBtn",
        buttonType=search_settings.search_button_type or "icon",
        searchButtonText=search_settings.search_button_text or "Search",
        searchInputPlaceholder=search_settings.search_input_placeholder,
        recentSearch=search_settings.search_recent_search if search_settings.search_recent_search is not None else True,
        recentSearchTitle=search_settings.search_recent_search_title,
        showSpeechInput=bool(getattr(search_settings, "search_show_speech_input", True)),
        showSpeechOutput=bool(getattr(search_settings, "search_show_speech_output", True)),
        predefinedQuestions=search_settings.search_predefined_questions if search_settings.search_predefined_questions is not None else False,
        questionsPosition=search_settings.search_questions_position or "below-search",
        questionsLimit=search_settings.search_questions_limit or 5,
        questions=search_settings.search_questions if search_settings.search_questions else []
    )

@search_config_router.post("/customization")
async def update_search_customization(
    customization: SearchCustomizationUpdate,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """Update search customization settings"""
    user_id = auth_result["user_id"]
    active_project = None
    
    if auth_result["type"] == "widget":
        project_id = auth_result.get("project_id")
        if project_id:
             try:
                 project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                 active_project = db.query(Project).filter(Project.id == project_uuid).first()
             except: pass
    else:
        active_project = _get_active_project(db, user_id)
    
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == user_id,
            SearchSettings.project_id == active_project.id
        )
    ).first()
    
    if not search_settings:
        # Create new search settings
        search_settings = SearchSettings(
            id=uuid.uuid4(),
            user_id=user_id,
            project_id=active_project.id
        )
        db.add(search_settings)
    
    # Update fields
    if customization.searchFormType is not None:
        search_settings.search_form_type = customization.searchFormType
    if customization.buttonType is not None:
        search_settings.search_button_type = customization.buttonType
    if customization.searchButtonText is not None:
        search_settings.search_button_text = customization.searchButtonText
    if customization.searchInputPlaceholder is not None:
        search_settings.search_input_placeholder = customization.searchInputPlaceholder
    if customization.recentSearch is not None:
        search_settings.search_recent_search = customization.recentSearch
    if customization.recentSearchTitle is not None:
        search_settings.search_recent_search_title = customization.recentSearchTitle
    if customization.showSpeechInput is not None:
        search_settings.search_show_speech_input = customization.showSpeechInput
    if customization.showSpeechOutput is not None:
        search_settings.search_show_speech_output = customization.showSpeechOutput
    if customization.predefinedQuestions is not None:
        search_settings.search_predefined_questions = customization.predefinedQuestions
    if customization.questionsPosition is not None:
        search_settings.search_questions_position = customization.questionsPosition
    if customization.questionsLimit is not None:
        search_settings.search_questions_limit = customization.questionsLimit
    if customization.questions is not None:
        # Serialize questions: handle both strings and PredefinedQuestion objects
        serialized_questions = []
        for q in customization.questions:
            if hasattr(q, "model_dump"):
                serialized_questions.append(q.model_dump())
            elif hasattr(q, "dict"):
                 # Fallback for older Pydantic versions if needed, though model_dump is v2
                serialized_questions.append(q.dict())
            else:
                serialized_questions.append(q)
        search_settings.search_questions = serialized_questions
    
    db.commit()
    db.refresh(search_settings)
    
    return create_success_response(
        data=SearchCustomizationOut(
            searchFormType=search_settings.search_form_type,
            buttonType=search_settings.search_button_type,
            searchButtonText=search_settings.search_button_text,
            searchInputPlaceholder=search_settings.search_input_placeholder,
            recentSearch=search_settings.search_recent_search,
            recentSearchTitle=search_settings.search_recent_search_title,
            showSpeechInput=bool(getattr(search_settings, "search_show_speech_input", True)),
            showSpeechOutput=bool(getattr(search_settings, "search_show_speech_output", True)),
            predefinedQuestions=search_settings.search_predefined_questions,
            questionsPosition=search_settings.search_questions_position,
            questionsLimit=search_settings.search_questions_limit,
            questions=search_settings.search_questions or []
        ),
        message="Search customization updated successfully"
    )


def _mask_api_key(key: Optional[str]) -> Optional[str]:
    if not key:
        return None
    if len(key) <= 8:
        return "****"
    return key[:4] + "****" + key[-2:]
