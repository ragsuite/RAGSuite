"""
Database models for PostgreSQL - Simple and clean with UUID primary keys
"""
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, JSON, Enum, ForeignKey, Float, LargeBinary, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
from datetime import datetime, timezone
from enum import Enum as PyEnum
from typing import Optional
import uuid

from .db import Base
from .defaults import DEFAULT_EMBEDDING_MODEL
from .security_utils import EncryptedString

class CrawlCadence(PyEnum):
    ONCE = "ONCE"
    DAILY = "DAILY"
    WEEKLY = "WEEKLY"
    MONTHLY = "MONTHLY"

class GmailIntegrationStatus(PyEnum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"

class GmailSyncJobStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ConnectorIntegrationStatus(PyEnum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"


class ConnectorSyncJobStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class N8nIntegrationStatus(PyEnum):
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"

class ClickUpIntegrationStatus(PyEnum):
    ACTIVE = "ACTIVE"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    DISCONNECTED = "DISCONNECTED"

class ClickUpSyncJobStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"

class CrawlHeadlessMode(PyEnum):
    AUTO = "AUTO"
    ON = "ON"
    OFF = "OFF"

class CrawlJobStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    INDEXING = "INDEXING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"
    WAITING = "WAITING"

class CrawlSourceStatus(PyEnum):
    READY = "READY"
    PENDING = "PENDING"
    DISABLED = "DISABLED"

class QueryMode(PyEnum):
    SEARCH = "SEARCH"
    CHAT = "CHAT"
    AUTO = "AUTO"

class InviteStatus(PyEnum):
    PENDING = "pending"
    ACCEPTED = "accepted"
    REVOKED = "revoked"

class APIKeyEnvironment(PyEnum):
    PRODUCTION = "Production"
    STAGING = "Staging"
    DEVELOPMENT = "Development"

class IntegrationEmbed(Base):
    """Per-user widget/embed configuration (publicId + keys JSON)"""
    __tablename__ = "integration_embeds"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id"), nullable=False, index=True
    )
    public_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    embed_secret: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, comment="HMAC secret for signed embed tokens")
    # Store the array of integration keys as JSON (frontend shape)
    keys: Mapped[dict] = mapped_column(
        JSON,
        default=dict,
        comment="Embed/Integration keys configuration as JSON (matches frontend IntegrationKey shape)",
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

class User(Base):
    """User authentication model"""
    __tablename__ = "users"
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    email: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))
    last_login: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    last_activity: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True, comment="Last activity timestamp for inactivity-based logout")
    email_verified_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True, comment="When the user verified their email address"
    )
    onboarding_completed_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, index=True, comment="When the user completed the onboarding wizard"
    )
    
    # Profile fields
    job_title: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    department: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    phone_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    timezone: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Avatar URL or base64 data URL")
    login_notifications: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Whether to receive login notifications")
    
    # Two-Factor Authentication fields
    totp_secret: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="TOTP secret key for 2FA")
    is_2fa_enabled: Mapped[bool] = mapped_column(Boolean, default=False, comment="Whether TOTP 2FA is enabled")
    email_2fa_enabled: Mapped[bool] = mapped_column(
        Boolean, default=False, comment="Whether email-based 2FA is enabled at login"
    )
    backup_codes: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="JSON array of hashed backup codes")
    org_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Organization ID for multi-tenant quota overrides",
    )
    provisioned_by: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Admin user id that provisioned this account",
    )
    must_change_password: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="User must change password on next login",
    )
    active_project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Per-user active project selection (workspace context)",
    )
    auth_provider: Mapped[str] = mapped_column(
        String(20),
        default="local",
        nullable=False,
        comment="Authentication provider: local or sso",
    )
    password_reset_token_hash: Mapped[Optional[str]] = mapped_column(
        String(64), nullable=True, index=True, comment="SHA-256 hash of single-use password reset token"
    )
    password_reset_expires_at: Mapped[Optional[datetime]] = mapped_column(
        DateTime(timezone=True), nullable=True, comment="Expiry for password_reset_token_hash"
    )

    crawl_sources: Mapped[list["CrawlSource"]] = relationship("CrawlSource", back_populates="creator")
    api_keys: Mapped[list["APIKey"]] = relationship("APIKey", back_populates="creator")
    projects: Mapped[list["Project"]] = relationship(
        "Project",
        back_populates="owner",
        foreign_keys="Project.owner_id",
    )
    active_project: Mapped[Optional["Project"]] = relationship(
        "Project",
        foreign_keys=[active_project_id],
    )
    settings: Mapped[Optional["Settings"]] = relationship("Settings", back_populates="user", uselist=False)
    chatbot_settings: Mapped[list["ChatbotSettings"]] = relationship("ChatbotSettings", back_populates="user")
    search_settings: Mapped[list["SearchSettings"]] = relationship("SearchSettings", back_populates="user")
    llm_config: Mapped[Optional["LLMConfig"]] = relationship("LLMConfig", back_populates="user", uselist=False)
    webhooks: Mapped[list["Webhook"]] = relationship("Webhook", back_populates="user")
    sessions: Mapped[list["UserSession"]] = relationship("UserSession", back_populates="user", cascade="all, delete-orphan")
    email_verification_tokens: Mapped[list["EmailVerificationToken"]] = relationship(
        "EmailVerificationToken", back_populates="user", cascade="all, delete-orphan"
    )
    notifications: Mapped[list["Notification"]] = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    model_config_profiles: Mapped[list["ModelConfigProfile"]] = relationship("ModelConfigProfile", back_populates="user", cascade="all, delete-orphan")
    organization_memberships: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="OrganizationMember.user_id",
    )
    idp_identities: Mapped[list["UserIdpIdentity"]] = relationship(
        "UserIdpIdentity",
        back_populates="user",
        cascade="all, delete-orphan",
    )
    project_memberships: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember",
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="ProjectMember.user_id",
    )

