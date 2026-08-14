"""
Pydantic schemas for API request/response validation
"""
from pydantic import BaseModel, HttpUrl, Field, EmailStr
from typing import List, Optional, Dict, Any, Union
from datetime import datetime
from enum import Enum
import uuid
from .defaults import DEFAULT_EMBEDDING_MODEL

# Must match frontend sign-in / profile: letters, numbers, underscore; 3–24 chars.
USERNAME_PATTERN = r"^[A-Za-z0-9_]{3,24}$"
USERNAME_MIN_LENGTH = 3
USERNAME_MAX_LENGTH = 24

# Compatibility import for field_validator and model_validator (pydantic v2) vs validator (pydantic v1)
try:
    from pydantic import field_validator, model_validator
    PYDANTIC_V2 = True
except ImportError:
    PYDANTIC_V2 = False
    # Fallback for pydantic v1 - create a compatibility wrapper
    from pydantic import validator, root_validator
    
    def field_validator(*fields, mode='before', **kwargs):
        """Compatibility wrapper for pydantic v1 validator"""
        # In pydantic v1, mode='before' means pre=True, mode='after' means pre=False
        pre = (mode == 'before')
        return validator(*fields, pre=pre, **kwargs)
    
    def model_validator(*args, mode='before', **kwargs):
        """Compatibility wrapper for pydantic v1 root_validator"""
        pre = (mode == 'before')
        return root_validator(pre=pre, **kwargs)

# Enums
class CrawlCadence(str, Enum):
    ONCE = "ONCE"
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"

class CrawlHeadlessMode(str, Enum):
    AUTO = "AUTO"
    ON = "ON"
    OFF = "OFF"

class CrawlJobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    INDEXING = "INDEXING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    WAITING = "WAITING"

class CrawlSourceStatus(str, Enum):
    READY = "READY"
    PENDING = "PENDING"
    DISABLED = "DISABLED"

class QueryMode(str, Enum):
    SEARCH = "search"
    CHAT = "chat"
    AUTO = "auto"

class APIKeyEnvironment(str, Enum):
    PRODUCTION = "Production"
    STAGING = "Staging"
    DEVELOPMENT = "Development"

class APIKeyExpirationOption(str, Enum):
    NEVER = "Never expires"
    DAYS_30 = "30 days"
    DAYS_90 = "90 days"
    YEAR_1 = "1 year"

# Response Configuration Enum (for search)
class ResponseType(str, Enum):
    LONG = "long"
    SHORT = "short"

# User Schemas
class UserCreate(BaseModel):
    username: str = Field(
        ...,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        pattern=USERNAME_PATTERN,
    )
    email: EmailStr = Field(...)
    password: str = Field(..., min_length=8, max_length=100)

class UserLogin(BaseModel):
    username: str = Field(...)
    password: str = Field(...)

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class UserWithToken(UserResponse):
    access_token: str
    token_type: str = "bearer"


class PublicAuthConfigOut(BaseModel):
    registration_enabled: bool = Field(
        ...,
        description="Whether self-service public signup is enabled on this deployment",
    )
    sso_enabled: bool = Field(default=False, description="Whether SSO login is enabled for this org")
    organization_slug: Optional[str] = Field(default=None, description="Organization slug for login context")


class SsoDiscoverOut(BaseModel):
    org_slug: Optional[str] = None
    sso_enabled: bool = False
    provider: Optional[str] = None


class SsoStartOut(BaseModel):
    authorize_url: str = Field(..., description="Google OIDC authorize URL for full-page redirect")


class RegistrationPendingResponse(BaseModel):
    """Returned when signup succeeds but email must be verified before login."""
    status: str = Field(default="pending_verification")
    message: str = Field(
        default="Account created. Please check your email to verify your address before signing in."
    )
    email: str
    email_verified: bool = False


class VerifyEmailRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address used at registration")
    code: str = Field(..., min_length=4, max_length=8, description="6-digit verification code from email")


class ResendVerificationRequest(BaseModel):
    email: EmailStr = Field(..., description="Email address used at registration")


class ResendVerificationResponse(BaseModel):
    message: str = Field(
        default="If an account exists with this email and is not yet verified, a verification code has been sent."
    )


class VerifyEmailResponse(BaseModel):
    status: str = Field(default="verified")
    message: str = Field(default="Email verified successfully.")
    access_token: Optional[str] = None
    token_type: Optional[str] = None
    user: Optional[UserResponse] = None
    redirect_to: str = Field(default="/onboarding", description="Where to navigate after verify (auto sign-in)")

# User Profile Schemas
class UserProfileUpdate(BaseModel):
    """Schema for updating user profile - email is excluded as it's static/immutable"""
    username: Optional[str] = Field(
        None,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        pattern=USERNAME_PATTERN,
        description="Username (letters, numbers, underscore; 3–24 chars)",
    )
    job_title: Optional[str] = Field(None, max_length=100, description="Job title")
    department: Optional[str] = Field(None, max_length=100, description="Department")
    phone_number: Optional[str] = Field(None, max_length=50, description="Phone number")
    location: Optional[str] = Field(None, max_length=255, description="Location")
    timezone: Optional[str] = Field(None, max_length=100, description="Timezone")
    bio: Optional[str] = Field(None, description="Bio/About me")
    avatar: Optional[str] = Field(None, description="Avatar URL or base64 data URL")
    login_notifications: Optional[bool] = Field(None, description="Whether to receive login notifications")

class UserProfileResponse(BaseModel):
    """Schema for user profile response - email is included but read-only"""
    id: int
    username: str
    email: str  # Read-only field - cannot be updated
    is_active: bool
    is_admin: bool
    created_at: datetime
    last_login: Optional[datetime] = None
    job_title: Optional[str] = None
    department: Optional[str] = None
    phone_number: Optional[str] = None
    location: Optional[str] = None
    timezone: Optional[str] = None
    bio: Optional[str] = None
    avatar: Optional[str] = None
    login_notifications: Optional[bool] = None  # Whether to receive login notifications
    access_token: Optional[str] = Field(None, description="New access token (only provided when username changes)")
    token_type: Optional[str] = Field(None, description="Token type (only provided when username changes)")
    
    class Config:
        from_attributes = True

class PasswordChange(BaseModel):
    """Schema for changing user password"""
    current_password: str = Field(..., min_length=1, description="Current password")
    new_password: str = Field(..., min_length=8, max_length=100, description="New password (min 8 characters)")
    confirm_password: str = Field(..., min_length=8, max_length=100, description="Confirm new password")

# Two-Factor Authentication Schemas
class TwoFactorSetupResponse(BaseModel):
    """Response schema for 2FA setup - returns secret and QR code"""
    secret: str = Field(..., description="TOTP secret key (base32)")
    qr_code_url: str = Field(..., description="QR code as data URL (base64 encoded image)")
    backup_codes: List[str] = Field(..., description="List of backup codes (show only once)")

class TwoFactorVerifyRequest(BaseModel):
    """Request schema for verifying TOTP code during 2FA setup"""
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code from authenticator app")

class TwoFactorDisableRequest(BaseModel):
    """Request schema for disabling 2FA"""
    password: str = Field(..., min_length=1, description="Current password for verification")
    code: Optional[str] = Field(None, min_length=6, max_length=6, description="6-digit TOTP code (required if 2FA is enabled)")

class TwoFactorEmailEnableRequest(BaseModel):
    """Request schema for enabling/disabling email-based 2FA"""
    password: str = Field(..., min_length=1, description="Current password for verification")

class TwoFactorStatusResponse(BaseModel):
    """Response schema for 2FA status"""
    is_2fa_enabled: bool = Field(..., description="Whether TOTP 2FA is enabled")
    has_backup_codes: bool = Field(..., description="Whether user has backup codes remaining")
    email_2fa_enabled: bool = Field(default=False, description="Whether email-based 2FA is enabled")

class BackupCodesResponse(BaseModel):
    """Response schema for backup codes generation"""
    backup_codes: List[str] = Field(..., description="List of new backup codes (show only once)")

class Login2FARequest(BaseModel):
    """Request schema for 2FA verification during login"""
    temp_token: str = Field(..., description="Temporary token from login endpoint")
    code: str = Field(..., min_length=6, max_length=6, description="6-digit TOTP code or backup code")

class Login2FAResponse(BaseModel):
    """Response schema for 2FA login verification"""
    access_token: str = Field(..., description="Full access token after 2FA verification")
    token_type: str = Field(default="bearer", description="Token type")
    user: UserResponse = Field(..., description="User information")

class Login2FAResendRequest(BaseModel):
    """Request schema for resending login 2FA email code"""
    temp_token: str = Field(..., description="Temporary token from login endpoint")

class Login2FAResendResponse(BaseModel):
    """Response schema for login 2FA code resend"""
    message: str = Field(..., description="Status message")
    expires_in_minutes: int = Field(..., description="OTP validity in minutes")

class LoginResponse(BaseModel):
    """Response schema for login - may require 2FA"""
    requires_2fa: bool = Field(..., description="Whether 2FA verification is required")
    temp_token: Optional[str] = Field(None, description="Temporary token for 2FA verification (only if requires_2fa is true)")
    access_token: Optional[str] = Field(None, description="Access token (only if requires_2fa is false)")
    token_type: Optional[str] = Field(None, description="Token type")
    user: Optional[UserResponse] = Field(None, description="User information (only if requires_2fa is false)")

# Session Schemas
class UserSession(BaseModel):
    id: uuid.UUID
    device_info: Optional[str] = None
    ip_address: Optional[str] = None
    location: Optional[str] = None
    created_at: datetime
    last_activity: Optional[datetime] = None
    expires_at: datetime
    is_current: bool = False

    class Config:
        from_attributes = True

class UserSessionsResponse(BaseModel):
    sessions: List[UserSession]

class RevokeSessionResponse(BaseModel):
    message: str

class RevokeAllSessionsResponse(BaseModel):
    message: str
    revoked_count: int

