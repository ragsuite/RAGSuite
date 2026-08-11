"""
Prompt API Routes - Works like search but with custom system prompt
"""
from fastapi import APIRouter, Depends, HTTPException, Body, BackgroundTasks
from sqlalchemy.orm import Session
from sqlalchemy import and_, not_
import logging
import time
import uuid
import asyncio
import functools
from datetime import datetime, timezone

from typing import Optional
from ..db import get_db
from ..auth import get_current_user_or_api_key
from ..schemas import PromptRequest, PromptUpdateRequest, ApiResponse
from ..models import ChatbotSettings, SearchSettings, Project, ChatMessage, QueryLog
from ..routes.rag import create_success_response, rag_pipeline, RAG_AVAILABLE, _get_chatbot_settings_query, _get_active_project, _refine_answer

router = APIRouter(
    prefix="/api/v1/prompt",
    tags=["Prompt Engineering"]
)

logger = logging.getLogger(__name__)

@router.get("", summary="Get Current System Prompt")
async def get_system_prompt(
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """
    Get the current system prompt for the user's active project.
    Returns the stored prompt or a default prompt if none is set.
    """
    # Determine user_id
    auth_type = auth_result.get("type")
    user_id = None
    api_key_project_id = None
    if auth_type == "user":
        user_id = auth_result["user"].id
    elif auth_type == "api_key":
        ak = auth_result["api_key"]
        if getattr(ak, "created_by_id", None):
            user_id = ak.created_by_id
        if getattr(ak, "project_id", None):
            api_key_project_id = ak.project_id

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="User authentication required"
        )

    # For API keys, use the key's scoped project; fall back to user's active project
    if api_key_project_id:
        from ..models import Project as ProjectModel
        project = db.query(ProjectModel).filter(
            ProjectModel.id == api_key_project_id,
            ProjectModel.owner_id == user_id
        ).first()
    else:
        project = _get_active_project(db, user_id)
    
    if not project:
        # Return default prompt if no active project
        default_prompt = """You are a helpful AI assistant. Answer questions based on the provided context. 
If the information is not in the context, say so. Be concise and accurate."""
        
        return create_success_response(
            data={
                "system_prompt": default_prompt,
                "project_id": None,
                "is_default": True
            },
            message="Default system prompt (no active project found)"
        )
    
    logger.info(f"Getting prompt for user {user_id}, project {project.id}")
    
    # Try to get stored prompt from ChatbotSettings (using welcome_message as temporary storage)
    # or check if system_prompt field exists
    chatbot_settings = _get_chatbot_settings_query(db).filter(
        and_(
            ChatbotSettings.user_id == user_id,
            ChatbotSettings.project_id == project.id
        )
    ).first()
    
    system_prompt = None
    is_default = True
    
    if chatbot_settings:
        logger.info(f"Found chatbot_settings for GET prompt. short_description: {chatbot_settings.short_description[:100] if chatbot_settings.short_description else 'None'}...")
        # Check if system_prompt field exists (for future migration)
        system_prompt = getattr(chatbot_settings, 'system_prompt', None)
        
        # If not, try to use short_description as temporary storage (prefixed with __PROMPT__)
        if not system_prompt and chatbot_settings.short_description:
            if chatbot_settings.short_description.startswith("__PROMPT__"):
                system_prompt = chatbot_settings.short_description.replace("__PROMPT__", "", 1)
                is_default = False
                logger.info(f"Retrieved system prompt from short_description: {system_prompt[:100]}...")
            else:
                logger.info(f"short_description exists but doesn't start with __PROMPT__: {chatbot_settings.short_description[:100]}...")
        else:
            logger.info(f"No system_prompt field and no short_description found")
    else:
        logger.info(f"No chatbot_settings found for user {user_id}, project {project.id}")
    
    # Default prompt if none is stored
    if not system_prompt:
        default_prompt = """You are a helpful AI assistant. Use ONLY the context below to answer questions.
If the information is not in the context, say so. Be concise and accurate."""
        system_prompt = default_prompt
    
    # Ensure system_prompt is always a string
    if system_prompt is None:
        system_prompt = ""
    system_prompt = str(system_prompt)
    
    return create_success_response(
        data={
            "system_prompt": system_prompt,
            "project_id": str(project.id),
            "is_default": is_default
        },
        message="System prompt retrieved successfully"
    )