class EmailVerificationToken(Base):
    """One-time email verification tokens (store hash only)."""
    __tablename__ = "email_verification_tokens"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    last_sent_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    resend_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    request_ip: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    request_user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    purpose: Mapped[str] = mapped_column(
        String(32),
        default="signup",
        nullable=False,
        comment="Token purpose: signup or login_2fa",
    )

    user: Mapped["User"] = relationship("User", back_populates="email_verification_tokens")


class UserSession(Base):
    """User active sessions"""
    __tablename__ = "user_sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_jti: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True)
    device_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    last_activity: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    user: Mapped["User"] = relationship("User", back_populates="sessions")

class Project(Base):
    """Project model for multi-project support"""
    __tablename__ = "projects"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    owner_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    org_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("organizations.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=False, index=True, comment="Active project for the user")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    owner: Mapped["User"] = relationship(
        "User",
        back_populates="projects",
        foreign_keys=[owner_id],
    )
    organization: Mapped[Optional["Organization"]] = relationship("Organization", back_populates="projects")
    crawl_sources: Mapped[list["CrawlSource"]] = relationship("CrawlSource", back_populates="project")
    uploaded_documents: Mapped[list["UploadedDocument"]] = relationship("UploadedDocument", back_populates="project")
    chat_messages: Mapped[list["ChatMessage"]] = relationship("ChatMessage", back_populates="project")
    webhooks: Mapped[list["Webhook"]] = relationship("Webhook", back_populates="project")
    chatbot_settings: Mapped[list["ChatbotSettings"]] = relationship("ChatbotSettings", back_populates="project")
    search_settings: Mapped[list["SearchSettings"]] = relationship("SearchSettings", back_populates="project")
    members: Mapped[list["ProjectMember"]] = relationship(
        "ProjectMember",
        back_populates="project",
        cascade="all, delete-orphan",
    )

class CrawlSource(Base):
    """Crawl source configuration"""
    __tablename__ = "crawl_sources"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    depth: Mapped[int] = mapped_column(Integer)
    cadence: Mapped[CrawlCadence] = mapped_column(Enum(CrawlCadence), default=CrawlCadence.ONCE)
    headless: Mapped[CrawlHeadlessMode] = mapped_column(Enum(CrawlHeadlessMode), default=CrawlHeadlessMode.AUTO)
    allowlist: Mapped[list] = mapped_column(JSON, default=list)
    denylist: Mapped[list] = mapped_column(JSON, default=list)
    description: Mapped[str] = mapped_column(Text, nullable=True)
    status: Mapped[CrawlSourceStatus] = mapped_column(Enum(CrawlSourceStatus), default=CrawlSourceStatus.READY)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    
    # Dynamic crawling configuration
    max_pages: Mapped[int] = mapped_column(Integer, default=2000, comment="Maximum pages to crawl")
    max_runtime_minutes: Mapped[int] = mapped_column(Integer, default=120, comment="Maximum runtime in minutes")
    max_links_per_page: Mapped[int] = mapped_column(Integer, default=80, comment="Maximum links to follow per page")
    content_length_limit: Mapped[int] = mapped_column(Integer, default=10_000_000, comment="Maximum content length per page")
    delay_seconds: Mapped[float] = mapped_column(Float, default=0.5, comment="Delay between requests in seconds")
    skip_header_footer: Mapped[bool] = mapped_column(
        Boolean,
        default=True,
        comment="Strip header/footer/nav/aside blocks during extraction",
    )
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))
    last_crawl_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    documents_count: Mapped[int] = mapped_column(Integer, default=0)
    trained_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True, comment="Timestamp when crawled data was successfully trained/embedded")
    allow_empty_crawl: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        comment="When true, a crawl with zero indexed pages may complete successfully",
    )
    rescope_root_links: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        server_default="false",
        comment="When true, keep root-relative links under the crawl base_url sub-path",
    )
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"))
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)

    creator: Mapped["User"] = relationship("User", back_populates="crawl_sources")
    project: Mapped["Project"] = relationship("Project", back_populates="crawl_sources")
    crawl_jobs: Mapped[list["CrawlJob"]] = relationship("CrawlJob", back_populates="source")
    documents: Mapped[list["Document"]] = relationship("Document", back_populates="source")

class CrawlJob(Base):
    """Crawl job execution tracking"""
    __tablename__ = "crawl_jobs"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crawl_sources.id"), index=True)
    status: Mapped[CrawlJobStatus] = mapped_column(Enum(CrawlJobStatus), default=CrawlJobStatus.PENDING)
    pages_fetched: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    
    source: Mapped["CrawlSource"] = relationship("CrawlSource", back_populates="crawl_jobs")

class Document(Base):
    """Individual crawled document storage"""
    __tablename__ = "documents"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    source_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("crawl_sources.id"), index=True)
    url: Mapped[str] = mapped_column(String(2048), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(1024), nullable=True)
    text_content: Mapped[str] = mapped_column(Text, nullable=True)
    meta_data: Mapped[dict] = mapped_column(JSON, default=dict)
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    source: Mapped["CrawlSource"] = relationship("CrawlSource", back_populates="documents")