# Notification Schemas
class NotificationCreate(BaseModel):
    """Schema for creating a notification"""
    user_id: int
    title: str
    message: str
    type: str = Field(default="info", description="Notification type: info, success, warning, error")
    action_url: Optional[str] = None

class NotificationResponse(BaseModel):
    """Schema for notification response"""
    id: uuid.UUID
    user_id: int
    title: str
    message: str
    type: str
    is_read: bool
    action_url: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True

class NotificationUpdate(BaseModel):
    """Schema for updating a notification"""
    is_read: Optional[bool] = None

# Project Schemas
class ProjectCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Project name")
    description: Optional[str] = Field(None, max_length=5000, description="Project description")

class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)
    is_active: Optional[bool] = None

class ProjectOut(BaseModel):
    id: uuid.UUID
    name: str
    description: Optional[str]
    owner_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime
    permissions: List[str] = Field(default_factory=list)

    class Config:
        from_attributes = True


class ProjectListResponse(BaseModel):
    projects: List[ProjectOut]
    total: int
    active_project_id: Optional[uuid.UUID] = None
    active_permissions: List[str] = Field(default_factory=list)
    workspace_permissions: List[str] = Field(default_factory=list)
    can_create_project: bool = False


class OrganizationRole(str, Enum):
    ORG_ADMIN = "org_admin"
    MEMBER = "member"


class OrgSsoConfigUpdate(BaseModel):
    enabled: bool = False
    client_id: Optional[str] = Field(default=None, max_length=512)
    client_secret: Optional[str] = Field(default=None, max_length=512)
    email_domains: List[str] = Field(default_factory=list)
    jit_provisioning_enabled: bool = False
    default_role: OrganizationRole = Field(
        default=OrganizationRole.MEMBER,
        description="JIT default role; only member is allowed in phase 1",
    )

    @field_validator("default_role")
    @classmethod
    def reject_org_admin_default_role(cls, value: OrganizationRole) -> OrganizationRole:
        if value == OrganizationRole.ORG_ADMIN:
            raise ValueError("default_role cannot be org_admin")
        return value


class OrgSsoConfigOut(BaseModel):
    enabled: bool = False
    protocol: str = "oidc"
    provider: str = "google"
    client_id: Optional[str] = None
    client_secret_configured: bool = False
    authorization_url: Optional[str] = None
    token_url: Optional[str] = None
    jwks_uri: Optional[str] = None
    idp_entity_id: Optional[str] = None
    email_domains: List[str] = Field(default_factory=list)
    jit_provisioning_enabled: bool = False
    default_role: OrganizationRole = OrganizationRole.MEMBER
    callback_url: Optional[str] = None


class OrgSsoTestOut(BaseModel):
    ok: bool
    message: str
    issuer: Optional[str] = None


class OrgProjectPermission(str, Enum):
    PROJECT_READ = "project:read"
    PROJECT_WRITE = "project:write"
    PROJECT_CREATE = "project:create"
    PROJECT_ADMIN = "project:admin"
    CRAWL_MANAGE = "crawl:manage"
    DOCUMENTS_MANAGE = "documents:manage"
    CONNECTORS_MANAGE = "connectors:manage"
    CONNECTORS_GMAIL = "connectors:gmail"
    CONNECTORS_DRIVE = "connectors:drive"
    CONNECTORS_NOTION = "connectors:notion"
    CONNECTORS_CONFLUENCE = "connectors:confluence"
    CONNECTORS_SLACK = "connectors:slack"
    CONNECTORS_SHAREPOINT = "connectors:sharepoint"
    CHAT_USE = "chat:use"
    CHATBOT_SETTINGS = "chatbot:settings"
    CHATBOT_INTEGRATIONS = "chatbot:integrations"
    SEARCH_USE = "search:use"
    SEARCH_SETTINGS = "search:settings"
    SEARCH_INTEGRATIONS = "search:integrations"
    COMPARE_USE = "compare:use"
    HISTORY_READ = "history:read"
    ANALYTICS_READ = "analytics:read"
    API_KEYS_MANAGE = "api_keys:manage"
    WIDGETS_MANAGE = "widgets:manage"
    SETTINGS_MANAGE = "settings:manage"
    FEEDBACK_MODERATE = "feedback:moderate"
    SETTINGS_GLOBAL = "settings:global"
    SETTINGS_DATA_RETENTION = "settings:data_retention"
    SETTINGS_I18N = "settings:i18n"
    PROFILE_GENERAL = "profile:general"
    PROFILE_SECURITY = "profile:security"


class OrgSummaryOut(BaseModel):
    id: int
    name: str
    slug: str
    max_users: int
    max_projects: int
    registration_enabled: bool
    member_count: int
    project_count: int


class OrgSummaryUpdate(BaseModel):
    name: Optional[str] = Field(default=None, min_length=2, max_length=255)
    registration_enabled: Optional[bool] = None
    default_member_permissions: Optional[List[OrgProjectPermission]] = None


class OrgProjectAssignment(BaseModel):
    project_id: uuid.UUID
    permissions: List[OrgProjectPermission] = Field(default_factory=list)


class OrgUserCreate(BaseModel):
    username: str = Field(
        ...,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        pattern=USERNAME_PATTERN,
    )
    email: EmailStr
    role: OrganizationRole = OrganizationRole.MEMBER
    send_invite_email: bool = True
    project_assignments: List[OrgProjectAssignment] = Field(default_factory=list)


class InviteSetupPreviewOut(BaseModel):
    username: str
    email: str
    organization_name: str
    role: str
    expires_at: datetime
    expired: bool


class InviteSetupCompleteIn(BaseModel):
    token: str = Field(..., min_length=10)
    username: str = Field(
        ...,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        pattern=USERNAME_PATTERN,
    )
    current_password: str = Field(..., min_length=1, max_length=100)
    new_password: str = Field(..., min_length=8, max_length=100)
    confirm_password: str = Field(..., min_length=8, max_length=100)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str = (
        "If an account exists for this email, a password reset link has been sent."
    )


class PasswordResetPreviewOut(BaseModel):
    username: str
    email: str
    organization_name: str
    role: str
    expires_at: datetime
    expired: bool