@router.put("", summary="Save System Prompt")
@router.post("", summary="Save System Prompt (POST)")
async def save_system_prompt(
    req: PromptUpdateRequest,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """
    Save or update the system prompt for the user's active project.
    Accepts both PUT and POST methods.
    """
    # Determine user_id
    auth_type = auth_result.get("type")
    user_id = None
    api_key_project_id = None
    if auth_type == "user":
        user_id = auth_result["user"].id
    elif auth_type == "api_key":
        ak = auth_result["api_key"]
        if getattr(ak, "created_by_id", None):
            user_id = ak.created_by_id
        if getattr(ak, "project_id", None):
            api_key_project_id = ak.project_id

    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="User authentication required"
        )

    # For API keys, use the key's scoped project; fall back to user's active project
    if api_key_project_id:
        from ..models import Project as ProjectModel
        active_project = db.query(ProjectModel).filter(
            ProjectModel.id == api_key_project_id,
            ProjectModel.owner_id == user_id
        ).first()
    else:
        active_project = _get_active_project(db, user_id)

    if not active_project:
        raise HTTPException(
            status_code=404,
            detail="No active project found. Please create or activate a project first."
        )

    logger.info(f"Saving prompt for user {user_id}, project {active_project.id}")
    
    # Get or create ChatbotSettings
    chatbot_settings = _get_chatbot_settings_query(db).filter(
        and_(
            ChatbotSettings.user_id == user_id,
            ChatbotSettings.project_id == active_project.id
        )
    ).first()
    
    if chatbot_settings:
        # Update existing settings
        # Save to short_description with __PROMPT__ prefix
        # Only overwrite if it's not already a prompt, or always overwrite for prompt updates
        old_short_desc = chatbot_settings.short_description
        chatbot_settings.short_description = f"__PROMPT__{req.system_prompt}"
        db.commit()
        db.refresh(chatbot_settings)
        logger.info(f"Updated system prompt for user {user_id}, project {active_project.id}. Old: {old_short_desc[:50] if old_short_desc else 'None'}..., New: {req.system_prompt[:50]}...")
        logger.info(f"After save, short_description is: {chatbot_settings.short_description[:100]}...")
    else:
        # Create new ChatbotSettings entry
        chatbot_settings = ChatbotSettings(
            user_id=user_id,
            project_id=active_project.id,
            short_description=f"__PROMPT__{req.system_prompt}"
        )
        db.add(chatbot_settings)
        db.commit()
        db.refresh(chatbot_settings)
        logger.info(f"Created system prompt for user {user_id}, project {active_project.id}. Saved: {chatbot_settings.short_description[:100]}...")
    
    return create_success_response(
        data={
            "system_prompt": req.system_prompt,
            "project_id": str(active_project.id)
        },
        message="System prompt saved successfully"
    )