class QueryLog(Base):
    """Query log for analytics tracking"""
    __tablename__ = "query_logs"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    # Optional: user who performed this query (for per-user analytics)
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
        index=True,
        comment="User ID (nullable for API-key or anonymous queries)",
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="Project ID for project-scoped queries")
    org_id: Mapped[int] = mapped_column(Integer, nullable=True, default=1, index=True, comment="Organization ID (nullable for v1 single-org)")
    apikey_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("api_keys.id"), nullable=True, index=True, comment="API key ID if used")
    llm_provider: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True, comment="LLM provider used for this query")
    llm_model: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True, comment="LLM model used for this query")
    query: Mapped[str] = mapped_column(Text, nullable=False, index=True)
    mode: Mapped[QueryMode] = mapped_column(Enum(QueryMode), default=QueryMode.SEARCH, index=True)
    p95_latency: Mapped[int] = mapped_column(Integer, nullable=True, comment="95th percentile latency in milliseconds")
    result_count: Mapped[int] = mapped_column(Integer, default=0, comment="Number of results returned")
    prompt_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Prompt token count for this query")
    completion_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Completion token count for this query")
    total_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Total token count for this query")
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    chat_message_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("chat_messages.message_id", ondelete="SET NULL"),
        nullable=True,
        index=True,
        comment="Assistant message_id linking this log to chat_messages for History",
    )

class AnalyticsDay(Base):
    """Daily aggregated analytics"""
    __tablename__ = "analytics_days"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    date: Mapped[datetime] = mapped_column(DateTime(timezone=False), nullable=False, index=True, comment="Date (without time)")
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="Project ID for project-scoped analytics")
    org_id: Mapped[int] = mapped_column(Integer, nullable=True, default=1, index=True, comment="Organization ID (nullable for v1 single-org)")
    queries: Mapped[int] = mapped_column(Integer, default=0, comment="Total queries for the day")
    avg_latency_ms: Mapped[float] = mapped_column(Float, nullable=True, comment="Average latency in milliseconds")
    thumbs_up_rate: Mapped[float] = mapped_column(Float, nullable=True, comment="Thumbs up rate (0.0 to 1.0)")
    errors: Mapped[int] = mapped_column(Integer, default=0, comment="Number of errors for the day")
    top_sources: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="Top crawl sources snapshot for the day")
    
    __table_args__ = (
        {"comment": "Daily aggregated analytics metrics"}
    )

class UploadedDocument(Base):
    """Uploaded documents (manual uploads)"""
    __tablename__ = "uploaded_documents"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    # Owner of this uploaded document
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(1024), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    text_content: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    source: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    language: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="Indexed")
    chunks: Mapped[int] = mapped_column(Integer, default=0)
    checksum: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    size_kb: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    indexed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    meta_data: Mapped[dict] = mapped_column(JSON, default=dict)
    
    project: Mapped["Project"] = relationship("Project", back_populates="uploaded_documents")

class ChatMessage(Base):
    """Chat messages and feedback model"""
    __tablename__ = "chat_messages"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    # Owner of this chat message/session
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), index=True, nullable=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    message_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), unique=True, nullable=False, index=True)
    user_message: Mapped[str] = mapped_column(Text, nullable=False)
    assistant_response: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[str] = mapped_column(String(50), default="chat")  # "chat" or "search"
    sources: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=None, comment="TopK sources/results for search queries")
    feedback: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)  # True for positive, False for negative
    feedback_rating: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Rating from 1-5 scale")
    feedback_text: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Text-based feedback from user")
    context_tags: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, default=None, comment="Optional context tags for feedback (e.g., ['accuracy', 'helpfulness', 'relevance'])")
    hidden_from_widget: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, comment="If True, message is hidden from chatbot widget but still visible in history page")
    execution_snapshot: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Versioned JSON: runtime params, retrieval_meta, token_usage, sources_trace, timings",
    )
    feedback_moderation: Mapped[Optional[dict]] = mapped_column(
        JSON,
        nullable=True,
        comment="Admin moderation state: reviewed, internal_notes, flagged, etc.",
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), onupdate=func.now())

    project: Mapped["Project"] = relationship("Project", back_populates="chat_messages")

class APIKey(Base):
    """API Key model for programmatic access"""
    __tablename__ = "api_keys"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    key: Mapped[str] = mapped_column(String(255), unique=True, nullable=False, index=True, comment="The actual API key token")
    key_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True, comment="SHA-256 hash of the API key for secure lookup")
    environment: Mapped[APIKeyEnvironment] = mapped_column(Enum(APIKeyEnvironment), nullable=False, index=True)
    rate_limit: Mapped[int] = mapped_column(Integer, default=100, comment="Rate limit in requests per hour")
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True, comment="Expiration date (null = never expires)")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, index=True)
    request_count: Mapped[int] = mapped_column(Integer, default=0, comment="Total number of requests made with this key")
    last_used_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, comment="Last time this key was used")
    created_by_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, comment="User who created this API key")
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True, comment="Project ID for project-scoped API keys")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), server_default=func.now(), onupdate=lambda: datetime.now(timezone.utc))
    
    creator: Mapped[Optional["User"]] = relationship("User", back_populates="api_keys")


class Settings(Base):
    """User settings for theme and branding"""
    __tablename__ = "settings"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    org_name: Mapped[str] = mapped_column(String(255), nullable=False)
    logo_data_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    primary_color: Mapped[Optional[str]] = mapped_column(String(7), nullable=True, comment="Hex color code (e.g., #1a40eb)")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    user: Mapped["User"] = relationship("User", back_populates="settings")