class PasswordResetCompleteIn(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=100)
    confirm_password: str = Field(..., min_length=8, max_length=100)

    @model_validator(mode="after")
    def passwords_match(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        return self


class OrgUserUpdate(BaseModel):
    username: Optional[str] = Field(
        default=None,
        min_length=USERNAME_MIN_LENGTH,
        max_length=USERNAME_MAX_LENGTH,
        pattern=USERNAME_PATTERN,
    )
    email: Optional[EmailStr] = None
    role: Optional[OrganizationRole] = None
    is_active: Optional[bool] = None
    department: Optional[str] = Field(default=None, max_length=100)
    job_title: Optional[str] = Field(default=None, max_length=100)


class OrgUserOut(BaseModel):
    id: int
    username: str
    email: str
    is_active: bool
    role: OrganizationRole
    invite_status: Optional[str] = None
    created_at: datetime
    last_login: Optional[datetime] = None


class OrgUserListOut(BaseModel):
    users: List[OrgUserOut]
    total: int


class OrgUserProjectsOut(BaseModel):
    user_id: int
    assignments: List[OrgProjectAssignment]

# Settings Schemas
class SettingsCreate(BaseModel):
    org_name: str = Field(..., min_length=1, max_length=255, description="Organization name")
    logo_data_url: Optional[str] = Field(None, description="Logo as data URL (base64 encoded image)")
    primary_color: Optional[str] = Field(None, description="Primary color hex code (e.g., #1a40eb)")

class SettingsOut(BaseModel):
    org_name: str
    logo_data_url: Optional[str] = None
    primary_color: Optional[str] = None
    
    class Config:
        from_attributes = True

# Chatbot Configuration Schemas
class ChatbotConfigurationCreate(BaseModel):
    chatbot_title: Optional[str] = Field(None, min_length=1, max_length=255, description="Chatbot title")
    short_description: Optional[str] = Field(None, max_length=500, description="Short description")
    bubble_message: Optional[str] = Field(None, max_length=200, description="Bubble message shown on widget trigger")
    welcome_message: Optional[str] = Field(None, max_length=500, description="Welcome message")
    chatbot_language: Optional[str] = Field(None, max_length=10, description="Chatbot language code (e.g., 'en', 'es')")
    feedback_enabled: Optional[bool] = Field(None, description="Whether to collect user feedback in the chatbot")

class ChatbotConfigurationOut(BaseModel):
    chatbot_title: str
    short_description: Optional[str] = None
    bubble_message: Optional[str] = None
    welcome_message: str
    chatbot_language: str
    feedback_enabled: bool = True
    
    class Config:
        from_attributes = True

# Widget Customization Schemas
class WidgetCustomizationCreate(BaseModel):
    widget_logo_url: Optional[str] = Field(None, description="Widget logo URL or data URL")
    widget_avatar: Optional[str] = Field(None, description="Widget avatar identifier or URL")
    widget_avatar_size: Optional[int] = Field(None, ge=15, le=200, description="Avatar size in pixels")
    widget_chatbot_color: Optional[str] = Field(None, description="Chatbot color (hex or gradient)")
    widget_background_color: Optional[str] = Field(None, description="Widget chat area background color (hex)")
    widget_text_color: Optional[str] = Field(None, description="Widget chat area text color (hex)")
    widget_width: Optional[int] = Field(None, ge=320, le=900, description="Custom chat window width in pixels (null = default 448)")
    widget_show_logo: Optional[bool] = Field(None, description="Show logo in widget")
    widget_show_date_time: Optional[bool] = Field(None, description="Show date and time in messages")
    widget_bottom_space: Optional[int] = Field(None, ge=15, le=200, description="Bottom space in pixels")
    widget_font_size: Optional[int] = Field(None, ge=12, le=20, description="Font size in pixels")
    widget_trigger_border_radius: Optional[int] = Field(None, ge=0, le=50, description="Border radius for trigger button")
    widget_position: Optional[str] = Field(None, description="Widget position (bottom-right, bottom-left, top-right, top-left)")
    widget_z_index: Optional[int] = Field(None, description="Widget z-index")
    widget_offset_x: Optional[int] = Field(None, description="Widget X offset in pixels")
    widget_offset_y: Optional[int] = Field(None, description="Widget Y offset in pixels")

class WidgetCustomizationOut(BaseModel):
    widget_logo_url: Optional[str] = None
    widget_avatar: str
    widget_avatar_size: int
    widget_chatbot_color: str
    widget_background_color: str
    widget_text_color: str
    widget_width: Optional[int] = None
    widget_show_logo: bool
    widget_show_date_time: bool
    widget_bottom_space: int
    widget_font_size: int
    widget_trigger_border_radius: int
    widget_position: str
    widget_z_index: int
    widget_offset_x: int
    widget_offset_y: int
    
    class Config:
        from_attributes = True

# Combined Chatbot Settings Schema
class ChatbotSettingsOut(BaseModel):
    configuration: ChatbotConfigurationOut
    customization: WidgetCustomizationOut
    
    class Config:
        from_attributes = True

# LLM Config Schemas
class ChatConfigCreate(BaseModel):
    model_provider: str = Field("openai", description="LLM provider (openai, anthropic, etc.)")
    chat_model: str = Field("gpt-4", description="Chat model name")
    embedding_model: str = Field(DEFAULT_EMBEDDING_MODEL, description="Embedding model name")
    api_key: Optional[str] = Field(None, description="API Key for the provider")

# Keep LLMConfigCreate as alias for backward compatibility
LLMConfigCreate = ChatConfigCreate

class ChatConfigUpdate(BaseModel):
    model_provider: Optional[str] = Field(None)
    chat_model: Optional[str] = Field(None)
    search_model: Optional[str] = Field(None, description="Model name for search functionality")
    embedding_model: Optional[str] = Field(None)
    api_key: Optional[str] = Field(None)
    # Chat-specific generation parameters
    chat_temperature: Optional[str] = Field(None, description="Temperature for chat (0.0-2.0)")
    chat_top_p: Optional[str] = Field(None, description="Top P for chat (0.0-1.0)")
    chat_best_of: Optional[int] = Field(None, ge=1, description="Best Of for chat (positive integer)")
    chat_frequency_penalty: Optional[str] = Field(None, description="Frequency penalty for chat (-2.0 to 2.0)")
    chat_presence_penalty: Optional[str] = Field(None, description="Presence penalty for chat (-2.0 to 2.0)")
    # Search-specific generation parameters
    search_temperature: Optional[str] = Field(None, description="Temperature for search (0.0-2.0)")
    search_top_p: Optional[str] = Field(None, description="Top P for search (0.0-1.0)")
    search_best_of: Optional[int] = Field(None, ge=1, description="Best Of for search (positive integer)")
    search_frequency_penalty: Optional[str] = Field(None, description="Frequency penalty for search (-2.0 to 2.0)")
    search_presence_penalty: Optional[str] = Field(None, description="Presence penalty for search (-2.0 to 2.0)")
    # Search-specific RAG parameters
    search_top_k: Optional[int] = Field(None, ge=1, le=50, description="Number of documents to retrieve for search")
    search_similarity_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Minimum similarity score for document inclusion in search")
    search_max_tokens: Optional[int] = Field(None, ge=0, le=3000, description="Maximum tokens for search responses (0=unlimited, max 3000)")
    search_use_reranker: Optional[bool] = Field(None, description="Use reranker to improve result relevance in search")
    # Chat-specific RAG parameters
    chat_top_k: Optional[int] = Field(None, ge=1, le=50, description="Number of documents to retrieve for chat")
    chat_similarity_threshold: Optional[float] = Field(None, ge=0.0, le=1.0, description="Minimum similarity score for document inclusion in chat")
    chat_max_tokens: Optional[int] = Field(None, ge=0, le=3000, description="Maximum tokens for chat responses (0=unlimited, max 3000)")
    chat_use_reranker: Optional[bool] = Field(None, description="Use reranker to improve result relevance in chat")
    # Search response type (for search model configuration)
    response_type: Optional[ResponseType] = Field(None, description="Response type for search: 'long' (700-800 words) or 'short' (350-400 words)")

    if PYDANTIC_V2:
        @model_validator(mode='after')
        def validate_api_key_for_provider(self):
            """
            Validate that API key is provided for non-Ollama providers.
            Only validates when both model_provider AND api_key are being set.
            Does not validate API key format or validity - that's handled by the test endpoint.
            Treats empty strings as None (meaning "don't update existing API key").
            """
            # Only validate if model_provider is being set
            if self.model_provider is None:
                return self
            
            # Normalize empty strings to None (treat as "don't update")
            # This handles cases where frontend sends empty string instead of omitting the field
            if isinstance(self.api_key, str) and self.api_key.strip() == "":
                self.api_key = None
            
            # If api_key is None (or was normalized to None), it means it's not being updated, so skip validation
            # (the existing saved API key will be used from the database)
            if self.api_key is None:
                return self
            
            provider_lower = self.model_provider.lower()
            
            # Check if provider requires API key (all except ollama/custom)
            requires_api_key = True
            if "ollama" in provider_lower or "custom" in provider_lower:
                requires_api_key = False
            
            # If API key is required and provided, it should not be empty (already checked above, but double-check)
            if requires_api_key:
                if not self.api_key or (isinstance(self.api_key, str) and self.api_key.strip() == ""):
                    raise ValueError(f"API key is required for {self.model_provider} provider. Please provide a valid API key.")
            
            return self
    else:
        @model_validator(mode='after')
        def validate_api_key_for_provider(cls, values):
            """
            Validate that API key is provided for non-Ollama providers (Pydantic V1 compatibility).
            """
            model_provider = values.get('model_provider')
            api_key = values.get('api_key')

            # Only validate if model_provider is being set
            if model_provider is None:
                return values
            
            # Normalize empty strings to None (treat as "don't update")
            if isinstance(api_key, str) and api_key.strip() == "":
                api_key = None
                values['api_key'] = None
            
            # If api_key is None, it means it's not being updated, so skip validation
            if api_key is None:
                return values
            
            provider_lower = model_provider.lower()
            
            # Check if provider requires API key (all except ollama/custom)
            requires_api_key = True
            if "ollama" in provider_lower or "custom" in provider_lower:
                requires_api_key = False
            
            # If API key is required and provided, it should not be empty
            if requires_api_key:
                if not api_key or (isinstance(api_key, str) and api_key.strip() == ""):
                    raise ValueError(f"API key is required for {model_provider} provider. Please provide a valid API key.")
            
            return values

# Keep LLMConfigUpdate as alias for backward compatibility (used by search endpoints)
LLMConfigUpdate = ChatConfigUpdate

class ChatConfigOut(BaseModel):
    model_provider: str
    chat_model: str
    search_model: Optional[str] = None
    embedding_model: str
    api_key: Optional[str] = None
    # Chat-specific generation parameters
    chat_temperature: Optional[str] = None
    chat_top_p: Optional[str] = None
    chat_best_of: Optional[int] = None
    chat_frequency_penalty: Optional[str] = None
    chat_presence_penalty: Optional[str] = None
    # Search-specific generation parameters
    search_temperature: Optional[str] = None
    search_top_p: Optional[str] = None
    search_best_of: Optional[int] = None
    search_frequency_penalty: Optional[str] = None
    search_presence_penalty: Optional[str] = None
    # Search-specific RAG parameters
    search_top_k: Optional[int] = None
    search_similarity_threshold: Optional[float] = None
    search_max_tokens: Optional[int] = None
    search_use_reranker: Optional[bool] = None
    # Chat-specific RAG parameters
    chat_top_k: Optional[int] = None
    chat_similarity_threshold: Optional[float] = None
    chat_max_tokens: Optional[int] = None
    chat_use_reranker: Optional[bool] = None
    # Search response type (for search model configuration)
    response_type: Optional[str] = None  # "long" or "short"
    
    class Config:
        from_attributes = True

# Keep LLMConfigOut as alias for backward compatibility
LLMConfigOut = ChatConfigOut

# Onboarding Schemas
class OnboardingBranding(BaseModel):
    org_name: str = Field(..., min_length=1, max_length=255)
    logo_data_url: Optional[str] = None
    primary_color: Optional[str] = None

class OnboardingProject(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = Field(None, max_length=5000)

class OnboardingDataSource(BaseModel):
    # Accept both camelCase (baseURL) and snake_case (base_url) from frontend
    # Use str instead of HttpUrl to handle validation manually in route for better error messages
    base_url: str = Field(..., description="Website URL to crawl")
    depth: Optional[int] = Field(2, ge=0, le=10)
    cadence: Optional[CrawlCadence] = CrawlCadence.DAILY
    headless_mode: Optional[CrawlHeadlessMode] = Field(CrawlHeadlessMode.OFF)
    
    @model_validator(mode='before')
    @classmethod
    def normalize_field_names(cls, data):
        """Normalize camelCase to snake_case and enum values for compatibility"""
        if isinstance(data, dict):
            # Handle camelCase to snake_case conversion
            normalized = {}
            for key, value in data.items():
                # Convert camelCase to snake_case
                if key == "baseURL":
                    normalized["base_url"] = value
                elif key == "headlessMode":
                    # Convert boolean to enum value
                    if isinstance(value, bool):
                        normalized["headless_mode"] = "ON" if value else "OFF"
                    elif isinstance(value, str) and value.lower() in ["true", "false"]:
                        normalized["headless_mode"] = "ON" if value.lower() == "true" else "OFF"
                    else:
                        normalized["headless_mode"] = value
                elif key == "base_url":
                    normalized["base_url"] = value
                elif key == "headless_mode":
                    # Convert boolean to enum value
                    if isinstance(value, bool):
                        normalized["headless_mode"] = "ON" if value else "OFF"
                    elif isinstance(value, str) and value.lower() in ["true", "false"]:
                        normalized["headless_mode"] = "ON" if value.lower() == "true" else "OFF"
                    else:
                        normalized["headless_mode"] = value
                elif key == "cadence" and isinstance(value, str):
                    # Normalize cadence to uppercase enum value
                    value_upper = value.upper()
                    if value_upper == "HOURLY":
                        normalized["cadence"] = "DAILY"  # Map hourly to daily
                    elif value_upper in ["ONCE", "DAILY", "WEEKLY", "MONTHLY"]:
                        normalized["cadence"] = value_upper
                    else:
                        normalized["cadence"] = value  # Keep as-is, let Pydantic validate
                else:
                    normalized[key] = value
            return normalized
        return data
    
    class Config:
        populate_by_name = True  # Allow both alias and field name (Pydantic v2)

class OnboardingTestQuery(BaseModel):
    query: str = Field(..., min_length=1)
    project_id: Optional[uuid.UUID] = None  # Optional since project doesn't exist yet during onboarding

class OnboardingStatus(BaseModel):
    completed_steps: List[str] = Field(default_factory=list)
    current_step: Optional[str] = None
    project_id: Optional[uuid.UUID] = None
    needs_onboarding: bool = False
    redirect_to: str = "/"

# Suggestions Schema
class SuggestionResponse(BaseModel):
    suggestions: List[str] = Field(..., description="Auto-generated query suggestions based on project embeddings")

# Search Configuration Schemas
class SearchConfigurationUpdate(BaseModel):
    title: Optional[str] = Field(None, max_length=255, description="Search box title")
    feedback_enabled: Optional[bool] = Field(None, description="Whether to collect user feedback in search")
    language: Optional[str] = Field(None, max_length=10, description="Language code for search responses (e.g., 'en', 'es', 'fr')")
    styleOption: Optional[str] = Field(None, description="Style option: 'default' or 'plugin'")
    boxLayout: Optional[str] = Field(None, description="Box layout: 'box' or 'fullwidth'")
    searchIcon: Optional[str] = Field(None, description="Search icon: 'search', 'scan', or 'sparkles'")
    loaderType: Optional[str] = Field(None, description="Loader type: 'skeleton' or 'typing'")
    background: Optional[str] = Field(None, description="Background color (hex)")
    textColor: Optional[str] = Field(None, description="Text color (hex)")
    borderRadius: Optional[str] = Field(None, description="Border radius: 'rounded', 'medium-rounded', 'semi-rounded', or 'square'")
    resultStyle: Optional[str] = Field(None, description="Result style: 'list' or other")

class SearchConfigurationOut(BaseModel):
    title: Optional[str] = None
    feedback_enabled: bool = True
    language: Optional[str] = None
    styleOption: Optional[str] = None
    boxLayout: Optional[str] = None
    searchIcon: Optional[str] = None
    loaderType: Optional[str] = None
    background: Optional[str] = None
    textColor: Optional[str] = None
    borderRadius: Optional[str] = None
    resultStyle: Optional[str] = None

# Search Customization Schemas
class PredefinedQuestion(BaseModel):
    question: str
    answer: Optional[str] = Field(None, description="Predefined answer (HTML supported)")

class SearchCustomizationUpdate(BaseModel):
    searchFormType: Optional[str] = Field(None, description="Form type: 'default' or 'withBtn'")
    buttonType: Optional[str] = Field(None, description="Button type: 'icon' or 'withLabel'")
    searchButtonText: Optional[str] = Field(None, max_length=100, description="Search button text")
    searchInputPlaceholder: Optional[str] = Field(None, max_length=255, description="Search input placeholder text")
    recentSearch: Optional[bool] = Field(None, description="Enable recent search history")
    recentSearchTitle: Optional[str] = Field(None, max_length=255, description="Recent search title")
    predefinedQuestions: Optional[bool] = Field(None, description="Show predefined questions")
    questionsPosition: Optional[str] = Field(None, description="Position: 'below-search' or other")
    questionsLimit: Optional[int] = Field(None, ge=1, le=50, description="Number of questions to show")
    questions: Optional[List[Union[str, PredefinedQuestion]]] = Field(None, description="List of predefined questions (strings or objects with answer)")

class SearchCustomizationOut(BaseModel):
    searchFormType: Optional[str] = None
    buttonType: Optional[str] = None
    searchButtonText: Optional[str] = None
    searchInputPlaceholder: Optional[str] = None
    recentSearch: Optional[bool] = None
    recentSearchTitle: Optional[str] = None
    predefinedQuestions: Optional[bool] = None
    questionsPosition: Optional[str] = None
    questionsLimit: Optional[int] = None
    questions: Optional[List[Union[str, PredefinedQuestion]]] = None

# Crawl Source Schemas
class CrawlSourceCreate(BaseModel):
    name: str = Field(..., min_length=3, max_length=255)
    base_url: HttpUrl = Field(..., description="The website URL to crawl - crawler will auto-detect everything")
    description: Optional[str] = Field(None, max_length=1000, description="Optional description of what to crawl")
    project_id: Optional[uuid.UUID] = Field(None, description="Project ID (required for project-scoped sources)")
    
    # Optional advanced settings (crawler is intelligent by default)
    depth: Optional[int] = Field(
        3,
        ge=0,
        le=10,
        description="Crawl depth: 0 = only base_url; 1+ = follow links up to that depth from the seed",
    )
    cadence: CrawlCadence = CrawlCadence.ONCE
    headless_mode: CrawlHeadlessMode = CrawlHeadlessMode.AUTO
    
    @field_validator('project_id', mode='before')
    @classmethod
    def parse_project_id(cls, v):
        """Parse project_id from string UUID if needed"""
        if v is None:
            return None
        if isinstance(v, str):
            try:
                return uuid.UUID(v)
            except ValueError:
                return None
        return v
    
    # Allow/Deny patterns (optional) - Accept both frontend field names (allowlist/denylist) and legacy names (allowPatterns/denyPatterns)
    allowlist: Optional[List[str]] = Field(default_factory=list, description="URL patterns to include")
    denylist: Optional[List[str]] = Field(default_factory=list, description="URL patterns to exclude")
    skip_header_footer: Optional[bool] = Field(
        True,
        description="Strip header/footer/nav/aside blocks during extraction",
    )
    rescope_root_links: Optional[bool] = Field(
        False,
        description="CMS/docs mode: keep root-relative links under the crawl base_url sub-path",
    )
    # Legacy field names for backward compatibility
    allowPatterns: Optional[List[str]] = Field(default=None, description="Legacy: URL patterns to include (use allowlist instead)")
    denyPatterns: Optional[List[str]] = Field(default=None, description="Legacy: URL patterns to exclude (use denylist instead)")
    
    @field_validator('cadence', mode='before')
    @classmethod
    def normalize_cadence(cls, v):
        if isinstance(v, str):
            # Handle case-insensitive matching
            v_upper = v.upper()
            if v_upper == 'HOURLY':
                return CrawlCadence.DAILY  # Map hourly to daily for now
            elif v_upper == 'ONCE':
                return CrawlCadence.ONCE
            elif v_upper == 'DAILY':
                return CrawlCadence.DAILY
            elif v_upper == 'WEEKLY':
                return CrawlCadence.WEEKLY
            elif v_upper == 'MONTHLY':
                return CrawlCadence.MONTHLY
        return v
    
    @model_validator(mode='before')
    @classmethod
    def merge_legacy_fields(cls, values):
        """Merge legacy allowPatterns/denyPatterns into allowlist/denylist"""
        # Handle dict input (mode='before')
        if not isinstance(values, dict):
            return values
            
        # Merge allowPatterns into allowlist if allowlist is empty
        allow_patterns = values.get('allowPatterns')
        if allow_patterns:
            allowlist = values.get('allowlist')
            if not allowlist:
                values['allowlist'] = allow_patterns
        
        # Merge denyPatterns into denylist if denylist is empty
        deny_patterns = values.get('denyPatterns')
        if deny_patterns:
            denylist = values.get('denylist')
            if not denylist:
                values['denylist'] = deny_patterns
        
        # Ensure allowlist and denylist are lists (not None) - Pydantic will validate types later
        if 'allowlist' not in values or values['allowlist'] is None:
            values['allowlist'] = []
        if 'denylist' not in values or values['denylist'] is None:
            values['denylist'] = []
        
        return values
    

class CrawlSourceUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=3, max_length=255)
    base_url: Optional[HttpUrl] = None
    depth: Optional[int] = Field(None, ge=0, le=10)
    cadence: Optional[CrawlCadence] = None
    headless_mode: Optional[CrawlHeadlessMode] = None
    allowlist: Optional[List[str]] = None
    denylist: Optional[List[str]] = None
    skip_header_footer: Optional[bool] = None
    rescope_root_links: Optional[bool] = None
    # Legacy field names for backward compatibility
    allowPatterns: Optional[List[str]] = Field(default=None, description="Legacy: URL patterns to include (use allowlist instead)")
    denyPatterns: Optional[List[str]] = Field(default=None, description="Legacy: URL patterns to exclude (use denylist instead)")
    description: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None
    status: Optional[CrawlSourceStatus] = None
    allow_empty_crawl: Optional[bool] = None

class CrawlSourceOut(BaseModel):
    id: uuid.UUID
    name: str
    base_url: HttpUrl
    depth: int
    cadence: CrawlCadence
    headless_mode: CrawlHeadlessMode
    allowlist: List[str]
    denylist: List[str]
    skip_header_footer: bool = True
    rescope_root_links: bool = False
    description: Optional[str]
    status: CrawlSourceStatus
    is_active: bool
    allow_empty_crawl: bool = False

    created_at: datetime
    updated_at: Optional[datetime] = None
    last_crawl_at: Optional[datetime] = None
    documents_count: int
    trained_at: Optional[datetime] = Field(None, description="Timestamp when crawled data was successfully trained/embedded")
    pipeline_status: Optional[str] = Field(
        None,
        description="Pipeline stage: queued|crawling|indexing|ready|failed",
    )
    is_search_ready: bool = Field(
        False,
        description="Whether source content is indexed and searchable",
    )
    status_message: str = Field(
        "",
        description="Human-readable latest-job status for the UI (empty when idle with no job)",
    )
    created_by: str  # Username of the creator
    latest_job_id: Optional[uuid.UUID] = Field(None, description="Most recent crawl job ID for this source")
    active_job_id: Optional[uuid.UUID] = Field(
        None,
        description="Crawl job id while PENDING/RUNNING/INDEXING; null when idle",
    )
    progress_percentage: Optional[float] = Field(
        None,
        description="Live crawl progress 0–100 while a job is in flight; null when idle/terminal",
    )

    class Config:
        from_attributes = True

# RAG & Chat Schemas
class RagQuery(BaseModel):
    query: str
    session_id: Optional[str] = None
    topK: int = Field(5, ge=1, le=50)
    maxTokens: Optional[int] = None
    useReranker: bool = False
    similarityThreshold: float = Field(0.2, ge=0.1, le=1.0)
    use_saved_rag_params: bool = Field(
        False,
        description="When true (or widget auth), topK/similarity/reranker/maxTokens come from SearchSettings in DB",
    )
    enableKeywordFallback: bool = Field(True, description="Enable Tier 2 keyword fallback when semantic retrieval is insufficient")
    semanticConfidenceFloor: Optional[float] = Field(None, ge=0.1, le=0.6, description="Override semantic confidence floor (default 0.22)")
    keywordScoreFloor: Optional[float] = Field(None, ge=0.1, le=0.8, description="Override keyword quality floor (default 0.35)")
    response_type: Optional[ResponseType] = Field(
        None,
        description="Override saved response type (long|short). Ignored for widget auth and when use_saved_rag_params is true.",
    )

class PromptRequest(BaseModel):
    query: str = Field("Hello", description="Search query to execute (defaults to 'Hello' if not provided)")
    system_prompt: str = Field(..., description="Custom system prompt for the LLM")
    topK: int = Field(5, ge=1, le=20, description="Number of top results to return")
    maxTokens: int = Field(500, ge=100, le=3000, description="Maximum tokens for the response")

class PromptUpdateRequest(BaseModel):
    system_prompt: str = Field(..., description="System prompt to save")

class ChatMessageRequest(BaseModel):
    session_id: Optional[str] = None
    message: str

class FeedbackRequest(BaseModel):
    session_id: str
    message_id: str
    feedback: bool  # True for positive, False for negative (kept for backward compatibility)
    rating: Optional[int] = Field(None, ge=1, le=5, description="Rating from 1-5 scale")
    feedback_text: Optional[str] = Field(None, max_length=2000, description="Text-based feedback from user")
    context_tags: Optional[List[str]] = Field(None, description="Optional context tags for feedback (e.g., ['accuracy', 'helpfulness', 'relevance'])")

class RagDefaultsResponse(BaseModel):
    topK: int
    useReranker: bool
    similarityThreshold: float
    maxTokens: Optional[int] = None

# Chat Response Schemas
class ChatMessageOut(BaseModel):
    id: uuid.UUID
    session_id: str
    message_id: uuid.UUID
    user_message: str
    assistant_response: str
    message_type: str
    sources: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[bool] = None
    feedback_rating: Optional[int] = None
    feedback_text: Optional[str] = None
    context_tags: Optional[List[str]] = None
    created_at: datetime
    execution_snapshot: Optional[Dict[str, Any]] = None
    feedback_moderation: Optional[Dict[str, Any]] = None

    class Config:
        from_attributes = True


class FeedbackModerationPatch(BaseModel):
    reviewed: Optional[bool] = None
    internal_notes: Optional[str] = Field(None, max_length=5000)
    flagged: Optional[bool] = None
    flag_reason: Optional[str] = Field(None, max_length=2000)


class FeedbackModerationRowOut(BaseModel):
    id: uuid.UUID
    message_id: uuid.UUID
    session_id: str
    user_id: Optional[int] = None
    user_message: str
    assistant_preview: str
    assistant_response_length: int
    feedback: bool
    feedback_rating: Optional[int] = None
    feedback_text: Optional[str] = None
    context_tags: Optional[List[str]] = None
    message_type: str
    created_at: datetime
    confidence_score: Optional[int] = None
    total_ms: Optional[int] = None
    llm_model: Optional[str] = None
    embedding_model: Optional[str] = None
    feedback_moderation: Optional[Dict[str, Any]] = None


class FeedbackModerationSummaryOut(BaseModel):
    total_count: int
    positive_count: int
    negative_count: int
    positive_pct: float
    negative_pct: float
    avg_total_ms: Optional[float] = None
    top_negative_reasons: List[Dict[str, Any]] = Field(default_factory=list)
    low_confidence_negative_count: int = 0
    flagged_count: int = 0
    reviewed_count: int = 0


class ChatMessageHistoryListOut(BaseModel):
    """List view: same as ChatMessageOut but omits heavy execution_snapshot by default."""

    id: uuid.UUID
    session_id: str
    message_id: uuid.UUID
    user_message: str
    assistant_response: str
    message_type: str
    sources: Optional[List[Dict[str, Any]]] = None
    feedback: Optional[bool] = None
    feedback_rating: Optional[int] = None
    feedback_text: Optional[str] = None
    context_tags: Optional[List[str]] = None
    created_at: datetime
    history_status: Optional[str] = None
    history_confidence: Optional[int] = None
    history_total_ms: Optional[int] = None

    class Config:
        from_attributes = True

# Crawl Job Schemas
class CrawlJobOut(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    status: CrawlJobStatus
    pages_fetched: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class CrawlJobEnqueueResponse(BaseModel):
    job_id: uuid.UUID
    queued_at: datetime
    message: str = "Crawl job enqueued"
    enqueue_status: Optional[str] = None

    class Config:
        from_attributes = True

# Crawl Status Schema
class CrawlStatusOut(BaseModel):
    job_id: uuid.UUID
    status: CrawlJobStatus
    pages_fetched: int
    urls_crawled: Optional[int] = 0
    failed_count: int = 0
    skipped_count: int = 0
    failed_urls: List[Dict[str, Any]] = Field(default_factory=list)
    skipped_urls: List[Dict[str, Any]] = Field(default_factory=list)
    crawled_urls: List[Dict[str, Any]] = Field(default_factory=list)
    crawled_urls_total: int = 0
    progress_percentage: float = Field(0.0, ge=0.0, le=100.0, description="Progress percentage from 0 to 100")
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None
    # Training status
    is_trained: bool = Field(False, description="Whether the crawled data has been trained/embedded")
    trained_at: Optional[datetime] = Field(None, description="Timestamp when training completed")
    pipeline_status: str = Field(
        "queued",
        description="Pipeline stage: queued|crawling|indexing|ready|failed",
    )
    is_search_ready: bool = Field(
        False,
        description="Whether this crawl's indexed content is searchable",
    )
    status_message: str = Field(
        "",
        description="Human-readable pipeline status for the UI",
    )

    class Config:
        from_attributes = True

# Preview Schemas
class PreviewRequest(BaseModel):
    url: HttpUrl
    headless: CrawlHeadlessMode = CrawlHeadlessMode.AUTO

class PreviewOut(BaseModel):
    url: HttpUrl
    html_sample: Optional[str] = None
    text_sample: Optional[str] = None
    meta: Dict[str, Any] = Field(default_factory=dict)  # title, status_code, links_found, etc.
    
    class Config:
        from_attributes = True

# Page Detection Schema
class PageDetectionOut(BaseModel):
    total_pages_detected: int = Field(..., description="Total number of pages that would be crawled")
    pages_scanned: int = Field(..., description="Number of pages actually scanned during detection")
    detection_time_seconds: float = Field(..., description="Time taken for page detection")
    estimated_crawl_time_minutes: float = Field(..., description="Estimated time for full crawl")
    estimated_content_size_mb: float = Field(..., description="Estimated content size in MB")
    sample_urls: List[str] = Field(..., description="Sample of detected URLs (first 10)")
    base_url: str = Field(..., description="The base URL that was scanned")
    max_depth: int = Field(..., description="Maximum crawl depth configured")
    detection_limits: Dict[str, Any] = Field(..., description="Detection limits and constraints")
    
    class Config:
        from_attributes = True

# Document Schema
class DocumentResponse(BaseModel):
    id: uuid.UUID
    source_id: uuid.UUID
    url: str
    title: Optional[str]
    text_content: Optional[str]
    meta_data: Dict[str, Any]
    indexed_at: datetime
    
    class Config:
        from_attributes = True

class DocumentListResponse(BaseModel):
    """Response for document list query"""
    documents: List[DocumentResponse]
    total: int
    limit: int
    offset: int
    
    class Config:
        from_attributes = True

# Analytics Schemas
class PopularTerm(BaseModel):
    """Popular search term with count"""
    term: str
    count: int

class CrawlStatusSummary(BaseModel):
    """Crawl status summary"""
    active_jobs: int
    failed_jobs: int
    completed_jobs: int
    pending_jobs: int
    total_sources: int
    total_documents: int

class SystemHealth(BaseModel):
    """System health status"""
    status: str  # "healthy" | "degraded" | "unhealthy"
    database: bool
    cache: Optional[bool] = None
    version: str
    uptime_seconds: Optional[int] = None

class AnalyticsOverviewOut(BaseModel):
    """Dashboard metrics overview"""
    total_queries: int
    avg_response_time_ms: Optional[float] = None
    popular_terms: List[PopularTerm] = Field(default_factory=list)
    system_health: SystemHealth
    crawl_status: CrawlStatusSummary
    
    class Config:
        from_attributes = True

class QueryLogEntry(BaseModel):
    """Single query log entry"""
    id: uuid.UUID
    query: str
    mode: QueryMode
    p95_latency: Optional[int] = None
    result_count: int
    timestamp: datetime
    
    class Config:
        from_attributes = True

class QueryStatisticsOut(BaseModel):
    """Query statistics with pagination"""
    queries: List[QueryLogEntry]
    total: int
    limit: int
    offset: int
    date_range: Optional[Dict[str, datetime]] = None
    
    class Config:
        from_attributes = True

class PopularTermsOut(BaseModel):
    """Popular search terms response"""
    terms: List[PopularTerm]
    total_unique_terms: int
    date_range: Optional[Dict[str, datetime]] = None
    
    class Config:
        from_attributes = True

class HealthCheckOut(BaseModel):
    """System health check response"""
    status: str  # "healthy" | "degraded" | "unhealthy"
    database: bool
    cache: Optional[bool] = None
    version: str
    uptime_seconds: Optional[int] = None
    timestamp: datetime
    
    class Config:
        from_attributes = True


class HealthReadyChecks(BaseModel):
    database: bool
    vector_db: bool
    redis: Optional[bool] = None  # None = not configured / skipped
    job_worker: Optional[bool] = None


class HealthReadyOut(BaseModel):
    """Readiness probe: dependencies required for RAG/crawl."""
    ready: bool
    status: str  # "ready" | "not_ready"
    checks: HealthReadyChecks
    version: str
    timestamp: datetime

class ServiceHealth(BaseModel):
    """Individual service health status"""
    status: str  # "healthy" | "degraded" | "at_risk" | "down"
    uptime_percent: float = Field(..., ge=0.0, le=100.0, description="Uptime percentage")
    last_heartbeat_seconds: Optional[int] = Field(None, description="Seconds since last heartbeat")
    
    # Predictive health fields
    health_score: float = Field(..., ge=0.0, le=100.0, description="Health score (0-100)")
    reason: Optional[str] = Field(None, description="Explanation for status/score")
    predicted_failure_minutes: Optional[float] = Field(None, description="Estimated minutes until failure")
    
    class Config:
        from_attributes = True

class SystemHealthDashboard(BaseModel):
    """System health dashboard with all services"""
    services: Dict[str, ServiceHealth] = Field(..., description="Health status for each service")
    timestamp: datetime = Field(..., description="Timestamp of the health check")
    
    # Aggregated metrics
    overall_health_score: float = Field(..., ge=0.0, le=100.0, description="Average weighted health score")
    overall_status: str = Field(..., description="Worst service status")
    
    class Config:
        from_attributes = True

# API Key Schemas
class APIKeyCreate(BaseModel):
    """Schema for creating a new API key"""
    name: str = Field(..., min_length=1, max_length=255, description="A descriptive name to help you identify this key")
    description: Optional[str] = Field(None, max_length=1000, description="What will this key be used for?")
    environment: APIKeyEnvironment = Field(..., description="Environment for the API key")
    rate_limit: int = Field(100, ge=1, le=100000, description="Rate limit in requests per hour")
    expiration: APIKeyExpirationOption = Field(APIKeyExpirationOption.NEVER, description="Expiration option")
    project_id: Optional[uuid.UUID] = Field(None, description="Project ID to scope this key to", alias="projectId")

    class Config:
        populate_by_name = True

class APIKeyResponse(BaseModel):
    """Schema for API key response"""
    id: uuid.UUID
    name: str
    description: Optional[str]
    project_id: Optional[uuid.UUID] = None
    key: str = Field(..., description="The API key token (only shown once on creation)")
    environment: APIKeyEnvironment
    rate_limit: int
    expires_at: Optional[datetime] = None
    is_active: bool
    request_count: int
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class APIKeyRevealResponse(BaseModel):
    """Schema for revealing the full API key token (owner only)."""
    key: str = Field(..., description="The full API key token")


class APIKeyListResponse(BaseModel):
    """Schema for API key list response (without full key)"""
    id: uuid.UUID
    name: str
    description: Optional[str]
    project_id: Optional[uuid.UUID] = None
    key_preview: str = Field(..., description="Truncated preview of the key")
    environment: APIKeyEnvironment
    rate_limit: int
    expires_at: Optional[datetime] = None
    is_active: bool
    request_count: int
    requests: int = Field(default=0, description="Alias for request_count (for frontend compatibility)")
    last_used_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


# Integrations / Embed Schemas
class IntegrationKeySchema(BaseModel):
    """Matches the frontend IntegrationKey interface for embed keys"""
    id: str
    label: str
    keyPrefix: str
    environment: str  # "staging" | "production" (frontend casing)
    rateLimit: int
    expiresAt: Optional[datetime] = None
    isActive: bool
    lastUsedAt: Optional[datetime] = None
    createdAt: datetime


class IntegrationEmbedConfigIn(BaseModel):
    """Payload from the frontend when saving embed/publicId + keys"""
    publicId: str
    keys: List[IntegrationKeySchema] = Field(default_factory=list)
    domains: List[str] = Field(default_factory=list)  # Deprecated - kept for backward compatibility
    chatbot_domains: List[Union[str, Dict[str, Any]]] = Field(default_factory=list)  # Accept both raw strings and domain objects from frontend
    search_domains: List[Union[str, Dict[str, Any]]] = Field(default_factory=list)  # Accept both raw strings and domain objects from frontend


class IntegrationEmbedConfigOut(BaseModel):
    """Response containing the saved embed config for the current user"""
    id: uuid.UUID
    userId: int = Field(..., alias="user_id")
    publicId: str = Field(..., alias="public_id")
    keys: List[IntegrationKeySchema]
    domains: List[str] = Field(default_factory=list)  # Deprecated - kept for backward compatibility
    chatbot_domains: List[str] = Field(default_factory=list)  # Separate domains for chatbot
    search_domains: List[str] = Field(default_factory=list)  # Separate domains for search
    embed_token: Optional[str] = None  # Signed embed token for active project
    createdAt: datetime = Field(..., alias="created_at")
    updatedAt: datetime = Field(..., alias="updated_at")

    class Config:
        from_attributes = True
        populate_by_name = True

# Overview & Dashboard Schemas
class ModuleName(str, Enum):
    OVERVIEW = "overview"
    CRAWL = "crawl"
    DOCUMENTS = "documents"
    RAG_TUNING = "rag_tuning"
    ANALYTICS = "analytics"
    FEEDBACK = "feedback"
    INTEGRATIONS = "integrations"

class FeedbackTag(str, Enum):
    HELPFUL = "helpful"
    OUTDATED = "outdated"
    ACCURATE = "accurate"
    COMPLETE = "complete"
    INCOMPLETE = "incomplete"
    IRRELEVANT = "irrelevant"

class QueryTimeSeriesPoint(BaseModel):
    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    count: int = Field(..., description="Number of queries on this date")
    module: Optional[str] = Field(None, description="Module name if filtering by module")

class ModuleQueryStats(BaseModel):
    module: str
    totalQueries: int = Field(..., alias="total_queries")
    queriesToday: int = Field(..., alias="queries_today")
    queriesYesterday: int = Field(..., alias="queries_yesterday")
    changePercent: float = Field(..., alias="change_percent")
    averageLatency: Optional[float] = Field(None, alias="avg_latency_ms")
    timeSeries: List[QueryTimeSeriesPoint] = Field(default_factory=list, alias="time_series")
    class Config:
        populate_by_name = True

class FeedbackEntry(BaseModel):
    id: uuid.UUID
    title: str = Field(..., alias="user_message")
    isPositive: Optional[bool] = Field(None, alias="feedback")
    tag: Optional[str] = None
    createdAt: datetime = Field(..., alias="created_at")
    timeAgo: str = Field(..., alias="time_ago")
    class Config:
        from_attributes = True
        populate_by_name = True

class FeedbackStats(BaseModel):
    thumbsUpRate: float = Field(..., ge=0.0, le=1.0, alias="thumbs_up_rate")
    thumbsUpRatePercent: float = Field(..., alias="thumbs_up_rate_percent")
    thumbsUpRateChange: Optional[float] = Field(None, alias="thumbs_up_rate_change")
    totalFeedback: int = Field(..., alias="total_feedback")
    positiveCount: int = Field(..., alias="positive_count")
    negativeCount: int = Field(..., alias="negative_count")
    class Config:
        populate_by_name = True

class OverviewMetrics(BaseModel):
    queriesToday: int = Field(..., alias="queries_today")
    queriesYesterday: int = Field(..., alias="queries_yesterday")
    queriesChangePercent: float = Field(..., alias="queries_change_percent")
    averageResponseTime: Optional[int] = Field(None, alias="p95_latency_ms")
    responseTimeChangePercent: Optional[float] = Field(None, alias="p95_latency_change_percent")
    thumbsUpRate: float = Field(..., ge=0.0, le=1.0, alias="thumbs_up_rate")
    thumbsUpRatePercent: float = Field(..., alias="thumbs_up_rate_percent")
    thumbsUpRateChange: Optional[float] = Field(None, alias="thumbs_up_rate_change")
    crawlErrors: int = Field(..., alias="crawl_errors")
    totalSources: int = Field(..., alias="total_sources")
    totalDocuments: int = Field(..., alias="total_documents")
    class Config:
        populate_by_name = True

class QueriesOverTimeResponse(BaseModel):
    timeSeries: List[QueryTimeSeriesPoint] = Field(..., alias="time_series")
    totalQueries: int = Field(..., alias="total_queries")
    dateRange: Dict[str, datetime] = Field(..., alias="date_range")
    modules: Optional[List[str]] = None
    class Config:
        populate_by_name = True

class ModuleQueriesResponse(BaseModel):
    module: str
    stats: ModuleQueryStats
    timeSeries: List[QueryTimeSeriesPoint] = Field(..., alias="time_series")
    class Config:
        populate_by_name = True

class LatestFeedbackResponse(BaseModel):
    feedback: List[FeedbackEntry]
    total: int
    limit: int

class OverviewResponse(BaseModel):
    metrics: OverviewMetrics
    queriesOverTime: List[QueryTimeSeriesPoint] = Field(..., alias="queries_over_time")
    moduleStats: List[ModuleQueryStats] = Field(default_factory=list, alias="module_stats")
    latestFeedback: List[FeedbackEntry] = Field(default_factory=list, alias="latest_feedback")
    feedbackStats: FeedbackStats = Field(..., alias="feedback_stats")
    class Config:
        populate_by_name = True

class CrawlErrorEntry(BaseModel):
    id: uuid.UUID
    sourceName: str = Field(..., alias="source_name")
    sourceUrl: str = Field(..., alias="source_url")
    errorCount: int = Field(..., alias="error_count")
    errors: List[Dict[str, Any]]
    status: str
    finishedAt: Optional[datetime] = Field(None, alias="finished_at")
    timeAgo: str = Field(..., alias="time_ago")
    class Config:
        populate_by_name = True

class CrawlErrorsResponse(BaseModel):
    errors: List[CrawlErrorEntry]
    totalErrors: int = Field(..., alias="total_errors")
    totalFailedJobs: int = Field(..., alias="total_failed_jobs")
    sourcesWithErrors: int = Field(..., alias="sources_with_errors")
    class Config:
        populate_by_name = True

# Latency response schema for overview module
class P95LatencyResponse(BaseModel):
    averageResponseTime: Optional[float] = None
    averageResponseTimeAllTime: Optional[float] = None
    responseTimeChangePercent: Optional[float] = None
    dateRange: Dict[str, datetime]
    module: Optional[str] = None
    timeSeries: Optional[List[QueryTimeSeriesPoint]] = None

# Frontend-Exact Match Schemas
class TrendData(BaseModel):
    value: float = Field(...)
    isPositive: bool = Field(...)

class KPICard(BaseModel):
    value: str | float | int = Field(...)
    trend: Optional[TrendData] = Field(None)

class QueriesOverTimeData(BaseModel):
    name: str = Field(...)
    queries: int = Field(...)

class TopSource(BaseModel):
    url: str = Field(...)
    docs: int = Field(...)
    lastCrawl: str = Field(...)
    errors: int = Field(...)

class LatestFeedbackItem(BaseModel):
    query: str = Field(...)
    vote: str = Field(...)
    reason: str = Field(...)
    time: str = Field(...)

class OverviewDashboardResponse(BaseModel):
    queriesToday: KPICard = Field(...)
    p95Latency: KPICard = Field(...)
    thumbsUpRate: KPICard = Field(...)
    crawlErrors: KPICard = Field(...)
    queriesOverTime: List[QueriesOverTimeData] = Field(...)
    topSources: List[TopSource] = Field(...)
    latestFeedback: List[LatestFeedbackItem] = Field(...)

# Webhook Schemas
class WebhookCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    url: HttpUrl = Field(...)
    description: Optional[str] = Field(None, max_length=1000)
    events: List[str] = Field(..., min_items=1)
    project_id: uuid.UUID

class WebhookUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    url: Optional[HttpUrl] = None
    description: Optional[str] = Field(None, max_length=1000)
    events: Optional[List[str]] = Field(None, min_items=1)
    is_active: Optional[bool] = None

class WebhookOut(BaseModel):
    id: uuid.UUID
    name: str
    url: HttpUrl
    description: Optional[str]
    events: List[str]
    secret: str = Field(..., description="Signing secret (only shown on creation/retrieval)")
    is_active: bool
    failure_count: int = 0
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True

class WebhookTestRequest(BaseModel):
    event: str = Field(..., description="Event type to test (e.g. integration.created)")
    payload: Optional[Dict[str, Any]] = None

class ApiResponse(BaseModel):
    success: bool
    data: Optional[Any] = None
    message: Optional[str] = None

# Analytics Dashboard Schemas
class TimeRange(str, Enum):
    """Time range options for analytics"""
    DAYS_7 = "7d"
    DAYS_30 = "30d"
    DAYS_90 = "90d"

class DailyQueryPoint(BaseModel):
    """Daily query count data point"""
    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    queries: int = Field(..., description="Number of queries on this date")

class LatencyDataPoint(BaseModel):
    """Latency data point for time series"""
    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    p95: Optional[int] = Field(None, description="95th percentile latency in milliseconds")
    p50: Optional[int] = Field(None, description="50th percentile latency in milliseconds (not available)")

class SatisfactionDataPoint(BaseModel):
    """Satisfaction rate data point"""
    date: str = Field(..., description="Date in ISO format (YYYY-MM-DD)")
    satisfaction: int = Field(..., description="Satisfaction rate as percentage (0-100)")

class SourceCoverageItem(BaseModel):
    """Source coverage item for pie chart"""
    name: str = Field(..., description="Source name/domain")
    value: int = Field(..., description="Percentage of coverage")
    color: Optional[str] = Field(None, description="Color for visualization")

class PopularQueryItem(BaseModel):
    """Popular query with satisfaction score"""
    query: str = Field(..., description="Query text")
    count: int = Field(..., description="Number of times this query was made")
    satisfaction: int = Field(..., description="Satisfaction rate as percentage (0-100)")

class HardQueryItem(BaseModel):
    """Hard query (low satisfaction)"""
    query: str = Field(..., description="Query text")
    attempts: int = Field(..., description="Number of attempts")
    satisfaction: int = Field(..., description="Satisfaction rate as percentage (0-100)")
    avgLatency: str = Field(..., description="Average latency as string (e.g., '4.2s')")
    lastAttempt: str = Field(..., description="Time since last attempt (e.g., '2 hours ago')")

class AnalyticsMetrics(BaseModel):
    """Key metrics for analytics dashboard"""
    totalQueries: int = Field(..., description="Total queries in time range")
    totalQueriesChange: Optional[float] = Field(None, description="Percentage change from previous period")
    avgLatencyP95: Optional[int] = Field(None, description="Average p95 latency in milliseconds")
    avgLatencyP95Change: Optional[float] = Field(None, description="Percentage change from previous period")
    satisfactionRate: int = Field(..., description="Satisfaction rate as percentage (0-100)")
    satisfactionRateChange: Optional[float] = Field(None, description="Percentage change from previous period")
    dailyAverage: int = Field(..., description="Average queries per day")

class AnalyticsDashboardResponse(BaseModel):
    """Complete analytics dashboard response"""
    metrics: AnalyticsMetrics
    dailyQueries: List[DailyQueryPoint] = Field(..., description="Daily queries time series")
    latencyData: List[LatencyDataPoint] = Field(..., description="Latency time series")
    satisfactionData: List[SatisfactionDataPoint] = Field(..., description="Satisfaction time series")
    sourceCoverage: List[SourceCoverageItem] = Field(..., description="Source coverage for pie chart")
    popularQueries: List[PopularQueryItem] = Field(..., description="Popular queries with satisfaction")
    hardQueries: List[HardQueryItem] = Field(..., description="Hard queries (low satisfaction)")
    timeRange: str = Field(..., description="Time range used (7d, 30d, 90d)")

class SatisfactionTimeSeriesResponse(BaseModel):
    """Satisfaction rate time series response"""
    data: List[SatisfactionDataPoint]
    timeRange: str
    averageSatisfaction: float = Field(..., description="Average satisfaction rate")

class SourceCoverageResponse(BaseModel):
    """Source coverage response"""
    sources: List[SourceCoverageItem]
    totalSources: int = Field(..., description="Total number of sources")

class PopularQueriesResponse(BaseModel):
    """Popular queries response"""
    queries: List[PopularQueryItem]
    timeRange: str

class HardQueriesResponse(BaseModel):
    """Hard queries response"""
    queries: List[HardQueryItem]
    timeRange: str

# Response Configuration Schemas (for search)
# Note: ResponseType enum is defined earlier in the file (after APIKeyExpirationOption)

class ResponseConfigOut(BaseModel):
    """Response configuration output schema"""
    response_type: ResponseType = Field(..., description="Response type: 'long' or 'short'")
    
    class Config:
        from_attributes = True

class ResponseConfigUpdate(BaseModel):
    """Response configuration update schema"""
    response_type: ResponseType = Field(..., description="Response type: 'long' or 'short'")


# Gmail Integration Schemas
class GmailIntegrationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"

class GmailSyncJobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class GmailAuthUrlOut(BaseModel):
    auth_url: str

class GmailCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=10, max_length=255)
    client_secret: str = Field(..., min_length=10, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)

class GmailCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None

class GmailConnectRequest(BaseModel):
    project_id: uuid.UUID
    cadence_minutes: int = Field(30, ge=5, le=1440)
    max_emails_per_sync: int = Field(100, ge=1, le=500)

class GmailIntegrationOut(BaseModel):
    id: uuid.UUID
    email_address: str
    status: GmailIntegrationStatus
    is_active: bool
    cadence_minutes: int
    max_emails_per_sync: int
    last_sync_at: Optional[datetime] = None
    emails_indexed: int
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class GmailSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: GmailSyncJobStatus
    emails_fetched: int
    emails_indexed: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class GmailStagedMessageOut(BaseModel):
    id: uuid.UUID
    gmail_message_id: str
    thread_id: str
    subject: str
    sender: str
    date_raw: str
    preview: str
    staged_at: datetime

    class Config:
        from_attributes = True


class GmailInboxPageOut(BaseModel):
    total: int
    items: List[GmailStagedMessageOut]


class GmailInboxIndexRequest(BaseModel):
    project_id: uuid.UUID
    staged_ids: List[uuid.UUID]
    all_inbox: bool = False


class GmailInboxDismissRequest(BaseModel):
    project_id: uuid.UUID
    staged_ids: List[uuid.UUID]
    all_inbox: bool = False


class GmailInboxIndexResultOut(BaseModel):
    indexed: int
    errors: List[Dict[str, Any]]


# ClickUp Integration Schemas
class ClickUpIntegrationStatus(str, Enum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"

class ClickUpSyncJobStatus(str, Enum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class ClickUpAuthUrlOut(BaseModel):
    auth_url: str

class ClickUpIntegrationOut(BaseModel):
    id: uuid.UUID
    workspace_id: str
    workspace_name: str
    status: ClickUpIntegrationStatus
    is_active: bool
    cadence_minutes: int
    last_sync_at: Optional[datetime] = None
    items_indexed: int
    sync_tasks: bool
    sync_docs: bool
    sync_chats: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True

class ClickUpSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: ClickUpSyncJobStatus
    tasks_fetched: int
    tasks_indexed: int
    docs_fetched: int
    docs_indexed: int
    chats_fetched: int
    chats_indexed: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class AuditEventActorOut(BaseModel):
    id: Optional[int] = None
    username: Optional[str] = None
    email: Optional[str] = None

    class Config:
        from_attributes = True


class AuditEventOut(BaseModel):
    id: uuid.UUID
    timestamp: datetime
    project_id: Optional[uuid.UUID] = None
    project_name: Optional[str] = None
    user_id: Optional[int] = None
    api_key_id: Optional[uuid.UUID] = None
    actor_type: str
    actor: Optional[AuditEventActorOut] = None
    event_type: str
    category: str
    severity: str
    status: str
    action: str
    resource_type: Optional[str] = None
    resource_id: Optional[str] = None
    summary: str
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None

    class Config:
        from_attributes = True


class AuditEventListOut(BaseModel):
    events: List[AuditEventOut]
    total: int
    limit: int
    offset: int

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# n8n integration schemas
# ---------------------------------------------------------------------------

class N8nIntegrationStatus(str, Enum):
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"


class N8nConfigUpsertRequest(BaseModel):
    project_id: uuid.UUID
    environment: APIKeyEnvironment
    base_url: str = Field(..., min_length=8, max_length=2048)
    api_key: Optional[str] = Field(None, max_length=4096)
    is_enabled: Optional[bool] = None
    linked_ragsuite_api_key_id: Optional[uuid.UUID] = None


class N8nEnableRequest(BaseModel):
    is_enabled: bool


class N8nIntegrationOut(BaseModel):
    id: uuid.UUID
    project_id: uuid.UUID
    environment: APIKeyEnvironment
    base_url: str
    has_api_key: bool
    is_enabled: bool
    status: N8nIntegrationStatus
    last_test_at: Optional[datetime] = None
    last_error: Optional[str] = None
    linked_ragsuite_api_key_id: Optional[uuid.UUID] = None
    linked_api_key_preview: Optional[str] = None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class N8nTestConnectionOut(BaseModel):
    success: bool
    message: str
    status: N8nIntegrationStatus


class N8nInboundTemplateOut(BaseModel):
    method: str = "POST"
    retrieve_url: str
    search_url: str
    authorization_header: str = "Authorization"
    authorization_value_placeholder: str = "Bearer <YOUR_RAGSUITE_API_KEY>"
    content_type: str = "application/json"
    body_example: Dict[str, Any]
    curl_retrieve: str
    curl_search: str


class N8nRetrieveTestRequest(BaseModel):
    project_id: uuid.UUID
    query: str = Field("test connection", min_length=1, max_length=500)
    top_k: int = Field(3, ge=1, le=10)


class N8nRetrieveTestOut(BaseModel):
    success: bool
    message: str
    result_count: int = 0


# --- Google Drive connector ---


class GoogleDriveAuthUrlOut(BaseModel):
    auth_url: str


class GoogleDriveCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=10, max_length=255)
    client_secret: str = Field(..., min_length=10, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)


class GoogleDriveCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None


class GoogleDriveFolderRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class GoogleDriveFileRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)
    mime_type: Optional[str] = Field(None, max_length=255)


class GoogleDriveFolderOut(BaseModel):
    id: str
    name: str


class GoogleDriveBrowseItemOut(BaseModel):
    id: str
    name: str
    kind: str  # "folder" | "file"
    mime_type: Optional[str] = None


class GoogleDriveSourcesUpdateRequest(BaseModel):
    project_id: uuid.UUID
    folders: List[GoogleDriveFolderRef] = Field(default_factory=list)
    files: List[GoogleDriveFileRef] = Field(default_factory=list)


class GoogleDriveSettingsUpdateRequest(BaseModel):
    project_id: uuid.UUID
    settings: Dict[str, Any] = Field(default_factory=dict)


class GoogleDriveIntegrationOut(BaseModel):
    id: uuid.UUID
    account_label: str
    status: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    documents_indexed: int
    settings: Dict[str, Any]
    sources: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class GoogleDriveSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: str
    files_fetched: int
    files_indexed: int
    files_skipped: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


# --- Notion connector ---


class NotionAuthUrlOut(BaseModel):
    auth_url: str


class NotionCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=8, max_length=255)
    client_secret: str = Field(..., min_length=8, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)


class NotionCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None


class NotionSourceRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class NotionSearchItemOut(BaseModel):
    id: str
    name: str
    kind: str  # page | database
    parent_kind: Optional[str] = None  # database | page | workspace
    parent_name: Optional[str] = None
    last_edited_time: Optional[datetime] = None


class NotionSourcesUpdateRequest(BaseModel):
    project_id: uuid.UUID
    pages: List[NotionSourceRef] = Field(default_factory=list)
    databases: List[NotionSourceRef] = Field(default_factory=list)


class NotionSettingsUpdateRequest(BaseModel):
    project_id: uuid.UUID
    settings: Dict[str, Any] = Field(default_factory=dict)


class NotionIntegrationOut(BaseModel):
    id: uuid.UUID
    account_label: str
    status: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    documents_indexed: int
    settings: Dict[str, Any]
    sources: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class NotionSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: str
    files_fetched: int
    files_indexed: int
    files_skipped: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


# --- Confluence connector ---


class ConfluenceAuthUrlOut(BaseModel):
    auth_url: str


class ConfluenceCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=8, max_length=255)
    client_secret: str = Field(..., min_length=8, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)


class ConfluenceCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None


class ConfluenceSpaceRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    key: Optional[str] = Field(None, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class ConfluencePageRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class ConfluenceSpaceOut(BaseModel):
    id: str
    key: Optional[str] = None
    name: str


class ConfluenceSourcesUpdateRequest(BaseModel):
    project_id: uuid.UUID
    spaces: List[ConfluenceSpaceRef] = Field(default_factory=list)
    pages: List[ConfluencePageRef] = Field(default_factory=list)


class ConfluenceSettingsUpdateRequest(BaseModel):
    project_id: uuid.UUID
    settings: Dict[str, Any] = Field(default_factory=dict)


class ConfluenceIntegrationOut(BaseModel):
    id: uuid.UUID
    account_label: str
    status: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    documents_indexed: int
    settings: Dict[str, Any]
    sources: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class ConfluenceSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: str
    files_fetched: int
    files_indexed: int
    files_skipped: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


# --- SharePoint connector ---


class SharePointAuthUrlOut(BaseModel):
    auth_url: str


class SharePointCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=8, max_length=255)
    client_secret: str = Field(..., min_length=8, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)


class SharePointCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None


class SharePointSiteRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class SharePointDriveRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    site_id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=1024)


class SharePointSiteOut(BaseModel):
    id: str
    name: str


class SharePointDriveOut(BaseModel):
    id: str
    name: str


class SharePointSourcesUpdateRequest(BaseModel):
    project_id: uuid.UUID
    sites: List[SharePointSiteRef] = Field(default_factory=list)
    drives: List[SharePointDriveRef] = Field(default_factory=list)


class SharePointSettingsUpdateRequest(BaseModel):
    project_id: uuid.UUID
    settings: Dict[str, Any] = Field(default_factory=dict)


class SharePointIntegrationOut(BaseModel):
    id: uuid.UUID
    account_label: str
    status: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    documents_indexed: int
    settings: Dict[str, Any]
    sources: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SharePointSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: str
    files_fetched: int
    files_indexed: int
    files_skipped: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None


# --- Slack connector ---


class SlackAuthUrlOut(BaseModel):
    auth_url: str


class SlackCredentialUpsertRequest(BaseModel):
    project_id: uuid.UUID
    client_id: str = Field(..., min_length=8, max_length=255)
    client_secret: str = Field(..., min_length=8, max_length=4096)
    redirect_uri: str = Field(..., min_length=10, max_length=1024)


