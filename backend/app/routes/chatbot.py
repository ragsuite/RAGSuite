"""
Chatbot Configuration and Widget Customization API routes
"""
import logging
import uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Request, status, Query, Body
from sqlalchemy.orm import Session, defer
from sqlalchemy import and_, not_, inspect as sa_inspect

from ..db import get_db
from ..auth import get_current_user_required, get_project_id_or_user, resolve_embed_project_context
from ..models import User, ChatbotSettings, Project
from ..services.audit_service import emit_audit
from ..schemas import (
    ChatbotConfigurationCreate,
    ChatbotConfigurationOut,
    WidgetCustomizationCreate,
    WidgetCustomizationOut,
    ChatbotSettingsOut
)

router = APIRouter(prefix="/api/v1/chatbot", tags=["Chatbot"])
logger = logging.getLogger(__name__)

from sqlalchemy import inspect as sa_inspect
from sqlalchemy.orm import defer

def _get_chatbot_settings_query(db: Session):
    """
    Helper function to get ChatbotSettings query with proper column handling.
    Excludes columns that don't exist in the database yet (is_search_active, search_response_config).
    """
    query = db.query(ChatbotSettings)
    
    # Check which columns exist in the database
    try:
        inspector = sa_inspect(db.bind)
        columns = [col['name'] for col in inspector.get_columns('chatbot_settings')]
        
        # Defer is_search_active if it doesn't exist
        if 'is_search_active' not in columns:
            query = query.options(defer(ChatbotSettings.is_search_active))
        
        # Defer search_response_config if it doesn't exist
        if 'search_response_config' not in columns:
            query = query.options(defer(ChatbotSettings.search_response_config))

        if 'feedback_enabled' not in columns:
            query = query.options(defer(ChatbotSettings.feedback_enabled))
    except Exception as e:
        # If inspection fails, try to exclude the columns anyway
        logger.warning(f"Could not inspect chatbot_settings table: {e}")
        try:
            query = query.options(
                defer(ChatbotSettings.is_search_active),
                defer(ChatbotSettings.search_response_config)
            )
        except Exception:
            pass  # If defer fails, continue with normal query
    
    return query


def _get_active_project(db: Session, user_id: int) -> Optional[Project]:
    """Helper function to get active project for a user"""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        return None

    # First, check if user is in onboarding and has temp project
    try:
        from .onboarding import _ob_get
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
                    return temp_project
    except Exception:
        pass

    from ..auth import ensure_user_active_project
    return ensure_user_active_project(db, user)