class ChatbotSettings(Base):
    """Chatbot configuration and widget customization settings"""
    __tablename__ = "chatbot_settings"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True, comment="Project ID for project-scoped chatbot settings")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', name='uq_chatbot_settings_user_project'),
    )
    
    # Chatbot Configuration Fields
    chatbot_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Chatbot title")
    short_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Short description")
    bubble_message: Mapped[Optional[str]] = mapped_column(String(200), nullable=True, comment="Bubble message")
    welcome_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Welcome message")
    chatbot_language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, default="en", comment="Language code")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="Whether chatbot/chat is enabled")
    is_search_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="Whether search is enabled")
    feedback_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="Whether to collect user feedback in the chatbot widget"
    )
    
    # Widget Customization Fields
    widget_logo_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Widget logo URL or data URL")
    widget_avatar: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Widget avatar identifier or URL (can be base64 data URL)")
    widget_avatar_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=38, comment="Avatar size in pixels")
    widget_chatbot_color: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Chatbot color (hex or gradient)")
    widget_background_color: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Widget chat area background color (hex)")
    widget_text_color: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="Widget chat area text color (hex)")
    widget_width: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Custom chat window width in pixels (null = default 400)")
    widget_height: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Custom chat window height in pixels (null = auto)")
    widget_show_logo: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Show logo in widget")
    widget_show_date_time: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Show date and time")
    widget_show_backdrop: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=False, comment="Show dimmed backdrop when chatbot panel is open"
    )
    widget_show_speech_input: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=True, comment="Show microphone (speech-to-text) control in chatbot"
    )
    widget_show_speech_output: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=True, comment="Show speaker (text-to-speech) control in chatbot"
    )
    widget_bottom_space: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=15, comment="Bottom space in pixels")
    widget_font_size: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=14, comment="Font size in pixels")
    widget_trigger_border_radius: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=50, comment="Border radius for trigger button")
    widget_panel_border_radius: Mapped[Optional[int]] = mapped_column(
        Integer, nullable=True, default=20, comment="Border radius for chatbot panel chrome in pixels"
    )
    widget_position: Mapped[Optional[str]] = mapped_column(String(20), nullable=True, default="bottom-right", comment="Widget position")
    widget_z_index: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=50, comment="Widget z-index")
    widget_offset_x: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0, comment="Widget X offset")
    widget_offset_y: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=0, comment="Widget Y offset")
    
    # Citation Formatting Settings (for search) - stored as JSON
    # IMPORTANT: Run migration before using: alembic upgrade head
    # Migration file: add_citation_formatting_to_chatbot_settings.py
    citation_formatting: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None, comment="Citation formatting settings for search (JSON)")
    
    # Response Configuration (for search) - stored as JSON
    search_response_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None, comment="Response configuration for search (JSON: {response_type: 'long'|'short'})")
    
    # LLM Configuration Fields (moved from LLMConfig)
    model_provider: Mapped[str] = mapped_column(String(50), default="ollama", nullable=False, comment="LLM provider (openai, mistral, gemini, ollama)")
    chat_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Chat model name")
    api_key: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True, comment="API key for the LLM provider (encrypted)")
    embedding_model: Mapped[str] = mapped_column(String(100), default=DEFAULT_EMBEDDING_MODEL, nullable=False, comment="Embedding model name")

    # Chat-specific generation parameters
    chat_temperature: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Temperature for chat (0.0-2.0)")
    chat_top_p: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Top P for chat (0.0-1.0)")
    chat_best_of: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Best Of for chat (positive integer)")
    chat_frequency_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Frequency penalty for chat (-2.0 to 2.0)")
    chat_presence_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Presence penalty for chat (-2.0 to 2.0)")
    
    # Chat-specific RAG parameters
    chat_top_k: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=8, comment="Number of documents to retrieve for chat")
    chat_similarity_threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.5, comment="Minimum similarity score for document inclusion in chat (0.0-1.0)")
    chat_max_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1000, comment="Maximum tokens for chat responses (0-3000, 0=unlimited)")
    chat_use_reranker: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Use reranker to improve result relevance in chat")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    user: Mapped["User"] = relationship("User", back_populates="chatbot_settings")
    project: Mapped["Project"] = relationship("Project", back_populates="chatbot_settings")

