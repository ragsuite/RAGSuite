from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import and_
from ..db import get_db
from ..auth import get_current_user_required
from ..models import User, ChatbotSettings, Project, SearchSettings
from ..schemas import ApiResponse
from pydantic import BaseModel, Field
from typing import Optional
import uuid
import logging

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/search/citation",
    tags=["Search Citation"]
)

def create_success_response(data=None, message=""):
    return {
        "success": True,
        "data": data,
        "message": message
    }

# Citation Formatting Schemas
class CitationFormattingUpdate(BaseModel):
    """Update citation formatting settings for search - SEARCH ONLY"""
    citation_style: Optional[str] = Field(None, description="Citation style: 'detailed', 'simple', 'minimal'")
    layout: Optional[str] = Field(None, description="Layout: 'vertical', 'horizontal', 'inline'")
    numbering_style: Optional[str] = Field(None, description="Numbering style: '[1] [2] [3]', '(1) (2) (3)', '1. 2. 3.'")
    color_scheme: Optional[str] = Field(None, description="Color scheme: 'default', 'dark', 'light', 'custom'")
    show_snippets: Optional[bool] = Field(None, description="Display content snippets")
    show_urls: Optional[bool] = Field(None, description="Display source links")
    show_source_count: Optional[bool] = Field(None, description="Display number of sources")
    enable_hover_effects: Optional[bool] = Field(None, description="Add hover animations")
    max_snippet_length: Optional[int] = Field(None, ge=50, le=500, description="Maximum length of content snippets (50-500 chars)")

class CitationFormattingOut(BaseModel):
    """Citation formatting settings for search - SEARCH ONLY"""
    citation_style: str = Field(default="detailed", description="Citation style")
    layout: str = Field(default="vertical", description="Layout")
    numbering_style: str = Field(default="brackets", description="Numbering style")
    color_scheme: str = Field(default="default", description="Color scheme")
    show_snippets: bool = Field(default=True, description="Display content snippets")
    show_urls: bool = Field(default=True, description="Display source links")
    show_source_count: bool = Field(default=True, description="Display number of sources")
    enable_hover_effects: bool = Field(default=True, description="Add hover animations")
    max_snippet_length: int = Field(default=150, description="Maximum length of content snippets")
    
    class Config:
        from_attributes = True

def _get_default_citation_settings() -> dict:
    """Get default citation formatting settings"""
    return {
        "citation_style": "detailed",
        "layout": "vertical",
        "numbering_style": "brackets",
        "color_scheme": "default",
        "show_snippets": True,
        "show_urls": True,
        "show_source_count": True,
        "enable_hover_effects": True,
        "max_snippet_length": 150
    }

def _get_citation_settings_from_search_settings(search_settings: SearchSettings) -> dict:
    """Extract citation settings from SearchSettings JSON field or return defaults"""
    if not search_settings:
        return _get_default_citation_settings()
    
    # Get citation settings from SearchSettings (separate table for search settings)
    if search_settings.citation_formatting and isinstance(search_settings.citation_formatting, dict):
            # Merge with defaults to ensure all fields are present
            defaults = _get_default_citation_settings()
            defaults.update(search_settings.citation_formatting)
            return defaults
    
    return _get_default_citation_settings()

from ..auth import get_current_user_required, get_project_id_or_user

# ... imports ...

@router.get("/", response_model=ApiResponse)
async def get_citation_formatting(
    auth_result: dict = Depends(get_project_id_or_user),
    db: Session = Depends(get_db)
):
    """
    Get citation formatting settings for search - SEARCH ONLY.
    Returns citation formatting configuration used specifically for search functionality.
    This endpoint is isolated from chat citation settings.
    Supports both User Auth (for admin) and Widget Auth (via X-Project-ID).
    """
    user_id = auth_result.get("user_id")
    target_project = None
    
    # Handle different auth types
    if auth_result["type"] == "widget":
        # For widget, we have direct project_id
        project_id = auth_result["project_id"]
        # Verify project exists and is active
        target_project = db.query(Project).filter(Project.id == project_id).first()
        if not target_project or not target_project.is_active:
             # Return defaults if project invalid/inactive
             return create_success_response(
                data=_get_default_citation_settings(),
                message="Citation formatting settings retrieved (defaults - project not found/inactive)"
            )
            
    elif auth_result["type"] == "user":
        # For user, get their active project
        # First check if explicit project_id passed in query (handled by helper or manual check if needed)
        # For compatibility with existing logic which might use query param not available here easily 
        # without changing signature too much, we'll focus on the active project pattern.
        
        # NOTE: The original signature had: project_id: Optional[uuid.UUID] = Query(None)
        # But get_project_id_or_user eats that up? No, get_project_id_or_user handles header/query checks for widget/apikey.
        # For user mode, we need to replicate the logic of "use provided project_id or active project".
        
        # But wait, get_project_id_or_user doesn't parse generic query params for "admin viewing specific project".
        # It handles "auth".
        
        # Let's check how we handled response-config. We just got active project.
        # The user's request says: "If no project_id but JWT token is present, use user authentication... Return citation configuration for the project"
        # And "Accept project_id as query parameter... authenticate using projectId".
        
        # If I use get_project_id_or_user, it checks header X-Project-ID and query project_id.
        # If those exist, it treats it as WIDGET auth (or checks DB).
        
        # Wait, get_project_id_or_user implementation details (from memory/previous view):
        # It checks for project_id. If found, it validates it. 
        # If it validates, it returns type="widget" (or similar).
        
        # So if an Admin passes ?project_id=... it might be treated as widget auth?
        # If they pass a valid project_id, yes. And that's fine! 
        # Because we want to return the config for THAT project.
        
        # If they DON'T pass project_id, but have Bearer token:
        # Auth dependency -> type="user".
        # Then we find their active project.
        
        from ..routes.rag import _get_active_project
        try:
             target_project = _get_active_project(db, user_id)
        except HTTPException:
             pass # Will return defaults
             
    else:
        # API Key or other
        if "api_key" in auth_result and auth_result["api_key"].project_id:
             project_id = auth_result["api_key"].project_id
             target_project = db.query(Project).filter(Project.id == project_id).first()

    if not target_project:
        # Return defaults if no project
        return create_success_response(
            data=_get_default_citation_settings(),
            message="Citation formatting settings retrieved (defaults - no active project)"
        )
    
    # Get search settings for this project (separate table for search settings)
    # Use project owner for user_id logic if we are in widget mode (user_id might be None/different?)
    # Valid point: In widget mode, auth_result["user_id"] is the project owner.
    # So we can safely use auth_result["user_id"] or target_project.owner_id
    
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == target_project.owner_id,
            SearchSettings.project_id == target_project.id
        )
    ).first()
    
    citation_settings = _get_citation_settings_from_search_settings(search_settings)
    
    return create_success_response(
        data=CitationFormattingOut(**citation_settings).model_dump(),
        message="Citation formatting settings retrieved successfully"
    )