@router.get("/settings", response_model=ChatbotSettingsOut, status_code=status.HTTP_200_OK)
async def get_chatbot_settings(
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID (defaults to active project)"),
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Get all chatbot configuration and widget customization settings for a project.
    Works for both authenticated users and widgets (via projectId).
    """
    current_user_id = auth["user_id"]
    
    # CASE 1: Widget Request (Project ID is strictly enforced from Auth)
    if auth["type"] == "widget":
        # Ignore query param project_id, use the authenticated project_id
        target_project_id = auth["project_id"]
        
        # Verify it matches if a specific one was requested (optional constraint, but good for safety)
        if project_id and str(project_id) != str(target_project_id):
             raise HTTPException(status_code=403, detail="Project ID mismatch with authentication")
             
        project_id = target_project_id

    elif auth["type"] == "api_key":
        project, settings_user_id = resolve_embed_project_context(auth, db, query_project_id=project_id)
        project_id = project.id
        current_user_id = settings_user_id

    # CASE 3: User Request (Standard logic)
    else:
        # Get project_id if not provided
        if not project_id:
            active_project = _get_active_project(db, current_user_id)
            if not active_project:
                raise HTTPException(
                    status_code=404,
                    detail="No project found. Please create a project first."
                )
            project_id = active_project.id
        else:
            # Verify project belongs to user
            project = db.query(Project).filter(
                and_(
                    Project.id == project_id,
                    Project.owner_id == current_user_id
                )
            ).first()
            if not project:
                raise HTTPException(
                    status_code=404,
                    detail="Project not found or access denied"
                )
    
    # Retrieve settings for the target project
    chatbot_settings = _get_chatbot_settings_query(db).filter(
        and_(
            ChatbotSettings.user_id == current_user_id,
            ChatbotSettings.project_id == project_id
        )
    ).first()
    
    if not chatbot_settings:
        # Return default settings (never use username — avoids wrong title on first visit)
        return ChatbotSettingsOut(
            configuration=ChatbotConfigurationOut(
                chatbot_title="RAGSuite",
                short_description=None,
                bubble_message=None,
                welcome_message="Hi, how can I help you?",
                chatbot_language="en",
                feedback_enabled=True,
            ),
            customization=WidgetCustomizationOut(
                widget_logo_url=None,
                widget_avatar="default-1",
                widget_avatar_size=38,
                widget_chatbot_color="#1F2937",
                widget_background_color="#1a1a1a",
                widget_text_color="#ffffff",
                widget_show_logo=True,
                widget_show_date_time=True,
                widget_show_backdrop=False,
                widget_show_speech_input=True,
                widget_show_speech_output=True,
                widget_bottom_space=15,
                widget_font_size=14,
                widget_trigger_border_radius=50,
                widget_panel_border_radius=20,
                widget_position="bottom-right",
                widget_z_index=50,
                widget_offset_x=0,
                widget_offset_y=0,
                widget_width=None,
                widget_height=None,
            )
        )
    
    # Return settings from database
    return ChatbotSettingsOut(
        configuration=ChatbotConfigurationOut(
            chatbot_title=chatbot_settings.chatbot_title or "RAGSuite",
            short_description=chatbot_settings.short_description,
            bubble_message=chatbot_settings.bubble_message,
            welcome_message=chatbot_settings.welcome_message or "Hi, how can I help you?",
            chatbot_language=chatbot_settings.chatbot_language or "en",
            feedback_enabled=bool(getattr(chatbot_settings, "feedback_enabled", True)),
        ),
        customization=WidgetCustomizationOut(
            widget_logo_url=chatbot_settings.widget_logo_url,
            widget_avatar=chatbot_settings.widget_avatar or "default-1",
            widget_avatar_size=chatbot_settings.widget_avatar_size or 38,
            widget_chatbot_color=chatbot_settings.widget_chatbot_color or "#1F2937",
            widget_background_color=chatbot_settings.widget_background_color or "#1a1a1a",
            widget_text_color=chatbot_settings.widget_text_color or "#ffffff",
            widget_show_logo=chatbot_settings.widget_show_logo if chatbot_settings.widget_show_logo is not None else True,
            widget_show_date_time=chatbot_settings.widget_show_date_time if chatbot_settings.widget_show_date_time is not None else True,
            widget_show_backdrop=bool(getattr(chatbot_settings, "widget_show_backdrop", False)),
            widget_show_speech_input=bool(getattr(chatbot_settings, "widget_show_speech_input", True)),
            widget_show_speech_output=bool(getattr(chatbot_settings, "widget_show_speech_output", True)),
            widget_bottom_space=chatbot_settings.widget_bottom_space or 15,
            widget_font_size=chatbot_settings.widget_font_size or 14,
            widget_trigger_border_radius=chatbot_settings.widget_trigger_border_radius or 50,
            widget_panel_border_radius=getattr(chatbot_settings, "widget_panel_border_radius", None) or 20,
            widget_position=chatbot_settings.widget_position or "bottom-right",
            widget_z_index=chatbot_settings.widget_z_index or 50,
            widget_offset_x=chatbot_settings.widget_offset_x or 0,
            widget_offset_y=chatbot_settings.widget_offset_y or 0,
            widget_width=chatbot_settings.widget_width,
            widget_height=getattr(chatbot_settings, "widget_height", None),
        )
    )


@router.post("/configuration", response_model=ChatbotConfigurationOut, status_code=status.HTTP_200_OK)
async def update_chatbot_configuration(
    config_data: ChatbotConfigurationCreate,
    request: Request,
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID (defaults to active project)"),
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Update chatbot configuration (title, description, messages, language)
    Creates settings if they don't exist, updates if they do
    """
    if auth_result["type"] == "widget":
        raise HTTPException(status_code=403, detail="Widgets cannot modify chatbot configuration")

    current_user_id = auth_result["user_id"]

    if not project_id:
        active_project = _get_active_project(db, current_user_id)
        if not active_project:
            raise HTTPException(
                status_code=404,
                detail="No project found. Please create a project first."
            )
        project_id = active_project.id
    else:
        # Verify project belongs to user
        project = db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.owner_id == current_user_id
            )
        ).first()
        if not project:
            raise HTTPException(
                status_code=404,
                detail="Project not found or access denied"
            )
    
    chatbot_settings = _get_chatbot_settings_query(db).filter(
        and_(
            ChatbotSettings.user_id == current_user_id,
            ChatbotSettings.project_id == project_id
        )
    ).first()
    
    if chatbot_settings:
        # Update existing settings
        if config_data.chatbot_title:
            chatbot_settings.chatbot_title = config_data.chatbot_title
        if config_data.short_description is not None:
            # Preserve system prompt if it exists (stored with __PROMPT__ prefix)
            # Only update if the current short_description is not a system prompt
            current_is_prompt = chatbot_settings.short_description and chatbot_settings.short_description.startswith("__PROMPT__")
            if not current_is_prompt:
                chatbot_settings.short_description = config_data.short_description
            # If it is a prompt, ignore the update to preserve the system prompt
        if config_data.bubble_message is not None:
            chatbot_settings.bubble_message = config_data.bubble_message
        if config_data.welcome_message:
            chatbot_settings.welcome_message = config_data.welcome_message
        if config_data.chatbot_language:
            chatbot_settings.chatbot_language = config_data.chatbot_language
        if config_data.feedback_enabled is not None:
            chatbot_settings.feedback_enabled = config_data.feedback_enabled
        
        db.commit()
        db.refresh(chatbot_settings)
        
        logger.info(f"Updated chatbot configuration for user {current_user_id}, project {project_id}")
    else:
        # Create new settings
        chatbot_settings = ChatbotSettings(
            user_id=current_user_id,
            project_id=project_id,
            chatbot_title=config_data.chatbot_title or "RAGSuite",
            short_description=config_data.short_description,
            bubble_message=config_data.bubble_message,
            welcome_message=config_data.welcome_message or "Hi, how can I help you?",
            chatbot_language=config_data.chatbot_language or "en",
            feedback_enabled=config_data.feedback_enabled if config_data.feedback_enabled is not None else True,
        )
        
        db.add(chatbot_settings)
        db.commit()
        db.refresh(chatbot_settings)
        
        logger.info(f"Created chatbot configuration for user {current_user_id}, project {project_id}")

    emit_audit(
        event_type="config.chatbot.updated",
        request=request,
        user_id=current_user_id,
        project_id=project_id,
        resource_type="chatbot_settings",
        resource_id=str(chatbot_settings.id),
        summary="Chatbot configuration updated",
        details={"section": "configuration"},
    )

    return ChatbotConfigurationOut(
        chatbot_title=chatbot_settings.chatbot_title or "RAGSuite",
        short_description=chatbot_settings.short_description,
        bubble_message=chatbot_settings.bubble_message,
        welcome_message=chatbot_settings.welcome_message or "Hi, how can I help you?",
        chatbot_language=chatbot_settings.chatbot_language or "en",
        feedback_enabled=bool(getattr(chatbot_settings, "feedback_enabled", True)),
    )