class SearchSettings(Base):
    """Search-specific configuration settings - separate from chat settings"""
    __tablename__ = "search_settings"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True, comment="Project ID for project-scoped search settings")
    
    __table_args__ = (
        UniqueConstraint('user_id', 'project_id', name='uq_search_settings_user_project'),
    )
    
    # Search-specific fields
    search_prompt: Mapped[Optional[str]] = mapped_column(Text, nullable=True, comment="System prompt for search functionality")
    is_search_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="Whether search is enabled")
    feedback_enabled: Mapped[bool] = mapped_column(
        Boolean, default=True, nullable=False, comment="Whether to collect user feedback in the search widget"
    )
    search_response_config: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None, comment="Response configuration for search (JSON: {response_type: 'long'|'short'})")
    citation_formatting: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, default=None, comment="Citation formatting settings for search (JSON)")
    
    # LLM Configuration Fields (moved from LLMConfig)
    model_provider: Mapped[str] = mapped_column(String(50), default="ollama", nullable=False, comment="LLM provider (openai, mistral, gemini, ollama)")
    search_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Search model name")
    api_key: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True, comment="API key for the LLM provider (encrypted)")
    embedding_model: Mapped[str] = mapped_column(String(100), default=DEFAULT_EMBEDDING_MODEL, nullable=False, comment="Embedding model name")

    # Search-specific generation parameters
    search_temperature: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Temperature for search (0.0-2.0)")
    search_top_p: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Top P for search (0.0-1.0)")
    search_best_of: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Best Of for search (positive integer)")
    search_frequency_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Frequency penalty for search (-2.0 to 2.0)")
    search_presence_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Presence penalty for search (-2.0 to 2.0)")
    
    # Search-specific RAG parameters
    search_top_k: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=5, comment="Number of documents to retrieve for search")
    search_similarity_threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.45, comment="Minimum similarity score for document inclusion in search (0.0-1.0)")
    search_max_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1000, comment="Maximum tokens for search responses (0-3000, 0=unlimited)")
    search_use_reranker: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Use reranker to improve result relevance in search")
    
    # Search Configuration fields
    search_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Search box title")
    search_language: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, default="en", comment="Language code for search responses (e.g., en, es, fr)")
    search_style_option: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="plugin", comment="Style option: default or plugin")
    search_box_layout: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="box", comment="Box layout: box or fullwidth")
    search_icon: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="search", comment="Search icon: search, scan, or sparkles")
    search_loader_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="skeleton", comment="Loader type: skeleton or typing")
    search_background_color: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="#d5d4d4", comment="Background color (hex)")
    search_text_color: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="#000000", comment="Text color (hex)")
    search_border_radius: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="semi-rounded", comment="Border radius: rounded, medium-rounded, semi-rounded, or square")
    search_result_style: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="list", comment="Result style: list or other")
    
    # Search Customization fields
    search_form_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="withBtn", comment="Form type: default or withBtn")
    search_button_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="icon", comment="Button type: icon or withLabel")
    search_button_text: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, default="Search", comment="Search button text")
    search_input_placeholder: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Search input placeholder text")
    search_recent_search: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Enable recent search history")
    search_recent_search_title: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, comment="Recent search title")
    search_show_speech_input: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=True, comment="Show microphone (speech-to-text) control in search"
    )
    search_show_speech_output: Mapped[Optional[bool]] = mapped_column(
        Boolean, nullable=True, default=True, comment="Show speaker (text-to-speech) control in search"
    )
    search_predefined_questions: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=False, comment="Show predefined questions")
    search_questions_position: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, default="below-search", comment="Questions position: below-search or other")
    search_questions_limit: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=5, comment="Number of questions to show")
    search_questions: Mapped[Optional[list]] = mapped_column(JSON, nullable=True, comment="List of predefined questions (JSON array)")
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    user: Mapped["User"] = relationship("User", back_populates="search_settings")
    project: Mapped["Project"] = relationship("Project", back_populates="search_settings")

class LLMConfig(Base):
    """Configuration for LLM providers and models"""
    __tablename__ = "llm_configs"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)
    
    model_provider: Mapped[str] = mapped_column(String(50), default="ollama", nullable=False)
    chat_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    search_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True, comment="Model name for search functionality")
    embedding_model: Mapped[str] = mapped_column(String(100), default=DEFAULT_EMBEDDING_MODEL, nullable=False)
    api_key: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True)

    # Chat-specific generation parameters
    chat_temperature: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Temperature for chat (0.0-2.0)")
    chat_top_p: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Top P for chat (0.0-1.0)")
    chat_best_of: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Best Of for chat (positive integer)")
    chat_frequency_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Frequency penalty for chat (-2.0 to 2.0)")
    chat_presence_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Presence penalty for chat (-2.0 to 2.0)")
    
    # Search-specific generation parameters
    search_temperature: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Temperature for search (0.0-2.0)")
    search_top_p: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Top P for search (0.0-1.0)")
    search_best_of: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, comment="Best Of for search (positive integer)")
    search_frequency_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Frequency penalty for search (-2.0 to 2.0)")
    search_presence_penalty: Mapped[Optional[str]] = mapped_column(String(10), nullable=True, comment="Presence penalty for search (-2.0 to 2.0)")

    # Chat-specific RAG parameters
    chat_top_k: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=8, comment="Number of documents to retrieve for chat")
    chat_similarity_threshold: Mapped[Optional[float]] = mapped_column(Float, nullable=True, default=0.5, comment="Minimum similarity score for document inclusion in chat (0.0-1.0)")
    chat_max_tokens: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, default=1000, comment="Maximum tokens for chat responses (0-3000, 0=unlimited)")
    chat_use_reranker: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True, default=True, comment="Use reranker to improve result relevance in chat")

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    user: Mapped["User"] = relationship("User", back_populates="llm_config")

class ModelConfigProfile(Base):
    """Per-user, per-project, per-provider/model saved configuration profiles for Compare Models feature."""
    __tablename__ = "model_config_profiles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(50), nullable=False, comment="openai | anthropic | mistral | gemini | ollama")
    model_name: Mapped[str] = mapped_column(String(100), nullable=False)
    profile_type: Mapped[str] = mapped_column(String(20), nullable=False, default="search", comment="search | chat")
    api_key: Mapped[Optional[str]] = mapped_column(EncryptedString, nullable=True)
    embedding_model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    compare_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, comment="Include in compare runs")
    extra_params: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True, comment="temperature, top_p, max_tokens, etc.")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "project_id", "provider", "model_name", "profile_type", name="uq_model_config_profile_user_project_provider_model_type"),
    )

    user: Mapped["User"] = relationship("User", back_populates="model_config_profiles")