# Define the search implementation function (without route decorator) so it can be called by both endpoints
async def _prompt_search_impl(
    req: PromptRequest,
    db: Session,
    auth_result: dict,
    background_tasks: Optional[BackgroundTasks] = None,
):
    """
    Execute a search query with a custom system prompt.
    
    This endpoint works like the search endpoint but uses a custom system_prompt
    from the request instead of the stored prompt. It returns search results with sources.
    """
    if not RAG_AVAILABLE or rag_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline is not available. Please check server logs for details."
        )
    
    start_time = time.time()
    
    # Determine user_id and api_key_id for scoping and logging
    auth_type = auth_result.get("type")
    api_key_id = None
    user_id = None
    if auth_type == "api_key":
        api_key = auth_result["api_key"]
        api_key_id = api_key.id
        if getattr(api_key, "created_by_id", None) is not None:
            user_id = api_key.created_by_id
    elif auth_type == "user":
        user = auth_result["user"]
        user_id = user.id

    # Get active project for user (if authenticated via user token)
    project_id = None
    active_project = None
    project_uuid = None
    if auth_type == "user" and user_id:
        # First, check if user is in onboarding and has temp project
        from ..routes.onboarding import _ob_get
        onboarding_data = _ob_get(user_id)
        if "data_source" in onboarding_data:
            temp_project_id = onboarding_data["data_source"].get("temp_project_id")
            if temp_project_id:
                temp_project = db.query(Project).filter(
                    and_(
                        Project.id == uuid.UUID(temp_project_id),
                        Project.owner_id == user_id
                    )
                ).first()
                if temp_project:
                    project_id = str(temp_project.id)
                    project_uuid = temp_project.id
                    active_project = temp_project
                    logger.info(f"Using temp project {project_id} for prompt search during onboarding")
        
        # If no temp project, get or create active project
        if not active_project:
            active_project = _get_active_project(db, user_id)
        
        if active_project:
            project_id = str(active_project.id)
            project_uuid = active_project.id
    elif auth_type == "api_key" and api_key:
        # For API keys, use the project_id from the API key if available
        if hasattr(api_key, "project_id") and api_key.project_id:
            project_id = str(api_key.project_id)
            project_uuid = api_key.project_id
    
    # Check document count for this specific project
    if project_id:
        try:
            doc_count = rag_pipeline.vdb.count(user_id=user_id, project_id=project_id)
            logger.info(f"Document count check: user_id={user_id}, project_id={project_id}, count={doc_count}")
            if doc_count == 0:
                logger.warning(f"Count returned 0 for project {project_id}, but proceeding with query to verify")
        except Exception as e:
            logger.error(f"Error checking document count: {e}", exc_info=True)
            logger.warning("Proceeding with query despite count check error")
    else:
        # If no project_id available
        raise HTTPException(
            status_code=503,
            detail="No active project found. Please create or activate a project first."
        )

    # Fetch LLM Configuration from SearchSettings (project-scoped)
    llm_config_dict = None
    if user_id and project_id and project_uuid:
        search_settings = db.query(SearchSettings).filter(
            and_(
                SearchSettings.user_id == user_id,
                SearchSettings.project_id == project_uuid
            )
        ).first()
        if search_settings:
            # Normalize provider name to ensure consistency
            provider = search_settings.model_provider or ""
            provider_lower = provider.lower()
            if "custom" in provider_lower or "ollama" in provider_lower:
                provider_normalized = "ollama"
            else:
                provider_normalized = provider_lower
            
            # Use search_model if available, otherwise fallback to chat_model from ChatbotSettings
            search_model = search_settings.search_model
            if not search_model:
                # Fallback to chat_model from ChatbotSettings
                chatbot_settings = db.query(ChatbotSettings).filter(
                    and_(
                        ChatbotSettings.user_id == user_id,
                        ChatbotSettings.project_id == project_uuid
                    )
                ).first()
                if chatbot_settings:
                    search_model = chatbot_settings.chat_model
            
            llm_config_dict = {
                "provider": provider_normalized,
                "chat_model": search_model or "gpt-4",  # RAG service expects 'chat_model' key, but we pass search_model value
                "api_key": search_settings.api_key
            }
            logger.info(f"Using dynamic LLM config for search (user {user_id}): {llm_config_dict.get('provider')} / {search_model}")

    # Fetch Chatbot Settings for project to get language preference
    chatbot_language = None
    if user_id and project_id:
        chatbot_settings = _get_chatbot_settings_query(db).filter(
            and_(
                ChatbotSettings.user_id == user_id,
                ChatbotSettings.project_id == project_uuid
            )
        ).first()
        if chatbot_settings:
            # Check if search is activated
            is_search_active = True  # Default to True if no settings or column doesn't exist
            if hasattr(chatbot_settings, 'is_search_active'):
                try:
                    is_search_active = chatbot_settings.is_search_active
                except Exception as e:
                    logger.warning(f"Could not read is_search_active: {e}, defaulting to True")
                    is_search_active = True
            
            if not is_search_active:
                raise HTTPException(
                    status_code=403,
                    detail="Search is currently deactivated. Please enable the activation button to use search features."
                )
            
            if chatbot_settings.chatbot_language:
                chatbot_language = chatbot_settings.chatbot_language
                logger.info(f"Using language preference for user {user_id}, project {project_id}: {chatbot_language}")

    # Use the custom system_prompt from the request
    system_prompt = req.system_prompt
    logger.info(f"Using custom system prompt for user {user_id}, project {project_id}")

    loop = asyncio.get_event_loop()
    logger.info(f"Retrieving contexts for prompt search query: {req.query}")

    # Determine max_tokens from request or use default
    max_tokens = req.maxTokens if req.maxTokens else 500

    # Resolve embedding model for this project (prompt-search path → SearchSettings).
    from ..services.rag.embedding_resolver import resolve_for_project as _resolve_emb_for_project
    _prompt_emb_provider, _prompt_emb_model, _prompt_emb_api_key = _resolve_emb_for_project(
        db, project_id, source="search"
    )

    query_fn = functools.partial(
        rag_pipeline.query,
        query=req.query,
        top_k=req.topK,
        max_tokens=max_tokens,
        generate_topk=False,  # Search mode optimization: use snippet extraction instead of LLM generation
        user_id=user_id,
        project_id=project_id,
        llm_config=llm_config_dict,
        language_code=chatbot_language,
        system_prompt=system_prompt,  # Use custom prompt from request
        embedding_provider=_prompt_emb_provider,
        embedding_model=_prompt_emb_model,
        embedding_api_key=_prompt_emb_api_key,
    )
    
    try:
        from ..services.query_runtime import run_query_async

        resp = await run_query_async(query_fn)
    except Exception as e:
        logger.error(f"Error executing RAG query: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error processing query: {str(e)}"
        )

    answer = resp.get("summary")
    raw_contexts = resp.get("raw_contexts", [])
    
    # If query returned empty or no contexts, check if documents actually exist
    if not answer and not raw_contexts:
        try:
            doc_count = rag_pipeline.vdb.count(user_id=user_id, project_id=project_id)
            logger.warning(f"Query returned no results. Document count: {doc_count}")
            if doc_count == 0:
                raise HTTPException(
                    status_code=503,
                    detail="No documents embedded yet for this project. Please upload documents or crawl a website first."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error verifying document count: {e}")
            raise HTTPException(
                status_code=503,
                detail="No relevant documents found for your query. Please try a different search term."
            )
    
    OUT_OF_CONTEXT_MSG = "I am sorry, this query is out of the context of the provided documents."
    OUT_OF_CONTEXT_PHRASE = "out of the context of the provided documents"
    answer_text = answer or ""
    is_out_of_context = OUT_OF_CONTEXT_PHRASE in answer_text.lower()
    
    # Refine answer: Remove raw context markers and citations
    if answer and not is_out_of_context and "LLM failed to respond" not in answer:
        answer = _refine_answer(answer)

    for i, ctx in enumerate(raw_contexts):
        logger.info(f"Raw Context {i + 1}: {ctx}")

    if is_out_of_context or "LLM failed to respond" in answer_text:
        message_id = uuid.uuid4()
        session_id = f"prompt_search_{uuid.uuid4()}"

        if not project_uuid and project_id:
            try:
                project_uuid = uuid.UUID(project_id)
            except (ValueError, TypeError):
                project_uuid = None

        _ooc_elapsed = int((time.time() - start_time) * 1000)
        _ooc_tu = resp.get("token_usage") if isinstance(resp, dict) else {}
        _ooc_puu = project_uuid
        _ooc_ans = answer
        _ooc_mid = message_id
        _ooc_sid = session_id

        def _save_ooc():
            from ..db import SessionLocal
            from ..models import QueryLog
            _db = SessionLocal()
            try:
                if _ooc_puu:
                    _db.add(ChatMessage(
                        id=uuid.uuid4(), user_id=user_id, project_id=_ooc_puu,
                        session_id=_ooc_sid, message_id=_ooc_mid, user_message=req.query,
                        assistant_response=_ooc_ans, message_type="search", sources=[],
                    ))
                    _db.commit()
                _db.add(QueryLog(
                    user_id=user_id, apikey_id=api_key_id if api_key_id else None,
                    project_id=_ooc_puu if _ooc_puu else None,
                    llm_provider=(llm_config_dict or {}).get("provider"),
                    llm_model=(llm_config_dict or {}).get("chat_model"),
                    query=req.query, mode="SEARCH", result_count=0, p95_latency=_ooc_elapsed,
                    prompt_tokens=_ooc_tu.get("prompt_tokens") if _ooc_tu else None,
                    completion_tokens=_ooc_tu.get("completion_tokens") if _ooc_tu else None,
                    total_tokens=_ooc_tu.get("total_tokens") if _ooc_tu else None,
                ))
                _db.commit()
            except Exception as e:
                logger.warning(f"Background OOC DB save failed: {e}")
                _db.rollback()
            finally:
                _db.close()

        if background_tasks:
            background_tasks.add_task(_save_ooc)
        else:
            _save_ooc()

        return create_success_response(
            data={
                "answer": answer,
                "sources": [],
                "message_id": str(message_id),
                "session_id": session_id,
                "retrieval_meta": resp.get("retrieval_meta"),
            },
            message="Search completed: Out of context"
        )

    refined_answers = resp.get("top_k", {})
    urls = resp.get("urls", [])
    chunk_metadatas = resp.get("chunk_metadatas", [])
    raw_contexts_metadatas = resp.get("raw_contexts_metadatas", [])
    
    logger.info(f"RAG Response - refined_answers count: {len(refined_answers)}, urls count: {len(urls)}, metadatas count: {len(chunk_metadatas)}, contexts count: {len(raw_contexts)}")
    logger.info(f"Requested topK: {req.topK}")
    
    sources = []
    refined_items = list(refined_answers.items())
    
    # Track seen URLs and titles to prevent duplicates
    seen_urls = set()
    seen_titles = set()
    
    # First, process refined_answers to get unique results
    import re
    for idx, (title, snippet) in enumerate(refined_items):
        if len(sources) >= req.topK:
            break
            
        # Clean snippet: Remove markers
        if snippet:
            snippet = re.sub(r'Top Searches Found \d+:\s*', '', snippet, flags=re.IGNORECASE)
            snippet = re.sub(r'REFINED_ANSWERS\s*:?\s*', '', snippet, flags=re.IGNORECASE)
            snippet = re.sub(r'RELEVANT_URLS\s*:?\s*.*', '', snippet, flags=re.IGNORECASE)
            snippet = snippet.strip()
        
        source_url = "#"
        source_title = title
        
        # Clean title
        if source_title:
            source_title = re.sub(r'Top Searches Found \d+:\s*', '', source_title, flags=re.IGNORECASE)
            source_title = re.sub(r'REFINED_ANSWERS\s*:?\s*', '', source_title, flags=re.IGNORECASE)
            source_title = source_title.strip()
        
        if idx < len(chunk_metadatas) and chunk_metadatas[idx]:
            meta = chunk_metadatas[idx]
            meta_url = meta.get("url", "") or ""
            if meta_url:
                source_url = meta_url
            meta_title = meta.get("title", "") or ""
            if meta_title:
                source_title = meta_title
        elif idx < len(urls) and urls[idx]:
            source_url = urls[idx]
        
        normalized_url = source_url.rstrip('/').lower() if source_url and source_url != "#" else source_url
        normalized_title = source_title.lower().strip() if source_title else ""
        
        # Check for duplicates
        is_duplicate = False
        if normalized_url != "#" and normalized_url in seen_urls:
            logger.info(f"Skipping duplicate URL: {normalized_url}")
            is_duplicate = True
        elif normalized_title and normalized_title in seen_titles:
            logger.info(f"Skipping duplicate title: {normalized_title[:50]}")
            is_duplicate = True
        
        # Only add if snippet has content and not duplicate
        if not is_duplicate and snippet and len(snippet.strip()) >= 5:
            sources.append({
                "title": source_title,
                "url": source_url,
                "snippet": snippet
            })
            if normalized_url != "#":
                seen_urls.add(normalized_url)
            if normalized_title:
                seen_titles.add(normalized_title)
    
    # If we don't have enough results, fill from raw_contexts
    if len(sources) < req.topK and raw_contexts:
        logger.info(f"Need {req.topK - len(sources)} more sources, checking {len(raw_contexts)} raw contexts")
        for idx, ctx in enumerate(raw_contexts):
            if len(sources) >= req.topK:
                break
            
            source_url = "#"
            source_title = f"Document {idx + 1}"
            
            if idx < len(raw_contexts_metadatas) and raw_contexts_metadatas[idx]:
                meta = raw_contexts_metadatas[idx]
                meta_url = meta.get("url", "") or ""
                if meta_url:
                    source_url = meta_url
                meta_title = meta.get("title", "") or ""
                if meta_title:
                    source_title = meta_title
            
            # Extract meaningful snippet from context
            cleaned_ctx = re.sub(r'\[Document\s+\d+.*?\]', '', ctx)
            cleaned_ctx = re.sub(r'CITE:\d+', '', cleaned_ctx)
            cleaned_ctx = cleaned_ctx.strip()
            
            if len(cleaned_ctx) <= 350:
                snippet = cleaned_ctx
            else:
                snippet = cleaned_ctx[:350]
                last_period = max(snippet.rfind('.'), snippet.rfind('!'), snippet.rfind('?'))
                if last_period > 200:
                    snippet = snippet[:last_period + 1]
                else:
                    snippet = snippet.rstrip() + "..."
            
            if not snippet or len(snippet.strip()) < 10:
                continue
            
            sources.append({
                "title": source_title,
                "url": source_url,
                "snippet": snippet
            })
    
    # Ensure we return exactly topK results
    sources = sources[:req.topK]
    
    message_id = uuid.uuid4()
    session_id = f"prompt_search_{uuid.uuid4()}"
    
    # Ensure we have a project_id
    if not project_uuid and project_id:
        try:
            project_uuid = uuid.UUID(project_id)
        except (ValueError, TypeError):
            project_uuid = None

    elapsed_ms = int((time.time() - start_time) * 1000)
    token_usage = resp.get("token_usage") if isinstance(resp, dict) else {}

    def _save_search():
        from ..db import SessionLocal
        from ..models import QueryLog
        _db = SessionLocal()
        try:
            if project_uuid:
                _db.add(ChatMessage(
                    id=uuid.uuid4(), user_id=user_id, project_id=project_uuid,
                    session_id=session_id, message_id=message_id, user_message=req.query,
                    assistant_response=answer, message_type="search", sources=sources,
                ))
                _db.commit()
            _db.add(QueryLog(
                user_id=user_id, apikey_id=api_key_id if api_key_id else None,
                project_id=project_uuid if project_uuid else None,
                llm_provider=(llm_config_dict or {}).get("provider"),
                llm_model=(llm_config_dict or {}).get("chat_model"),
                query=req.query, mode="SEARCH",
                result_count=len(sources) if sources else 0,
                p95_latency=elapsed_ms,
                prompt_tokens=token_usage.get("prompt_tokens") if token_usage else None,
                completion_tokens=token_usage.get("completion_tokens") if token_usage else None,
                total_tokens=token_usage.get("total_tokens") if token_usage else None,
            ))
            _db.commit()
        except Exception as e:
            logger.warning(f"Background search DB save failed: {e}")
            _db.rollback()
        finally:
            _db.close()

    if background_tasks:
        background_tasks.add_task(_save_search)
    else:
        _save_search()

    return create_success_response(
        data={
            "answer": answer,
            "sources": sources,
            "message_id": str(message_id),
            "session_id": session_id,
            "retrieval_meta": resp.get("retrieval_meta"),
        },
        message=f"Search completed (topK={req.topK})"
    )


# Register the search endpoint
@router.post("/search", summary="Search with Custom System Prompt")
async def prompt_search(
    req: PromptRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """Search endpoint - calls the implementation"""
    return await _prompt_search_impl(req, db, auth_result, background_tasks)


# Note: POST /api/v1/prompt is now used for saving prompts (PromptUpdateRequest)
# Use POST /api/v1/prompt/search for search functionality


@router.post("/chat", summary="Chat with Custom System Prompt")
async def prompt_chat(
    req: PromptRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_current_user_or_api_key)
):
    """
    Chat with documents using a custom system prompt.
    
    This endpoint works like the chat endpoint but uses a custom system_prompt
    from the request instead of the stored prompt. It maintains session history.
    """
    if not RAG_AVAILABLE or rag_pipeline is None:
        raise HTTPException(
            status_code=503,
            detail="RAG pipeline is not available. Please check server logs for details."
        )
    
    loop = asyncio.get_event_loop()
    start_time = time.time()

    user_message = req.query.strip()

    # Get auth info (user or API key) for scoping and logging
    auth_type = auth_result.get("type")
    api_key_id = None
    user_id: Optional[int] = None
    if auth_type == "api_key":
        api_key = auth_result["api_key"]
        api_key_id = api_key.id
        if getattr(api_key, "created_by_id", None) is not None:
            user_id = api_key.created_by_id
    elif auth_type == "user":
        user = auth_result["user"]
        user_id = user.id
    
    # Generate session_id based on date (all chats on same day share one session)
    # Format: prompt_chat_{user_id}_{YYYY-MM-DD} or prompt_chat_{date} if no user_id
    today = datetime.now(timezone.utc).date()
    date_str = today.strftime("%Y-%m-%d")
    if user_id:
        session_id = f"prompt_chat_{user_id}_{date_str}"
    else:
        session_id = f"prompt_chat_{date_str}"

    # Get active project for user (if authenticated via user token)
    project_id: Optional[str] = None
    active_project = None
    project_uuid = None
    if auth_type == "user" and user_id:
        from ..models import Project
        from sqlalchemy import and_, not_
        
        # First, check if user is in onboarding and has temp project
        from ..routes.onboarding import _ob_get
        onboarding_data = _ob_get(user_id)
        if "data_source" in onboarding_data:
            temp_project_id = onboarding_data["data_source"].get("temp_project_id")
            if temp_project_id:
                temp_project = db.query(Project).filter(
                    and_(
                        Project.id == uuid.UUID(temp_project_id),
                        Project.owner_id == user_id
                    )
                ).first()
                if temp_project:
                    project_id = str(temp_project.id)
                    project_uuid = temp_project.id
                    active_project = temp_project
                    logger.info(f"Using temp project {project_id} for prompt chat during onboarding")
        
        # If no temp project, get or create active project
        if not active_project:
            active_project = _get_active_project(db, user_id)
        
        if active_project:
            project_id = str(active_project.id)
            project_uuid = active_project.id
    elif auth_type == "api_key" and api_key:
        # For API keys, use the project_id from the API key if available
        if hasattr(api_key, "project_id") and api_key.project_id:
            project_id = str(api_key.project_id)
            project_uuid = api_key.project_id
    
    # Check document count for this specific project
    if project_id:
        try:
            doc_count = rag_pipeline.vdb.count(user_id=user_id, project_id=project_id)
            if doc_count == 0:
                raise HTTPException(
                    status_code=503, 
                    detail=f"No documents embedded yet for this project. Please upload documents or crawl a website first."
                )
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"Error checking document count: {e}")
            raise HTTPException(
                status_code=503,
                detail="Error checking documents. Please try again later."
            )
    else:
        raise HTTPException(
            status_code=503,
            detail="No active project found. Please create or activate a project first."
        )

    CHAT_TOP_K = 5  # Increased from 3 to 5 for better context retrieval

    # Fetch LLM Configuration from ChatbotSettings (project-scoped)
    llm_config_dict = None
    if user_id and project_id and project_uuid:
        chatbot_settings = db.query(ChatbotSettings).filter(
            and_(
                ChatbotSettings.user_id == user_id,
                ChatbotSettings.project_id == project_uuid
            )
        ).first()
        if chatbot_settings:
            # Normalize provider name to ensure consistency
            provider = chatbot_settings.model_provider or ""
            provider_lower = provider.lower()
            if "custom" in provider_lower or "ollama" in provider_lower:
                provider_normalized = "ollama"
            else:
                provider_normalized = provider_lower
            
            llm_config_dict = {
                "provider": provider_normalized,
                "chat_model": chatbot_settings.chat_model,
                "api_key": chatbot_settings.api_key
            }
            logger.info(f"Using dynamic LLM config for user {user_id}: {llm_config_dict.get('provider')} / {llm_config_dict.get('chat_model')}")

    # Fetch Chatbot Settings for project to get language preference
    chatbot_language = None
    if user_id and project_id:
        chatbot_settings = _get_chatbot_settings_query(db).filter(
            and_(
                ChatbotSettings.user_id == user_id,
                ChatbotSettings.project_id == project_uuid
            )
        ).first()
        if chatbot_settings and chatbot_settings.chatbot_language:
            chatbot_language = chatbot_settings.chatbot_language
            logger.info(f"Using language preference for user {user_id}, project {project_id}: {chatbot_language}")

    # Use the custom system_prompt from the request
    system_prompt = req.system_prompt
    logger.info(f"Using custom system prompt for user {user_id}, project {project_id}")

    # Resolve embedding model for this project (prompt-chat path → ChatbotSettings).
    from ..services.rag.embedding_resolver import resolve_for_project as _resolve_emb_for_project
    _prompt_emb_provider, _prompt_emb_model, _prompt_emb_api_key = _resolve_emb_for_project(
        db, project_id, source="chat"
    )

    query_fn = functools.partial(
        rag_pipeline.query,
        query=user_message,
        top_k=CHAT_TOP_K,
        max_tokens=req.maxTokens if req.maxTokens else 800,  # Increased from 500 to 800 for more detailed responses
        generate_topk=False,  # Chat mode: no top-k results
        user_id=user_id,
        project_id=project_id,
        llm_config=llm_config_dict,
        system_prompt=system_prompt,  # Use custom prompt from request
        language_code=chatbot_language,
        embedding_provider=_prompt_emb_provider,
        embedding_model=_prompt_emb_model,
        embedding_api_key=_prompt_emb_api_key,
    )

    try:
        from ..services.query_runtime import run_query_async

        resp = await run_query_async(query_fn)
    except Exception as e:
        logger.error(f"RAG query failed in thread executor: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"RAG Generation Error: {str(e)}")
    
    answer = resp.get("summary")
    
    # Refine answer: Remove raw context markers and citations
    if answer:
        answer = _refine_answer(answer)
    
    sources = None  # Chat doesn't return sources

    assistant_message_id = uuid.uuid4()
    
    # Ensure project_uuid is set
    if not project_uuid and project_id:
        try:
            project_uuid = uuid.UUID(project_id)
        except (ValueError, TypeError):
            project_uuid = None

    _chat_elapsed = int((time.time() - start_time) * 1000)
    _chat_tu = resp.get("token_usage") if isinstance(resp, dict) else {}

    def _save_prompt_chat():
        from ..db import SessionLocal
        from ..services.chat_execution_snapshot import build_execution_snapshot

        _db = SessionLocal()
        try:
            snap = build_execution_snapshot(
                answer=answer or "",
                session_id=session_id,
                assistant_message_id=assistant_message_id,
                chatbot_language=chatbot_language,
                retrieval_meta=resp.get("retrieval_meta") if isinstance(resp, dict) else {},
                token_usage=_chat_tu,
                raw_contexts=resp.get("raw_contexts") if isinstance(resp, dict) else None,
                raw_contexts_metadatas=resp.get("raw_contexts_metadatas") if isinstance(resp, dict) else None,
                raw_chunk_similarity_pct=resp.get("raw_chunk_similarity_pct") if isinstance(resp, dict) else None,
                llm_config_dict=llm_config_dict,
                effective_rag_params={
                    "top_k": CHAT_TOP_K,
                    "similarity_threshold": None,
                    "use_reranker": None,
                    "max_tokens": req.maxTokens if req.maxTokens else 800,
                },
                embedding_provider=_prompt_emb_provider,
                embedding_model=_prompt_emb_model,
                project_id=project_id,
                total_ms=_chat_elapsed,
                stage_timings_ms=resp.get("stage_timings_ms") if isinstance(resp, dict) else None,
                is_default_greeting=False,
            )
            if project_uuid:
                _db.add(ChatMessage(
                    id=uuid.uuid4(), user_id=user_id, project_id=project_uuid,
                    session_id=session_id, message_id=assistant_message_id,
                    user_message=user_message, assistant_response=answer,
                    message_type="chat", sources=None,
                    execution_snapshot=snap,
                ))
                _db.commit()
            _db.add(QueryLog(
                user_id=user_id, apikey_id=api_key_id if api_key_id else None,
                project_id=project_uuid if project_uuid else None,
                llm_provider=(llm_config_dict or {}).get("provider"),
                llm_model=(llm_config_dict or {}).get("chat_model"),
                query=user_message, mode="CHAT", result_count=0, p95_latency=_chat_elapsed,
                prompt_tokens=_chat_tu.get("prompt_tokens") if _chat_tu else None,
                completion_tokens=_chat_tu.get("completion_tokens") if _chat_tu else None,
                total_tokens=_chat_tu.get("total_tokens") if _chat_tu else None,
                chat_message_id=assistant_message_id if project_uuid else None,
            ))
            _db.commit()
        except Exception as e:
            logger.warning(f"Background prompt chat DB save failed: {e}")
            _db.rollback()
        finally:
            _db.close()

    background_tasks.add_task(_save_prompt_chat)

    return create_success_response(
        data={
            "answer": answer,
            "message_id": str(assistant_message_id),
            "session_id": session_id,
            "retrieval_meta": resp.get("retrieval_meta"),
        },
        message="Chat completed"
    )