@router.post("/customization", response_model=WidgetCustomizationOut, status_code=status.HTTP_200_OK)
async def update_widget_customization(
    customization_data: WidgetCustomizationCreate,
    request: Request,
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID (defaults to active project)"),
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Update widget customization (logo, avatar, colors, positioning, etc.)
    Creates settings if they don't exist, updates if they do
    """
    if auth_result["type"] == "widget":
        raise HTTPException(status_code=403, detail="Widgets cannot modify chatbot customization")

    current_user_id = auth_result["user_id"]

    if not project_id:
        active_project = _get_active_project(db, current_user_id)
        if not active_project:
            raise HTTPException(
                status_code=404,
                detail="No project found. Please create a project first."
            )
        project_id = active_project.id
    else:
        # Verify project belongs to user
        project = db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.owner_id == current_user_id
            )
        ).first()
        if not project:
            raise HTTPException(
                status_code=404,
                detail="Project not found or access denied"
            )

    chatbot_settings = _get_chatbot_settings_query(db).filter(
        and_(
            ChatbotSettings.user_id == current_user_id,
            ChatbotSettings.project_id == project_id
        )
    ).first()

    if chatbot_settings:
        # Update existing settings
        if customization_data.widget_logo_url is not None:
            chatbot_settings.widget_logo_url = customization_data.widget_logo_url
        if customization_data.widget_avatar is not None:
            chatbot_settings.widget_avatar = customization_data.widget_avatar
        if customization_data.widget_avatar_size is not None:
            chatbot_settings.widget_avatar_size = customization_data.widget_avatar_size
        if customization_data.widget_chatbot_color is not None:
            chatbot_settings.widget_chatbot_color = customization_data.widget_chatbot_color
        if customization_data.widget_background_color is not None:
            chatbot_settings.widget_background_color = customization_data.widget_background_color
        if customization_data.widget_text_color is not None:
            chatbot_settings.widget_text_color = customization_data.widget_text_color
        if customization_data.widget_show_logo is not None:
            chatbot_settings.widget_show_logo = customization_data.widget_show_logo
        if customization_data.widget_show_date_time is not None:
            chatbot_settings.widget_show_date_time = customization_data.widget_show_date_time
        if customization_data.widget_show_backdrop is not None:
            chatbot_settings.widget_show_backdrop = customization_data.widget_show_backdrop
        if customization_data.widget_show_speech_input is not None:
            chatbot_settings.widget_show_speech_input = customization_data.widget_show_speech_input
        if customization_data.widget_show_speech_output is not None:
            chatbot_settings.widget_show_speech_output = customization_data.widget_show_speech_output
        if customization_data.widget_bottom_space is not None:
            chatbot_settings.widget_bottom_space = customization_data.widget_bottom_space
        if customization_data.widget_font_size is not None:
            chatbot_settings.widget_font_size = customization_data.widget_font_size
        if customization_data.widget_trigger_border_radius is not None:
            chatbot_settings.widget_trigger_border_radius = customization_data.widget_trigger_border_radius
        if customization_data.widget_panel_border_radius is not None:
            chatbot_settings.widget_panel_border_radius = customization_data.widget_panel_border_radius
        if customization_data.widget_position is not None:
            chatbot_settings.widget_position = customization_data.widget_position
        if customization_data.widget_z_index is not None:
            chatbot_settings.widget_z_index = customization_data.widget_z_index
        if customization_data.widget_offset_x is not None:
            chatbot_settings.widget_offset_x = customization_data.widget_offset_x
        if customization_data.widget_offset_y is not None:
            chatbot_settings.widget_offset_y = customization_data.widget_offset_y
        if "widget_width" in customization_data.model_fields_set:
            chatbot_settings.widget_width = customization_data.widget_width
        if "widget_height" in customization_data.model_fields_set:
            chatbot_settings.widget_height = customization_data.widget_height
        
        db.commit()
        db.refresh(chatbot_settings)
        
        logger.info(f"Updated widget customization for user {current_user_id}, project {project_id}")
    else:
        # Create new settings with defaults
        chatbot_settings = ChatbotSettings(
            user_id=current_user_id,
            project_id=project_id,
            widget_logo_url=customization_data.widget_logo_url,
            widget_avatar=customization_data.widget_avatar or "default-1",
            widget_avatar_size=customization_data.widget_avatar_size or 38,
            widget_chatbot_color=customization_data.widget_chatbot_color or "#1F2937",
            widget_background_color=customization_data.widget_background_color or "#1a1a1a",
            widget_text_color=customization_data.widget_text_color or "#ffffff",
            widget_show_logo=customization_data.widget_show_logo if customization_data.widget_show_logo is not None else True,
            widget_show_date_time=customization_data.widget_show_date_time if customization_data.widget_show_date_time is not None else True,
            widget_show_backdrop=customization_data.widget_show_backdrop if customization_data.widget_show_backdrop is not None else False,
            widget_show_speech_input=customization_data.widget_show_speech_input if customization_data.widget_show_speech_input is not None else True,
            widget_show_speech_output=customization_data.widget_show_speech_output if customization_data.widget_show_speech_output is not None else True,
            widget_bottom_space=customization_data.widget_bottom_space or 15,
            widget_font_size=customization_data.widget_font_size or 14,
            widget_trigger_border_radius=customization_data.widget_trigger_border_radius or 50,
            widget_panel_border_radius=customization_data.widget_panel_border_radius if customization_data.widget_panel_border_radius is not None else 20,
            widget_position=customization_data.widget_position or "bottom-right",
            widget_z_index=customization_data.widget_z_index or 50,
            widget_offset_x=customization_data.widget_offset_x or 0,
            widget_offset_y=customization_data.widget_offset_y or 0,
            widget_width=customization_data.widget_width,
            widget_height=customization_data.widget_height,
        )
        
        db.add(chatbot_settings)
        db.commit()
        db.refresh(chatbot_settings)
        
        logger.info(f"Created widget customization for user {current_user_id}, project {project_id}")

    emit_audit(
        event_type="config.chatbot.updated",
        request=request,
        user_id=current_user_id,
        project_id=project_id,
        resource_type="chatbot_settings",
        resource_id=str(chatbot_settings.id),
        summary="Chatbot configuration updated",
        details={"section": "customization"},
    )

    return WidgetCustomizationOut(
        widget_logo_url=chatbot_settings.widget_logo_url,
        widget_avatar=chatbot_settings.widget_avatar or "default-1",
        widget_avatar_size=chatbot_settings.widget_avatar_size or 38,
        widget_chatbot_color=chatbot_settings.widget_chatbot_color or "#1F2937",
        widget_background_color=chatbot_settings.widget_background_color or "#1a1a1a",
        widget_text_color=chatbot_settings.widget_text_color or "#ffffff",
        widget_show_logo=chatbot_settings.widget_show_logo if chatbot_settings.widget_show_logo is not None else True,
        widget_show_date_time=chatbot_settings.widget_show_date_time if chatbot_settings.widget_show_date_time is not None else True,
        widget_show_backdrop=bool(getattr(chatbot_settings, "widget_show_backdrop", False)),
        widget_show_speech_input=bool(getattr(chatbot_settings, "widget_show_speech_input", True)),
        widget_show_speech_output=bool(getattr(chatbot_settings, "widget_show_speech_output", True)),
        widget_bottom_space=chatbot_settings.widget_bottom_space or 15,
        widget_font_size=chatbot_settings.widget_font_size or 14,
        widget_trigger_border_radius=chatbot_settings.widget_trigger_border_radius or 50,
        widget_panel_border_radius=getattr(chatbot_settings, "widget_panel_border_radius", None) or 20,
        widget_position=chatbot_settings.widget_position or "bottom-right",
        widget_z_index=chatbot_settings.widget_z_index or 50,
        widget_offset_x=chatbot_settings.widget_offset_x or 0,
        widget_offset_y=chatbot_settings.widget_offset_y or 0,
        widget_width=chatbot_settings.widget_width,
        widget_height=getattr(chatbot_settings, "widget_height", None),
    )


@router.put("/activate", status_code=status.HTTP_200_OK)
async def activate_chatbot(
    request: Request,
    is_active: Optional[bool] = Query(None, description="Activate (true) or deactivate (false) the chatbot"),
    request_body: Optional[dict] = Body(None),
    db: Session = Depends(get_db),
    auth_result: dict = Depends(get_project_id_or_user)
):
    """
    Activate or deactivate the chatbot for the user.
    When deactivated, chat and search endpoints will not work.
    Accepts is_active as query parameter or in JSON body.
    """
    # Get is_active from query parameter or request body
    if is_active is None:
        if request_body and "is_active" in request_body:
            is_active = request_body["is_active"]
        else:
            raise HTTPException(
                status_code=400,
                detail="is_active parameter is required (as query parameter or in request body)"
            )
    
    try:
        current_user_id = auth_result["user_id"]
        
        # Get active project for the user
        active_project = None
        
        if auth_result["type"] == "widget":
             project_id = auth_result.get("project_id")
             if project_id:
                 try:
                     project_uuid = project_id if isinstance(project_id, uuid.UUID) else uuid.UUID(str(project_id))
                     active_project = db.query(Project).filter(Project.id == project_uuid).first()
                 except: pass
        else:
             active_project = _get_active_project(db, current_user_id)

        if not active_project:
            raise HTTPException(
                status_code=404,
                detail="No active project found. Please create or activate a project first."
            )
        
        # Get or create ChatbotSettings for the active project
        chatbot_settings = _get_chatbot_settings_query(db).filter(
            and_(
                ChatbotSettings.user_id == current_user_id,
                ChatbotSettings.project_id == active_project.id
            )
        ).first()
        
        if chatbot_settings:
            # Check if is_active column exists, use getattr with default True
            if hasattr(chatbot_settings, 'is_active'):
                chatbot_settings.is_active = is_active
            else:
                # Column doesn't exist yet, log warning but don't fail
                logger.warning(f"is_active column doesn't exist in database yet for user {current_user_id}")
                # Try to set it anyway (will fail gracefully)
                try:
                    chatbot_settings.is_active = is_active
                except Exception as e:
                    logger.error(f"Could not set is_active: {e}. Please run migration to add column.")
                    raise HTTPException(
                        status_code=500,
                        detail="Database schema needs to be updated. Please run migration to add is_active column."
                    )
            db.commit()
            db.refresh(chatbot_settings)
        else:
            # Create new ChatbotSettings with activation status
            try:
                chatbot_settings = ChatbotSettings(
                    user_id=current_user_id,
                    project_id=active_project.id,
                    is_active=is_active
                )
                db.add(chatbot_settings)
                db.commit()
                db.refresh(chatbot_settings)
            except Exception as e:
                db.rollback()
                logger.error(f"Error creating chatbot settings: {e}")
                if "is_active" in str(e).lower() or "column" in str(e).lower():
                    raise HTTPException(
                        status_code=500,
                        detail="Database schema needs to be updated. Please run migration to add is_active column."
                    )
                raise HTTPException(
                    status_code=500,
                    detail=f"Error updating activation status: {str(e)}"
                )
        
        logger.info(f"Chatbot activation status updated for user {current_user_id}: {is_active}")

        emit_audit(
            event_type="config.chatbot.updated",
            request=request,
            user_id=current_user_id,
            project_id=active_project.id,
            resource_type="chatbot_settings",
            resource_id=str(chatbot_settings.id),
            summary=f"Chatbot {'activated' if is_active else 'deactivated'}",
            details={"section": "activate", "is_active": is_active},
        )

        return {
            "success": True,
            "message": f"Chatbot {'activated' if is_active else 'deactivated'} successfully",
            "is_active": is_active
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Unexpected error in activate_chatbot: {e}", exc_info=True)
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"Error updating activation status: {str(e)}"
        )


@router.get("/activate", status_code=status.HTTP_200_OK)
async def get_chatbot_activation_status(
    db: Session = Depends(get_db),
    auth: dict = Depends(get_project_id_or_user)
):
    """
    Get the current activation status of the chatbot.
    Works for both authenticated users and widgets (with projectId).
    """
    active_project = None
    user_id = None
    
    # CASE 1: Widget Auth
    if auth["type"] == "widget":
        active_project = auth["project"]
        # No user_id for widgets
        
    # CASE 2: User Auth
    elif auth["type"] == "user":
        user = auth["user"]
        user_id = user.id
        # Get active project for the user
        active_project = _get_active_project(db, user_id)

    if not active_project:
        return {
            "success": True,
            "is_active": True,  # Default to active if no project/settings
            "message": "No project found, defaulting to active"
        }
    
    # Construct query based on available IDs
    query = _get_chatbot_settings_query(db)
    if user_id:
        query = query.filter(
            and_(
                ChatbotSettings.user_id == user_id,
                ChatbotSettings.project_id == active_project.id
            )
        )
    else:
        # Widget auth: filter by project_id only (and project owner)
        query = query.filter(
             and_(
                ChatbotSettings.project_id == active_project.id,
                ChatbotSettings.user_id == active_project.owner_id
             )
        )
        
    chatbot_settings = query.first()
    
    # Default to True if no settings exist
    is_active = True
    if chatbot_settings:
        # Check if is_active column exists
        if hasattr(chatbot_settings, 'is_active'):
            try:
                is_active = chatbot_settings.is_active
            except Exception as e:
                # Column might not exist in database yet
                logger.warning(f"Could not read is_active column: {e}, defaulting to True")
                is_active = True
        else:
            # Column doesn't exist yet, default to True
            logger.warning(f"is_active column doesn't exist in database yet, defaulting to True")
            is_active = True
    
    return {
        "success": True,
        "is_active": is_active
    }