class Webhook(Base):
    """Webhook configuration for event notifications"""
    __tablename__ = "webhooks"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    url: Mapped[str] = mapped_column(String(2048), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # Store list of events as JSON e.g. ["integration.created", "user.query"]
    events: Mapped[list] = mapped_column(JSON, default=list)
    secret: Mapped[str] = mapped_column(String(255), nullable=False, comment="Signing secret for webhook payloads")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )
    
    user: Mapped["User"] = relationship("User", back_populates="webhooks")
    project: Mapped["Project"] = relationship("Project", back_populates="webhooks")

class GmailIntegration(Base):
    """Gmail OAuth integration per user+project"""
    __tablename__ = "gmail_integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    email_address: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cadence_minutes: Mapped[int] = mapped_column(Integer, default=60)
    max_emails_per_sync: Mapped[int] = mapped_column(Integer, default=100)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_history_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    emails_indexed: Mapped[int] = mapped_column(Integer, default=0)
    status: Mapped[GmailIntegrationStatus] = mapped_column(Enum(GmailIntegrationStatus), default=GmailIntegrationStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sync_jobs: Mapped[list["GmailSyncJob"]] = relationship("GmailSyncJob", back_populates="integration", cascade="all, delete-orphan")
    staged_messages: Mapped[list["GmailStagedMessage"]] = relationship(
        "GmailStagedMessage", back_populates="integration", cascade="all, delete-orphan"
    )


class GmailStagedMessage(Base):
    """Gmail messages fetched into app inbox; user selects which to index for RAG."""

    __tablename__ = "gmail_staged_messages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("gmail_integrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    gmail_message_id: Mapped[str] = mapped_column(String(255), nullable=False)
    thread_id: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    subject: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sender: Mapped[str] = mapped_column(String(1024), nullable=False, default="")
    date_raw: Mapped[str] = mapped_column(String(512), nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    staged_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    integration: Mapped["GmailIntegration"] = relationship("GmailIntegration", back_populates="staged_messages")

    __table_args__ = (
        UniqueConstraint("integration_id", "gmail_message_id", name="uq_gmail_staged_integration_message"),
    )


class GmailProjectCredential(Base):
    """Per-user per-project Google OAuth app credentials for Gmail integration."""
    __tablename__ = "gmail_project_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_gmail_project_credentials_user_project"),
    )


class GmailSyncJob(Base):
    """Gmail sync job execution tracking"""
    __tablename__ = "gmail_sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("gmail_integrations.id"), index=True)
    status: Mapped[GmailSyncJobStatus] = mapped_column(Enum(GmailSyncJobStatus), default=GmailSyncJobStatus.PENDING)
    emails_fetched: Mapped[int] = mapped_column(Integer, default=0)
    emails_indexed: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    integration: Mapped["GmailIntegration"] = relationship("GmailIntegration", back_populates="sync_jobs")


class ConnectorProjectCredential(Base):
    """Per-project OAuth app credentials for connector integrations."""

    __tablename__ = "connector_project_credentials"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    connector_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    client_id: Mapped[str] = mapped_column(String(255), nullable=False)
    client_secret_encrypted: Mapped[str] = mapped_column(Text, nullable=False)
    redirect_uri: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "project_id",
            "connector_type",
            name="uq_connector_project_credentials_user_project_type",
        ),
    )


class ConnectorIntegration(Base):
    """OAuth integration for an external connector per user+project."""

    __tablename__ = "connector_integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    connector_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_label: Mapped[str] = mapped_column(String(255), nullable=False, default="")
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    refresh_token: Mapped[str] = mapped_column(Text, nullable=False)
    token_expiry: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[ConnectorIntegrationStatus] = mapped_column(
        Enum(ConnectorIntegrationStatus), default=ConnectorIntegrationStatus.ACTIVE
    )
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    drive_page_token: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    documents_indexed: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sources: Mapped[Optional["ConnectorSource"]] = relationship(
        "ConnectorSource", back_populates="integration", uselist=False, cascade="all, delete-orphan"
    )
    settings: Mapped[Optional["ConnectorSettings"]] = relationship(
        "ConnectorSettings", back_populates="integration", uselist=False, cascade="all, delete-orphan"
    )
    sync_jobs: Mapped[list["ConnectorSyncJob"]] = relationship(
        "ConnectorSyncJob", back_populates="integration", cascade="all, delete-orphan"
    )
    documents: Mapped[list["ConnectorDocument"]] = relationship(
        "ConnectorDocument", back_populates="integration", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "project_id",
            "connector_type",
            name="uq_connector_integrations_user_project_type",
        ),
    )


class ConnectorSource(Base):
    """Selected sync sources (folders, spaces, etc.) for a connector integration."""

    __tablename__ = "connector_sources"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_integrations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    sources: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    integration: Mapped["ConnectorIntegration"] = relationship("ConnectorIntegration", back_populates="sources")


class ConnectorSettings(Base):
    """Server-validated connector settings (cadence, limits, rules)."""

    __tablename__ = "connector_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_integrations.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    settings: Mapped[dict] = mapped_column(JSON, default=dict)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    integration: Mapped["ConnectorIntegration"] = relationship("ConnectorIntegration", back_populates="settings")


