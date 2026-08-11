from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..db import get_db
from ..auth import get_current_user_required, ensure_project_access
from ..settings import settings
from ..models import User, ChatbotSettings, Project
from ..schemas import ChatConfigCreate, ChatConfigUpdate, ChatConfigOut, LLMConfigUpdate, LLMConfigOut, ApiResponse
from ..defaults import DEFAULT_EMBEDDING_MODEL
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
    if not key:
        return None
    key = key.strip()
    if len(key) <= 8:
        return "*" * len(key)
    return key[:4] + "..." + key[-4:]


def _chatbot_settings_to_chat_config_out(chatbot_settings: ChatbotSettings) -> dict:
    """Convert ChatbotSettings to ChatConfigOut format"""
    return {
        "model_provider": chatbot_settings.model_provider or "ollama",
        "chat_model": chatbot_settings.chat_model or "",
        "search_model": None,  # Not in ChatbotSettings, will be in SearchSettings
        "embedding_model": chatbot_settings.embedding_model if hasattr(chatbot_settings, 'embedding_model') and chatbot_settings.embedding_model else DEFAULT_EMBEDDING_MODEL,
        "api_key": _mask_api_key(chatbot_settings.api_key),  # SECURITY: never return raw key to browser
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
    current_user: User = Depends(get_current_user_required)
):
    # Get active project
    active_project = _get_active_project(db, current_user.id)
    
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
    config_data = _chatbot_settings_to_chat_config_out(chatbot_settings)
        
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
    current_user: User = Depends(get_current_user_required)
):
    # Get active project
    active_project = _get_active_project(db, current_user.id)
    
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
        provider_normalized = provider
    
    # If provider is custom-llm/ollama, use the static API key
    if provider_normalized == "ollama":
        # Always use the static API key for custom LLM
        static_key = _get_static_api_key()
        update_data["api_key"] = static_key
        update_data["model_provider"] = "ollama"  # Normalize to "ollama"
    else:
        # SECURITY: if frontend echoed back a masked key (contains '...'), discard it —
        # do NOT overwrite the real stored key with the masked sentinel value.
        incoming_key = update_data.get("api_key")
        if incoming_key and "..." in incoming_key:
            update_data.pop("api_key")
            logger.debug("Discarded masked api_key echo from frontend for user %s", current_user.id)

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

    invalidate_item_embedding_coverage_cache(str(active_project.id))

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
    config_data = _chatbot_settings_to_chat_config_out(chatbot_settings)
    
    return create_success_response(
        data=config_data,
        message="Chat Config updated successfully"
    )

def _upsert_chat_model_config_profile(db, user_id: int, chatbot_settings) -> None:
    """Sync ChatbotSettings model into ModelConfigProfile (profile_type='chat') for compare feature."""
    from ..models import ModelConfigProfile
    from sqlalchemy import and_
    provider = (chatbot_settings.model_provider or "ollama").lower()
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
    provider_key = test_config.provider.lower()

    # Normalize provider key (same logic as LLMFactory)
    if "google" in provider_key or "gemini" in provider_key:
        provider_key = "gemini"
    elif "mistral" in provider_key:
        provider_key = "mistral"
    elif "anthropic" in provider_key or "claude" in provider_key:
        provider_key = "anthropic"
    elif "openai" in provider_key:
        provider_key = "openai"
    elif "custom" in provider_key or "ollama" in provider_key:
        provider_key = "ollama"

    from ..utils.api_key import resolve_api_key_for_test

    active_project = _resolve_project_for_model_test(db, current_user, project_id)
    chatbot_settings = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == active_project.id,
        )
    ).first()
    stored_key = chatbot_settings.api_key if chatbot_settings else None
    resolved_api_key = resolve_api_key_for_test(test_config.api_key, stored_key)

    if not resolved_api_key:
        return create_success_response(
            data={"chat_model": "Failed: No API key provided"},
            message="Configuration test completed",
        )

    loop = asyncio.get_event_loop()
    # Keep headroom under the frontend 15s request timeout (chat + embed sequential).
    test_timeout_s = 10

    async def _run_chat_test() -> str:
        _provider = provider_key
        _model = test_config.chat_model
        _api_key = resolved_api_key

        def _test_chat():
            llm = LLMFactory.get_llm(provider=_provider, model_name=_model, api_key=_api_key)
            return str(llm.complete("Hello, simply reply with 'Yes' if you are working."))

        try:
            result = await asyncio.wait_for(loop.run_in_executor(None, _test_chat), timeout=test_timeout_s)
            return f"Success: {result}"
        except asyncio.TimeoutError:
            return f"Failed: Timed out after {test_timeout_s}s"
        except Exception as e:
            return f"Failed: {str(e)}"

    async def _run_embed_test() -> str:
        _provider = provider_key
        _model = test_config.embedding_model
        _api_key = resolved_api_key

        def _test_embed():
            from ..services.rag.embedder_factory import get_raw_embedder

            embed_model = get_raw_embedder(_provider, _model, _api_key)
            embedding = embed_model.get_text_embedding("Hello world")
            return f"Success: Vector of length {len(embedding)} generated"

        try:
            return await asyncio.wait_for(loop.run_in_executor(None, _test_embed), timeout=test_timeout_s)
        except asyncio.TimeoutError:
            return f"Failed: Timed out after {test_timeout_s}s"
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
    current_user: User = Depends(get_current_user_required)
):
    """
    Get list of available LLM providers and their models
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
            "chat_models": [
                {"name": "Mistral Large", "value": "mistral-large-latest"},
            ],
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