class SlackCredentialStatusOut(BaseModel):
    configured: bool
    client_id: Optional[str] = None
    redirect_uri: Optional[str] = None
    updated_at: Optional[datetime] = None


class SlackChannelRef(BaseModel):
    id: str = Field(..., min_length=1, max_length=255)
    name: str = Field(..., min_length=1, max_length=255)


class SlackChannelOut(BaseModel):
    id: str
    name: str


class SlackSourcesUpdateRequest(BaseModel):
    project_id: uuid.UUID
    channels: List[SlackChannelRef] = Field(default_factory=list)


class SlackSettingsUpdateRequest(BaseModel):
    project_id: uuid.UUID
    settings: Dict[str, Any] = Field(default_factory=dict)


class SlackIntegrationOut(BaseModel):
    id: uuid.UUID
    account_label: str
    status: str
    is_active: bool
    last_sync_at: Optional[datetime] = None
    documents_indexed: int
    settings: Dict[str, Any]
    sources: Dict[str, Any]
    created_at: datetime
    updated_at: datetime


class SlackSyncJobOut(BaseModel):
    id: uuid.UUID
    integration_id: uuid.UUID
    status: str
    files_fetched: int
    files_indexed: int
    files_skipped: int
    errors: List[Dict[str, Any]]
    queued_at: datetime
    started_at: Optional[datetime] = None
    finished_at: Optional[datetime] = None