class ConnectorSyncJob(Base):
    """Connector sync run history."""

    __tablename__ = "connector_sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_integrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[ConnectorSyncJobStatus] = mapped_column(
        Enum(ConnectorSyncJobStatus), default=ConnectorSyncJobStatus.PENDING
    )
    files_fetched: Mapped[int] = mapped_column(Integer, default=0)
    files_indexed: Mapped[int] = mapped_column(Integer, default=0)
    files_skipped: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    integration: Mapped["ConnectorIntegration"] = relationship("ConnectorIntegration", back_populates="sync_jobs")


class ConnectorDocument(Base):
    """Tracks synced connector files for dedup, purge, and resume."""

    __tablename__ = "connector_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("connector_integrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    drive_file_id: Mapped[str] = mapped_column(String(255), nullable=False)
    document_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True, index=True)
    content_hash: Mapped[Optional[str]] = mapped_column(String(128), nullable=True)
    staging_path: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    drive_modified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    trashed: Mapped[bool] = mapped_column(Boolean, default=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    integration: Mapped["ConnectorIntegration"] = relationship("ConnectorIntegration", back_populates="documents")

    __table_args__ = (
        UniqueConstraint("integration_id", "drive_file_id", name="uq_connector_documents_integration_file"),
    )


class ClickUpIntegration(Base):
    """ClickUp OAuth integration per user+project"""
    __tablename__ = "clickup_integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    workspace_id: Mapped[str] = mapped_column(String(255), nullable=False)
    workspace_name: Mapped[str] = mapped_column(String(255), nullable=False)
    access_token: Mapped[str] = mapped_column(Text, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    cadence_minutes: Mapped[int] = mapped_column(Integer, default=60)
    last_sync_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_task_updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    items_indexed: Mapped[int] = mapped_column(Integer, default=0)
    sync_tasks: Mapped[bool] = mapped_column(Boolean, default=True)
    sync_docs: Mapped[bool] = mapped_column(Boolean, default=True)
    sync_chats: Mapped[bool] = mapped_column(Boolean, default=True)
    status: Mapped[ClickUpIntegrationStatus] = mapped_column(Enum(ClickUpIntegrationStatus), default=ClickUpIntegrationStatus.ACTIVE)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    sync_jobs: Mapped[list["ClickUpSyncJob"]] = relationship("ClickUpSyncJob", back_populates="integration", cascade="all, delete-orphan")


class ClickUpSyncJob(Base):
    """ClickUp sync job execution tracking"""
    __tablename__ = "clickup_sync_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    integration_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("clickup_integrations.id"), nullable=False, index=True)
    status: Mapped[ClickUpSyncJobStatus] = mapped_column(Enum(ClickUpSyncJobStatus), default=ClickUpSyncJobStatus.PENDING)
    tasks_fetched: Mapped[int] = mapped_column(Integer, default=0)
    tasks_indexed: Mapped[int] = mapped_column(Integer, default=0)
    docs_fetched: Mapped[int] = mapped_column(Integer, default=0)
    docs_indexed: Mapped[int] = mapped_column(Integer, default=0)
    chats_fetched: Mapped[int] = mapped_column(Integer, default=0)
    chats_indexed: Mapped[int] = mapped_column(Integer, default=0)
    errors: Mapped[list] = mapped_column(JSON, default=list)
    queued_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    integration: Mapped["ClickUpIntegration"] = relationship("ClickUpIntegration", back_populates="sync_jobs")


class Notification(Base):
    """User notifications model"""
    __tablename__ = "notifications"
    
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    type: Mapped[str] = mapped_column(String(50), default="info")  # info, success, warning, error
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    action_url: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    
    user: Mapped["User"] = relationship("User", back_populates="notifications")


class AuditEvent(Base):
    """Immutable project/account audit trail for security and compliance."""
    __tablename__ = "audit_events"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False, index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("projects.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    api_key_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("api_keys.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    actor_type: Mapped[str] = mapped_column(
        String(32), nullable=False, default="user", index=True
    )
    event_type: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    severity: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(255), nullable=False)
    resource_type: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    resource_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)


class BackgroundJobStatus(PyEnum):
    PENDING = "PENDING"
    RUNNING = "RUNNING"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"
    CANCELLED = "CANCELLED"


class Organization(Base):
    """Multi-tenant organization with per-org quota overrides."""

    __tablename__ = "organizations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    max_users: Mapped[int] = mapped_column(Integer, default=0)
    max_projects: Mapped[int] = mapped_column(Integer, default=0)
    max_crawls_per_user: Mapped[int] = mapped_column(Integer, default=0)
    max_queued_ingest_per_project: Mapped[int] = mapped_column(Integer, default=0)
    max_concurrent_ingest_per_project: Mapped[int] = mapped_column(Integer, default=0)
    registration_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    default_member_permissions: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    members: Mapped[list["OrganizationMember"]] = relationship(
        "OrganizationMember",
        back_populates="organization",
        cascade="all, delete-orphan",
    )
    projects: Mapped[list["Project"]] = relationship("Project", back_populates="organization")
    sso_config: Mapped[Optional["OrganizationSsoConfig"]] = relationship(
        "OrganizationSsoConfig",
        back_populates="organization",
        uselist=False,
        cascade="all, delete-orphan",
    )


class OrganizationSsoConfig(Base):
    """Per-organization SSO / OIDC configuration."""

    __tablename__ = "organization_sso_configs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, unique=True, index=True
    )
    protocol: Mapped[str] = mapped_column(String(10), nullable=False, default="oidc")
    provider: Mapped[str] = mapped_column(String(32), nullable=False, default="google")
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    idp_entity_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    client_id: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    client_secret_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    authorization_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    token_url: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    jwks_uri: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    email_domains: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    jit_provisioning_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    default_role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    organization: Mapped["Organization"] = relationship("Organization", back_populates="sso_config")


