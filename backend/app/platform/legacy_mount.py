"""Legacy feature router + static mounts (Phase 2).

Public API paths unchanged. Feature routers remain under ``app.routes``.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, Query
from fastapi.responses import FileResponse, JSONResponse, Response

from app.platform.settings import settings

logger = logging.getLogger(__name__)

from app.routes.crawl import router as crawl_router                                                                                                                                                                                                                                                                
from app.routes.webhooks import router as webhooks_router                                                                                                                                                                                                                                                              
from app.routes.chat_models import router as chat_models_router                                                                                                                                                                                                                                                                
from app.routes.search_models import router as search_models_router, search_config_router                                                                                                                                                                                                                                                              
try:                                                                                                                                                                                                                                                                
    from app.routes.overview import router as overview_router                                                                                                                                                                                                                                                              
    OVERVIEW_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Overview router not available: {e}")                                                                                                                                                                                                                                                                
    OVERVIEW_AVAILABLE = False                                                                                                                                                                                                                                                              
    overview_router = None                                                                                                                                                                                                                                                              

# Documents router — mounted by modules/documents (Phase 3)
DOCUMENTS_AVAILABLE = False
documents_router = None

try:                                                                                                                                                                                                                                                                
    from app.routes.feedback_moderation import router as feedback_moderation_router                                                                                                                                                                                                                                                              
    FEEDBACK_MODERATION_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Feedback moderation router not available: {e}")                                                                                                                                                                                                                                                                
    FEEDBACK_MODERATION_AVAILABLE = False                                                                                                                                                                                                                                                              
    feedback_moderation_router = None

# Import RAG API router (now merged into app)
try:
    from app.routes.rag import router as rag_router
    RAG_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Warning: RAG API not available: {e}")
    RAG_AVAILABLE = False
    rag_router = None

# Import pure retrieval router for external integrations (n8n, automation)
try:
    from app.routes.retrieve import router as retrieve_router
    RETRIEVE_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Warning: Retrieve router not available: {e}")
    RETRIEVE_AVAILABLE = False
    retrieve_router = None

# Import n8n integration router
try:
    from app.routes.n8n import router as n8n_router
    N8N_AVAILABLE = True
except ImportError as e:
    print(f"⚠️  Warning: n8n router not available: {e}")
    N8N_AVAILABLE = False
    n8n_router = None

# Import API keys router                                                                                                                                                                                                                                                                
try:                                                                                                                                                                                                                                                                
    from app.routes.api_keys import router as api_keys_router                                                                                                                                                                                                                                                              
    API_KEYS_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: API Keys router not available: {e}")                                                                                                                                                                                                                                                                
    API_KEYS_AVAILABLE = False                                                                                                                                                                                                                                                              
    api_keys_router = None                                                                                                                                                                                                                                                              

# Import Integrations router (embed/publicId configuration)                                                                                                                                                                                                                                                             
try:                                                                                                                                                                                                                                                                
    from app.routes.integrations import router as integrations_router                                                                                                                                                                                                                                                              
    INTEGRATIONS_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Integrations router not available: {e}")                                                                                                                                                                                                                                                                
    INTEGRATIONS_AVAILABLE = False                                                                                                                                                                                                                                                              
    integrations_router = None                                                                                                                                                                                                                                                              

# Import Projects router                                                                                                                                                                                                                                                                
try:                                                                                                                                                                                                                                                                
    from app.routes.projects import router as projects_router                                                                                                                                                                                                                                                              
    PROJECTS_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Projects router not available: {e}")                                                                                                                                                                                                                                                                
    PROJECTS_AVAILABLE = False                                                                                                                                                                                                                                                              
    projects_router = None                                                                                                                                                                                                                                                              

# Import Onboarding router                                                                                                                                                                                                                                                              
try:                                                                                                                                                                                                                                                                
    from app.routes.onboarding import router as onboarding_router                                                                                                                                                                                                                                                              
    ONBOARDING_AVAILABLE = True                                                                                                                                                                                                                                                             
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Onboarding router not available: {e}")                                                                                                                                                                                                                                                              
    ONBOARDING_AVAILABLE = False                                                                                                                                                                                                                                                                
    onboarding_router = None                                                                                                                                                                                                                                                                

# Import Settings router                                                                                                                                                                                                                                                                
try:                                                                                                                                                                                                                                                                
    from app.routes.settings import router as settings_router                                                                                                                                                                                                                                                              
    SETTINGS_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Settings router not available: {e}")                                                                                                                                                                                                                                                                
    SETTINGS_AVAILABLE = False                                                                                                                                                                                                                                                              
    settings_router = None                                                                                                                                                                                                                                                              

# Import User router                                                                                                                                                                                                                                                                
try:                                                                                                                                                                                                                                                                
    from app.routes.user import router as user_router                                                                                                                                                                                                                                                              
    USER_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: User router not available: {e}")                                                                                                                                                                                                                                                                
    USER_AVAILABLE = False                                                                                                                                                                                                                                                              
    user_router = None                                                                                                                                                                                                                                                              

# Import Sessions router                                                                                                                                                                                                                                                                
try:                                                                                                                                                                                                                                                                
    from app.routes.sessions import router as sessions_router                                                                                                                                                                                                                                                              
    SESSIONS_AVAILABLE = True                                                                                                                                                                                                                                                               
except ImportError as e:                                                                                                                                                                                                                                                                
    print(f"⚠️ Warning: Sessions router not available: {e}")                                                                                                                                                                                                                                                                
    SESSIONS_AVAILABLE = False                                                                                                                                                                                                                                                              
    sessions_router = None                                                                                                                                                                                                                                                              

# Import Notifications router — mounted by modules/notifications (Phase 3)
NOTIFICATIONS_AVAILABLE = False
notifications_router = None

# Organization → RAGSUITE_EE/modules/organization (Phase 5)
ORGANIZATION_AVAILABLE = False
organization_router = None

# SSO auth → RAGSUITE_EE/modules/sso (Phase 5)
AUTH_SSO_AVAILABLE = False
auth_sso_router = None



def mount_legacy_feature_routers(app: FastAPI) -> None:
    """Include all legacy feature routers and static/widget routes."""
    # Include routers in the desired order for API documentation                                                                                                                                                                                                                                                                
    app.include_router(crawl_router)                                                                                                                                                                                                                                                                
    if RAG_AVAILABLE and rag_router:
        app.include_router(rag_router)
        print("✅ RAG API router included")

    if RETRIEVE_AVAILABLE and retrieve_router:
        app.include_router(retrieve_router)
        print("✅ Retrieve router included")

    if N8N_AVAILABLE and n8n_router:
        app.include_router(n8n_router)
        print("✅ n8n router included")

    if FEEDBACK_MODERATION_AVAILABLE and feedback_moderation_router:
        app.include_router(feedback_moderation_router)
        print("✅ Feedback moderation router included")
    # documents → modules/documents (Phase 3)

    if API_KEYS_AVAILABLE and api_keys_router:                                                                                                                                                                                                                                                              
        app.include_router(api_keys_router)                                                                                                                                                                                                                                                             
        print("✅ API Keys router included")                                                                                                                                                                                                                                                                

    if INTEGRATIONS_AVAILABLE and integrations_router:                                                                                                                                                                                                                                                              
        app.include_router(integrations_router)                                                                                                                                                                                                                                                             
        print("✅ Integrations router included")                                                                                                                                                                                                                                                                

    try:
        from app.routes.widget import router as widget_embed_router
        app.include_router(widget_embed_router)
        print("✅ Widget embed-frame-policy router included")
    except ImportError as e:
        print(f"⚠️ Warning: Widget embed-frame-policy router not available: {e}")

    if PROJECTS_AVAILABLE and projects_router:                                                                                                                                                                                                                                                              
        app.include_router(projects_router)                                                                                                                                                                                                                                                             
        print("✅ Projects router included")                                                                                                                                                                                                                                                                

    if ONBOARDING_AVAILABLE and onboarding_router:                                                                                                                                                                                                                                                              
        app.include_router(onboarding_router)                                                                                                                                                                                                                                                               
        print("✅ Onboarding router included")                                                                                                                                                                                                                                                              

    if SETTINGS_AVAILABLE and settings_router:                                                                                                                                                                                                                                                              
        app.include_router(settings_router)                                                                                                                                                                                                                                                             
        print("✅ Settings router included")                                                                                                                                                                                                                                                                
    if USER_AVAILABLE and user_router:                                                                                                                                                                                                                                                              
        app.include_router(user_router)                                                                                                                                                                                                                                                             
        print("✅ User Profile router included")                                                                                                                                                                                                                                                                

    if SESSIONS_AVAILABLE and sessions_router:                                                                                                                                                                                                                                                              
        app.include_router(sessions_router)                                                                                                                                                                                                                                                             
        print("✅ Sessions router included")                                                                                                                                                                                                                                                                
    if NOTIFICATIONS_AVAILABLE and notifications_router:                                                                                                                                                                                                                                                                
        app.include_router(notifications_router)                                                                                                                                                                                                                                                                
        print("✅ Notifications router included")                                                                                                                                                                                                                                                               

    # Organization → RAGSUITE_EE/modules/organization (Phase 5)

    # SSO → RAGSUITE_EE/modules/sso (Phase 5)
        print("✅ Organization router included")

    # analytics → RAGSUITE_EE/modules/analytics (Phase 5)
    # health_router → modules/system_health (Phase 3)
    if OVERVIEW_AVAILABLE and overview_router:
        app.include_router(overview_router)
        print("✅ Overview router included")

    # analytics integration → RAGSUITE_EE/modules/analytics (Phase 5)

    try:                                                                                                                                                                                                                                                                
        from app.routes.prompt import router as prompt_router                                                                                                                                                                                                                                                              
        app.include_router(prompt_router)                                                                                                                                                                                                                                                               
        print("✅ Prompt API router included")                                                                                                                                                                                                                                                              
    except ImportError as e:                                                                                                                                                                                                                                                                
        print(f"⚠️ Warning: Prompt API router not available: {e}")                                                                                                                                                                                                                                                              

    app.include_router(webhooks_router)                                                                                                                                                                                                                                                             
    print("✅ Webhooks router included")                                                                                                                                                                                                                                                                

    app.include_router(chat_models_router)                                                                                                                                                                                                                                                              
    print("✅ Chat Models router included")                                                                                                                                                                                                                                                             

    app.include_router(search_models_router)                                                                                                                                                                                                                                                                
    print("✅ Search Models router included")                                                                                                                                                                                                                                                               

    app.include_router(search_config_router)
    print("✅ Search Configuration router included")

    # profiles_router → RAGSUITE_EE/modules/compare_models (Phase 5)

    try:
        from app.routes.embeddings import router as embeddings_router
        app.include_router(embeddings_router)
        print("✅ Embedding Selection router included")
    except Exception as _emb_router_err:
        print(f"⚠️ Warning: Embedding Selection router not available: {_emb_router_err}")

    try:
        from app.routes.chroma import router as chroma_router
        app.include_router(chroma_router)
        print("✅ Chroma health router included")
    except Exception as _chroma_router_err:
        print(f"⚠️ Warning: Chroma health router not available: {_chroma_router_err}")


    try:                                                                                                                                                                                                                                                                
        from app.routes.search_citation import router as search_citation_router                                                                                                                                                                                                                                                                
        app.include_router(search_citation_router)                                                                                                                                                                                                                                                              
        print("✅ Search Citation router included")                                                                                                                                                                                                                                                             
    except ImportError as e:                                                                                                                                                                                                                                                                
        print(f"⚠️ Warning: Search Citation router not available: {e}")                                                                                                                                                                                                                                                             

    try:                                                                                                                                                                                                                                                                
        from app.routes.chatbot import router as chatbot_router                                                                                                                                                                                                                                                                
        app.include_router(chatbot_router)                                                                                                                                                                                                                                                              
        print("✅ Chatbot router included")                                                                                                                                                                                                                                                             
    except ImportError as e:                                                                                                                                                                                                                                                                
        print(f"⚠️ Warning: Chatbot router not available: {e}")

    try:
        from app.routes.gmail import compat_router as gmail_compat_router
        from app.routes.gmail import router as gmail_router
        app.include_router(gmail_router)
        app.include_router(gmail_compat_router)
        print("✅ Gmail router included")
    except ImportError as e:
        print(f"⚠️ Warning: Gmail router not available: {e}")

    try:
        from app.routes.connectors import router as connectors_router
        app.include_router(connectors_router)
        print("✅ Connectors router included")
    except ImportError as e:
        print(f"⚠️ Warning: Connectors router not available: {e}")

    try:
        from app.routes.connectors_notion import router as connectors_notion_router
        app.include_router(connectors_notion_router)
        print("✅ Notion connector router included")
    except ImportError as e:
        print(f"⚠️ Warning: Notion connector router not available: {e}")

    try:
        from app.routes.connectors_confluence import router as connectors_confluence_router
        app.include_router(connectors_confluence_router)
        print("✅ Confluence connector router included")
    except ImportError as e:
        print(f"⚠️ Warning: Confluence connector router not available: {e}")

    try:
        from app.routes.connectors_sharepoint import router as connectors_sharepoint_router
        app.include_router(connectors_sharepoint_router)
        print("✅ SharePoint connector router included")
    except ImportError as e:
        print(f"⚠️ Warning: SharePoint connector router not available: {e}")

    try:
        from app.routes.connectors_slack import router as connectors_slack_router
        app.include_router(connectors_slack_router)
        print("✅ Slack connector router included")
    except ImportError as e:
        print(f"⚠️ Warning: Slack connector router not available: {e}")

    try:
        from app.routes.clickup import router as clickup_router
        app.include_router(clickup_router)
        print("✅ ClickUp router included")
    except ImportError as e:
        print(f"⚠️ Warning: ClickUp router not available: {e}")

    # audit → modules/audit_basic + EE audit_full (Phase 5)

    from fastapi.staticfiles import StaticFiles                                                                                                                                                                                                                                                             
    import os                                                                                                                                                                                                                                                               

    current_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))  # app/                                                                                                                                                                                                                                                                
    widget_directory = os.path.join(current_dir, "static", "widget")                                                                                                                                                                                                                                                                
    widget_dist_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "dist", "widget")

    if not os.path.exists(widget_directory):                                                                                                                                                                                                                                                                
        logger.warning(f"⚠️ Widget directory not found at: {widget_directory}")                                                                                                                                                                                                                                                             
        logger.warning("   Please copy widget files to this location to enable the embeddable widget")                                                                                                                                                                                                                                                              

    def _get_widget_file_path(filename: str):
        """Prefer static (post-build sync target), then dist fallback."""
        static_file_path = os.path.join(widget_directory, "v1", filename)
        if os.path.exists(widget_directory) and os.path.exists(static_file_path):
            return static_file_path

        dist_file_path = os.path.join(widget_dist_path, "v1", filename)
        if os.path.exists(widget_dist_path) and os.path.exists(dist_file_path):
            return dist_file_path

        return None

    def _widget_asset_cache_control(filename: str) -> str:
        """JS/CSS bundles: always revalidate so deploys are visible without stale browser cache."""
        if filename.endswith((".js", ".css", ".js.map")):
            return "no-cache, must-revalidate"
        return "public, max-age=3600"

    @app.get("/api/v1/widget/v1/loader.js")                                                                                                                                                                                                                                                             
    async def serve_widget_loader():                                                                                                                                                                                                                                                                
        """Serve widget loader.js file"""                                                                                                                                                                                                                                                               
        file_path = _get_widget_file_path("loader.js")
        if not file_path:
            raise HTTPException(status_code=404, detail="Widget loader not found")                                                                                                                                                                                                                                                              
        return FileResponse(                                                                                                                                                                                                                                                                
            file_path,                                                                                                                                                                                                                                                              
            media_type="application/javascript",                                                                                                                                                                                                                                                                
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": _widget_asset_cache_control("loader.js"),                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    @app.get("/api/v1/widget/v1/widget.umd.js")                                                                                                                                                                                                                                                             
    async def serve_widget_bundle():                                                                                                                                                                                                                                                                
        """Serve widget bundle (widget.umd.js)"""                                                                                                                                                                                                                                                               
        file_path = _get_widget_file_path("widget.umd.js")
        if not file_path:
            raise HTTPException(status_code=404, detail="Widget bundle not found")                                                                                                                                                                                                                                                              
        return FileResponse(                                                                                                                                                                                                                                                                
            file_path,                                                                                                                                                                                                                                                              
            media_type="application/javascript",                                                                                                                                                                                                                                                                
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": _widget_asset_cache_control("widget.umd.js"),                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    @app.get("/api/v1/widget/v1/widget.css")                                                                                                                                                                                                                                                                
    async def serve_widget_css():                                                                                                                                                                                                                                                               
        """Serve widget CSS file"""                                                                                                                                                                                                                                                             
        file_path = _get_widget_file_path("widget.css")
        if not file_path:
            raise HTTPException(status_code=404, detail="Widget CSS not found")                                                                                                                                                                                                                                                             
        return FileResponse(                                                                                                                                                                                                                                                                
            file_path,                                                                                                                                                                                                                                                              
            media_type="text/css",                                                                                                                                                                                                                                                              
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": _widget_asset_cache_control("widget.css"),                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    @app.get("/api/v1/widget/v1/{filename}")                                                                                                                                                                                                                                                                
    async def serve_widget_file(filename: str):                                                                                                                                                                                                                                                             
        """Serve any widget file from v1 directory"""                                                                                                                                                                                                                                                               
        # Validate filename                                                                                                                                                                                                                                                             
        if ".." in filename or "/" in filename:                                                                                                                                                                                                                                                             
            raise HTTPException(status_code=400, detail="Invalid filename")                                                                                                                                                                                                                                                             

        file_path = _get_widget_file_path(filename)
        if not file_path:
            # Determine media type for 404 response                                                                                                                                                                                                                                                             
            media_type_map = {                                                                                                                                                                                                                                                              
                ".js": "application/javascript",                                                                                                                                                                                                                                                                
                ".css": "text/css",                                                                                                                                                                                                                                                             
                ".map": "application/json"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
            _, ext = os.path.splitext(filename)                                                                                                                                                                                                                                                             
            media_type = media_type_map.get(ext, "application/octet-stream")                                                                                                                                                                                                                                                                
            raise HTTPException(status_code=404, detail="File not found")                                                                                                                                                                                                                                                               

        # Determine media type                                                                                                                                                                                                                                                              
        media_type_map = {                                                                                                                                                                                                                                                              
            ".js": "application/javascript",                                                                                                                                                                                                                                                                
            ".css": "text/css",                                                                                                                                                                                                                                                             
            ".map": "application/json"                                                                                                                                                                                                                                                              
        }                                                                                                                                                                                                                                                               
        _, ext = os.path.splitext(filename)                                                                                                                                                                                                                                                             
        media_type = media_type_map.get(ext, "application/octet-stream")                                                                                                                                                                                                                                                                

        return FileResponse(                                                                                                                                                                                                                                                                
            file_path,                                                                                                                                                                                                                                                              
            media_type=media_type,                                                                                                                                                                                                                                                              
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": _widget_asset_cache_control(filename),                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    # Serve Avatars                                                                                                                                                                                                                                                             
    from pathlib import Path                                                                                                                                                                                                                                                                

    @app.get("/api/v1/avatars/{avatar_filename}")                                                                                                                                                                                                                                                               
    async def serve_avatar(avatar_filename: str):                                                                                                                                                                                                                                                               
        """                                                                                                                                                                                                                                                             
        Serve avatar images for the widget.                                                                                                                                                                                                                                                             
        Handles requests like /api/v1/avatars/avatar-1.png                                                                                                                                                                                                                                                              
        """                                                                                                                                                                                                                                                             
        # Validate filename to prevent directory traversal attacks                                                                                                                                                                                                                                                              
        if not avatar_filename or ".." in avatar_filename or "/" in avatar_filename:                                                                                                                                                                                                                                                                
            raise HTTPException(status_code=400, detail="Invalid filename")                                                                                                                                                                                                                                                             

        # Path to avatars directory                                                                                                                                                                                                                                                             
        avatar_dir = os.path.join(current_dir, "static", "avatars")                                                                                                                                                                                                                                                             

        # Check if filename has an allowed extension                                                                                                                                                                                                                                                                
        allowed_extensions = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg')                                                                                                                                                                                                                                                             
        has_extension = any(avatar_filename.lower().endswith(ext) for ext in allowed_extensions)                                                                                                                                                                                                                                                                

        resolved_path = None                                                                                                                                                                                                                                                                
        resolved_filename = avatar_filename                                                                                                                                                                                                                                                             

        # 1. Explicit mapping for default-X style names (common in frontend)                                                                                                                                                                                                                                                                
        if not has_extension and avatar_filename.startswith("default-"):                                                                                                                                                                                                                                                                
             try:                                                                                                                                                                                                                                                               
                 # Extract the number/suffix                                                                                                                                                                                                                                                                
                 suffix = avatar_filename.split("default-")[1]                                                                                                                                                                                                                                                              
                 mapped_name = f"avatar-{suffix}.png"                                                                                                                                                                                                                                                               
                 mapped_path = os.path.join(avatar_dir, mapped_name)                                                                                                                                                                                                                                                                
                 if os.path.exists(mapped_path):                                                                                                                                                                                                                                                                
                     resolved_path = mapped_path                                                                                                                                                                                                                                                                
                     resolved_filename = mapped_name                                                                                                                                                                                                                                                                
             except Exception:                                                                                                                                                                                                                                                              
                 pass                                                                                                                                                                                                                                                               

        # 2. If still not resolved and no extension, try appending extensions                                                                                                                                                                                                                                                               
        if not resolved_path and not has_extension:                                                                                                                                                                                                                                                             
            for ext in allowed_extensions:                                                                                                                                                                                                                                                              
                potential_path = os.path.join(avatar_dir, f"{avatar_filename}{ext}")                                                                                                                                                                                                                                                                
                if os.path.exists(potential_path):                                                                                                                                                                                                                                                              
                    resolved_path = potential_path                                                                                                                                                                                                                                                              
                    resolved_filename = f"{avatar_filename}{ext}"                                                                                                                                                                                                                                                               
                    break                                                                                                                                                                                                                                                               

        # 3. If still not resolved, use the original path (might be 404, handled later)                                                                                                                                                                                                                                                             
        if not resolved_path:                                                                                                                                                                                                                                                               
            resolved_path = os.path.join(avatar_dir, avatar_filename)                                                                                                                                                                                                                                                               

        # Check if matched file exists                                                                                                                                                                                                                                                              
        if not os.path.exists(resolved_path):                                                                                                                                                                                                                                                               
            # Fallback to default avatar-1.png if file not found                                                                                                                                                                                                                                                                
            default_avatar = os.path.join(avatar_dir, "avatar-1.png")                                                                                                                                                                                                                                                               
            # Only fallback if the default exists                                                                                                                                                                                                                                                               
            if os.path.exists(default_avatar):                                                                                                                                                                                                                                                              
                return FileResponse(                                                                                                                                                                                                                                                                
                    default_avatar,                                                                                                                                                                                                                                                             
                    media_type="image/png",                                                                                                                                                                                                                                                             
                    headers={                                                                                                                                                                                                                                                               
                        "Cache-Control": "public, max-age=86400",  # Cache for 1 day                                                                                                                                                                                                                                                                
                        "Access-Control-Allow-Origin": "*"                                                                                                                                                                                                                                                              
                    }                                                                                                                                                                                                                                                               
                )                                                                                                                                                                                                                                                               
            raise HTTPException(status_code=404, detail=f"Avatar '{avatar_filename}' not found")                                                                                                                                                                                                                                                                

        # Determine media type based on resolved filename extension                                                                                                                                                                                                                                                             
        _, ext = os.path.splitext(resolved_filename)                                                                                                                                                                                                                                                                
        media_type_map = {                                                                                                                                                                                                                                                              
            '.png': 'image/png',                                                                                                                                                                                                                                                                
            '.jpg': 'image/jpeg',                                                                                                                                                                                                                                                               
            '.jpeg': 'image/jpeg',                                                                                                                                                                                                                                                              
            '.webp': 'image/webp',                                                                                                                                                                                                                                                              
            '.gif': 'image/gif',                                                                                                                                                                                                                                                                
            '.svg': 'image/svg+xml'                                                                                                                                                                                                                                                             
        }                                                                                                                                                                                                                                                               

        media_type = media_type_map.get(ext.lower(), 'image/png')                                                                                                                                                                                                                                                               

        return FileResponse(                                                                                                                                                                                                                                                                
            resolved_path,                                                                                                                                                                                                                                                              
            media_type=media_type,                                                                                                                                                                                                                                                              
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": "public, max-age=86400",  # Cache for 1 day                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*"  # Allow CORS for widget                                                                                                                                                                                                                                                             
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    @app.get("/api/v1/avatars")                                                                                                                                                                                                                                                             
    async def list_avatars():                                                                                                                                                                                                                                                               
        """                                                                                                                                                                                                                                                             
        List all available avatar files.                                                                                                                                                                                                                                                                
        Returns a list of avatar identifiers that can be used.                                                                                                                                                                                                                                                              
        """                                                                                                                                                                                                                                                             
        avatar_dir = os.path.join(current_dir, "static", "avatars")                                                                                                                                                                                                                                                             

        if not os.path.exists(avatar_dir):                                                                                                                                                                                                                                                              
            return {"avatars": []}                                                                                                                                                                                                                                                              

        avatars = []                                                                                                                                                                                                                                                                
        allowed_extensions = ('.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg')                                                                                                                                                                                                                                                             

        # Scan directory for avatar files                                                                                                                                                                                                                                                               
        for filename in os.listdir(avatar_dir):                                                                                                                                                                                                                                                             
            if any(filename.lower().endswith(ext) for ext in allowed_extensions):                                                                                                                                                                                                                                                               
                # Extract identifier (e.g., "avatar-1.png" -> "default-1")                                                                                                                                                                                                                                                              
                if filename.startswith("avatar-") and filename.endswith(".png"):                                                                                                                                                                                                                                                                
                    try:                                                                                                                                                                                                                                                                
                        # Extract number from "avatar-X.png"                                                                                                                                                                                                                                                                
                        number = filename.replace("avatar-", "").replace(".png", "")                                                                                                                                                                                                                                                                
                        avatar_id = f"default-{number}"                                                                                                                                                                                                                                                             
                        avatars.append({                                                                                                                                                                                                                                                                
                            "id": avatar_id,                                                                                                                                                                                                                                                                
                            "name": f"Default {number}",                                                                                                                                                                                                                                                                
                            "filename": filename,                                                                                                                                                                                                                                                               
                            "url": f"/api/v1/avatars/{filename}"                                                                                                                                                                                                                                                                
                        })                                                                                                                                                                                                                                                              
                    except:                                                                                                                                                                                                                                                             
                        pass                                                                                                                                                                                                                                                                

        # Sort by number                                                                                                                                                                                                                                                                
        avatars.sort(key=lambda x: int(x["id"].split("-")[1]) if x["id"].startswith("default-") else 999)                                                                                                                                                                                                                                                               

        return {"avatars": avatars}                                                                                                                                                                                                                                                             

    # Serve search widget files - PROPERLY CONFIGURED WITH MANUAL ROUTE HANDLERS                                                                                                                                                                                                                                                                
    from fastapi.responses import FileResponse                                                                                                                                                                                                                                                              
    search_widget_dist_path = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "dist", "search-widget")
    search_widget_static_path = os.path.join(current_dir, "static", "search-widget")                                                                                                                                                                                                                                                                

    def _get_search_widget_file_path(filename: str):                                                                                                                                                                                                                                                                
        """Prefer static (post-build sync target), then dist fallback."""                                                                                                                                                                                                                                                              
        if os.path.exists(search_widget_static_path):                                                                                                                                                                                                                                                               
            static_file_path = os.path.join(search_widget_static_path, "v1", filename)                                                                                                                                                                                                                                                              
            if os.path.exists(static_file_path):                                                                                                                                                                                                                                                                
                return static_file_path                                                                                                                                                                                                                                                             

        dist_file_path = os.path.join(search_widget_dist_path, "v1", filename)                                                                                                                                                                                                                                                              
        if os.path.exists(search_widget_dist_path) and os.path.exists(dist_file_path):                                                                                                                                                                                                                                                              
            return dist_file_path                                                                                                                                                                                                                                                               

        return None                                                                                                                                                                                                                                                             

    @app.get("/api/v1/search-widget/v1/{filename}")                                                                                                                                                                                                                                                             
    async def serve_search_widget_file(filename: str):                                                                                                                                                                                                                                                              
        """                                                                                                                                                                                                                                                             
        Serve search widget static files manually to ensure correct headers and methods.                                                                                                                                                                                                                                                                
        Supports: loader.js, search-widget.css, search-widget.umd.js, search-widget.umd.js.map                                                                                                                                                                                                                                                              
        """                                                                                                                                                                                                                                                             
        # Security check: only allow specific filenames to prevent directory traversal                                                                                                                                                                                                                                                              
        allowed_files = [                                                                                                                                                                                                                                                               
            "loader.js",
            "ragsuite-init.js",
            "search-widget.css",
            "search-widget.umd.js",                                                                                                                                                                                                                                                                 
            "search-widget.umd.js.map"                                                                                                                                                                                                                                                              
        ]                                                                                                                                                                                                                                                               

        if filename not in allowed_files:                                                                                                                                                                                                                                                               
            # Fallback for other files if needed, but strictly validate path                                                                                                                                                                                                                                                                
            if ".." in filename or "/" in filename:                                                                                                                                                                                                                                                             
                 raise HTTPException(status_code=403, detail="Invalid filename")                                                                                                                                                                                                                                                                

        file_path = _get_search_widget_file_path(filename)                                                                                                                                                                                                                                                              

        if not file_path:                                                                                                                                                                                                                                                               
            logger.warning(f"⚠️ Search Widget file not found: {filename}")                                                                                                                                                                                                                                                              
            raise HTTPException(status_code=404, detail=f"File not found: {filename}")                                                                                                                                                                                                                                                              

        # Set correct content type                                                                                                                                                                                                                                                              
        content_type_map = {                                                                                                                                                                                                                                                                
            "js": "application/javascript",                                                                                                                                                                                                                                                             
            "css": "text/css",                                                                                                                                                                                                                                                              
            "map": "application/json"                                                                                                                                                                                                                                                               
        }                                                                                                                                                                                                                                                               

        # Determine extension                                                                                                                                                                                                                                                               
        ext = filename.split(".")[-1]                                                                                                                                                                                                                                                               
        # Special case for .map                                                                                                                                                                                                                                                             
        if filename.endswith(".map"):                                                                                                                                                                                                                                                               
            ext = "map"                                                                                                                                                                                                                                                             

        content_type = content_type_map.get(ext, "application/octet-stream")                                                                                                                                                                                                                                                                

        logger.info(f"✅ Serving search widget file: {filename} from {file_path}")                                                                                                                                                                                                                                                              

        return FileResponse(                                                                                                                                                                                                                                                                
            file_path,                                                                                                                                                                                                                                                              
            media_type=content_type,                                                                                                                                                                                                                                                                
            headers={                                                                                                                                                                                                                                                               
                "Cache-Control": "no-cache",                                                                                                                                                                                                                                                                
                "Access-Control-Allow-Origin": "*",                                                                                                                                                                                                                                                                 
                "Access-Control-Allow-Methods": "GET, OPTIONS",                                                                                                                                                                                                                                                             
                "Access-Control-Allow-Headers": "*"                                                                                                                                                                                                                                                             
            }                                                                                                                                                                                                                                                               
        )                                                                                                                                                                                                                                                               

    # Serve canonical single-project search init script.
    @app.get("/api/v1/search-widget/v1/ragsuite-init.js")
    async def serve_search_widget_init_alias():
        file_path = _get_search_widget_file_path("ragsuite-init.js")
        if not file_path:
            logger.warning("⚠️ Search widget init script requested but file not found")
            raise HTTPException(status_code=404, detail="Search widget init script not found")

        logger.info("✅ Serving search widget init script: ragsuite-init.js")
        return FileResponse(
            file_path,
            media_type="application/javascript",
            headers={
                "Cache-Control": "no-cache",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, OPTIONS",
                "Access-Control-Allow-Headers": "*",
            },
        )

    logger.info("✅ Search Widget manual routes configured")                                                                                                                                                                                                                                                                

    @app.get("/")                                                                                                                                                                                                                                                               
    async def root():                                                                                                                                                                                                                                                               
        endpoints = {                                                                                                                                                                                                                                                               
            "message": "RAGSuite API",                                                                                                                                                                                                                                                              
            "version": settings.app_version,                                                                                                                                                                                                                                                                
            "docs": "/docs",                                                                                                                                                                                                                                                                
            "endpoints": {                                                                                                                                                                                                                                                              
                "crawler": "/api/v1/crawl",                                                                                                                                                                                                                                                             
                "rag": "/api/v1/search, /api/v1/chat",                                                                                                                                                                                                                                                              
                "api_keys": "/api/v1/api-keys",                                                                                                                                                                                                                                                             
                "projects": "/api/v1/projects",                                                                                                                                                                                                                                                             
                "onboarding": "/api/v1/onboarding",                                                                                                                                                                                                                                                             
                "analytics": "/api/v1/analytics",                                                                                                                                                                                                                                                               
                "health": "/api/v1/health"                                                                                                                                                                                                                                                              
            }                                                                                                                                                                                                                                                               
        }                                                                                                                                                                                                                                                               
        if RAG_AVAILABLE:                                                                                                                                                                                                                                                               
            endpoints["endpoints"]["rag"] = "/api/v1/search, /api/v1/chat, /api/v1/upload"                                                                                                                                                                                                                                                              
        return endpoints                                                                                                                                                                                                                                                                