@router.post("/", response_model=ApiResponse)
async def update_citation_formatting(
    citation_data: CitationFormattingUpdate,
    project_id: Optional[uuid.UUID] = Query(None, description="Project ID (defaults to active project)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    """
    Update citation formatting settings for search - SEARCH ONLY.
    Updates citation formatting configuration used specifically for search functionality.
    This endpoint is isolated from chat citation settings.
    """
    from ..routes.rag import _get_active_project
    
    # Get active project
    active_project = _get_active_project(db, current_user.id)
    
    # Use provided project_id or fall back to active_project
    target_project = active_project
    if project_id:
        project = db.query(Project).filter(
            and_(
                Project.id == project_id,
                Project.owner_id == current_user.id
            )
        ).first()
        if not project:
            raise HTTPException(status_code=404, detail="Project not found or access denied")
        target_project = project
    
    if not target_project:
        raise HTTPException(status_code=404, detail="No active project found. Please create or activate a project first.")
    
    # Get or create search settings for this project (separate table for search settings)
    search_settings = db.query(SearchSettings).filter(
        and_(
            SearchSettings.user_id == current_user.id,
            SearchSettings.project_id == target_project.id
        )
    ).first()
    
    if not search_settings:
        # Create new search settings
        search_settings = SearchSettings(
            user_id=current_user.id,
            project_id=target_project.id,
            is_search_active=True,  # Default to active
            citation_formatting=_get_default_citation_settings()
        )
        db.add(search_settings)
        db.flush()  # Flush to get the ID
    
    # Get existing citation settings or initialize with defaults
    current_citation = _get_default_citation_settings()
    if search_settings.citation_formatting and isinstance(search_settings.citation_formatting, dict):
            # Merge with defaults to ensure all fields are present
        current_citation.update(search_settings.citation_formatting)
    
    # Update only provided fields
    update_data = citation_data.model_dump(exclude_unset=True)
    # IMPORTANT: Create a NEW dict instead of modifying in place for SQLAlchemy JSON fields
    new_citation = current_citation.copy()
    new_citation.update(update_data)
    
    # Store citation settings in SearchSettings - assign new dict to trigger change detection
    search_settings.citation_formatting = new_citation
    
    # Explicitly mark the field as modified for SQLAlchemy JSON fields
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(search_settings, "citation_formatting")
    
    # Clean up old data in ChatbotSettings (migrated to SearchSettings)
    chatbot_check = db.query(ChatbotSettings).filter(
        and_(
            ChatbotSettings.user_id == current_user.id,
            ChatbotSettings.project_id == target_project.id
        )
    ).first()
    if chatbot_check and hasattr(chatbot_check, 'citation_formatting') and chatbot_check.citation_formatting:
        logger.info(f"Cleaning up old citation_formatting from ChatbotSettings (migrated to SearchSettings) for user {current_user.id}, project {target_project.id}")
        chatbot_check.citation_formatting = None
    
    # Flush to ensure changes are staged before commit
    try:
        db.flush()
        logger.info(f"Flushed citation formatting change (before commit) for user {current_user.id}, project {target_project.id}")
    except Exception as e:
        db.rollback()
        logger.error(f"Error flushing citation formatting: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Error staging citation formatting: {str(e)}"
        )
    
    db.commit()
    db.expire(search_settings)  # Clear SQLAlchemy cache
    db.refresh(search_settings)
    
    return create_success_response(
        data=CitationFormattingOut(**new_citation).model_dump(),
        message="Citation formatting settings updated successfully"
    )