class UserIdpIdentity(Base):
    """Links a RAGSuite user to an external IdP subject."""

    __tablename__ = "user_idp_identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    org_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idp_subject: Mapped[str] = mapped_column(String(512), nullable=False)
    protocol: Mapped[str] = mapped_column(String(10), nullable=False)
    email_at_link: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint(
            "org_id",
            "idp_subject",
            "protocol",
            name="uq_user_idp_identities_org_subject_protocol",
        ),
    )

    user: Mapped["User"] = relationship("User", back_populates="idp_identities")


class OrganizationMember(Base):
    """Organization membership + role mapping."""
    __tablename__ = "organization_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    org_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="member")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    invited_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    invite_status: Mapped[InviteStatus] = mapped_column(
        # Persist enum *values* (pending/accepted/revoked) to match the DB type
        # created by alembic; SQLAlchemy defaults to member *names* (PENDING/...).
        Enum(
            InviteStatus,
            values_callable=lambda enum_cls: [item.value for item in enum_cls],
        ),
        nullable=False,
        default=InviteStatus.ACCEPTED,
        server_default=InviteStatus.ACCEPTED.value,
    )
    invite_token_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True, index=True)
    invite_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invite_activated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    joined_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("org_id", "user_id", name="uq_organization_members_org_user"),
    )

    organization: Mapped["Organization"] = relationship("Organization", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="organization_memberships", foreign_keys=[user_id])


class ProjectMember(Base):
    """Project-level membership and feature permissions."""
    __tablename__ = "project_members"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    permissions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    granted_by: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_members_project_user"),
    )

    project: Mapped["Project"] = relationship("Project", back_populates="members")
    user: Mapped["User"] = relationship("User", back_populates="project_memberships", foreign_keys=[user_id])


class BackgroundJobType(PyEnum):
    CRAWL = "CRAWL"
    CRAWL_FETCH = "CRAWL_FETCH"
    CRAWL_INGEST_BATCH = "CRAWL_INGEST_BATCH"
    DOCUMENT_INGEST = "DOCUMENT_INGEST"
    PURGE_CRAWL_SOURCE = "PURGE_CRAWL_SOURCE"
    PURGE_UPLOADED_DOCUMENT = "PURGE_UPLOADED_DOCUMENT"
    REINDEX = "REINDEX"
    SEND_VERIFICATION_EMAIL = "SEND_VERIFICATION_EMAIL"
    WEBHOOK_DELIVERY = "WEBHOOK_DELIVERY"
    DATA_FOLDER_INGEST = "DATA_FOLDER_INGEST"
    GMAIL_SYNC = "GMAIL_SYNC"
    CONNECTOR_SYNC = "CONNECTOR_SYNC"
    PURGE_CONNECTOR_INTEGRATION = "PURGE_CONNECTOR_INTEGRATION"


class BackgroundJob(Base):
    """Durable queue row for heavy work executed outside the request lifecycle."""

    __tablename__ = "background_jobs"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(
        String(32), nullable=False, default=BackgroundJobStatus.PENDING.value, index=True
    )
    user_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="SET NULL"), nullable=True, index=True
    )
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, unique=True)
    payload: Mapped[dict] = mapped_column(JSON, default=dict)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    max_attempts: Mapped[int] = mapped_column(Integer, default=3)
    queued_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    priority: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    job_class: Mapped[Optional[str]] = mapped_column(String(32), nullable=True)
    retry_after: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class JobArchive(Base):
    """Cold storage for completed/failed background jobs (retention archive)."""

    __tablename__ = "job_archive"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True)
    job_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, nullable=True, index=True)
    project_id: Mapped[Optional[uuid.UUID]] = mapped_column(UUID(as_uuid=True), nullable=True)
    payload: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    result: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=0)
    queued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    archived_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), index=True
    )


class ReindexJob(Base):
    """Persisted embedding reindex progress (survives API restarts)."""

    __tablename__ = "reindex_jobs"
    __table_args__ = (
        UniqueConstraint("project_id", "source", name="uq_reindex_jobs_project_source"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"))
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running", index=True)
    total: Mapped[int] = mapped_column(Integer, default=0)
    embedded: Mapped[int] = mapped_column(Integer, default=0)
    skipped: Mapped[int] = mapped_column(Integer, default=0)
    failed: Mapped[int] = mapped_column(Integer, default=0)
    collection_name: Mapped[Optional[str]] = mapped_column(String(512), nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)


class N8nIntegration(Base):
    """Per-user per-project n8n instance configuration."""
    __tablename__ = "n8n_integrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False, index=True)
    environment: Mapped[APIKeyEnvironment] = mapped_column(Enum(APIKeyEnvironment), nullable=False, index=True)
    base_url: Mapped[str] = mapped_column(String(2048), nullable=False)
    api_key_encrypted: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[N8nIntegrationStatus] = mapped_column(
        Enum(N8nIntegrationStatus), default=N8nIntegrationStatus.DISCONNECTED
    )
    last_test_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    linked_ragsuite_api_key_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True), ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=func.now(),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    __table_args__ = (
        UniqueConstraint("user_id", "project_id", "environment", name="uq_n8n_integrations_user_project_env"),
    )

