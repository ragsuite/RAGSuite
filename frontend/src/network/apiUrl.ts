import { API_URL } from "../../env.json";

let runtimeApiBaseUrl = String(API_URL || '').replace(/\/+$/, '');

/**
 * Runtime API origin override for third-party embeds (`/embed/chatbot`, `/embed/search`).
 * Paths in API_CONFIG still include `/api/v1/...`; BASE_URL is host only.
 */
export function configureRuntimeApiBaseUrl(baseUrl: string): void {
  const normalized = String(baseUrl || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api\/v1$/i, '');
  if (!normalized) return;
  runtimeApiBaseUrl = normalized;
}

/** Accepts loader `apiEndpoint` (`https://host/api/v1`) or a bare origin. */
export function configureRuntimeApiBaseUrlFromEndpoint(apiEndpoint: string): void {
  configureRuntimeApiBaseUrl(apiEndpoint);
}

export const API_CONFIG = {
  get BASE_URL(): string {
    return runtimeApiBaseUrl;
  },

  // Auth (Crawl module)
  AUTH_LOGIN: "/api/v1/crawl/auth/login",
  AUTH_LOGOUT: "/api/v1/crawl/auth/logout",
  AUTH_LOGIN_VERIFY_2FA: "/api/v1/crawl/auth/login/verify-2fa",
  AUTH_LOGIN_RESEND_2FA: "/api/v1/crawl/auth/login/resend-2fa",
  AUTH_VERIFY: "/api/v1/crawl/auth/verify",
  AUTH_PUBLIC_CONFIG: "/api/v1/crawl/auth/public-config",
  AUTH_REGISTER: "/api/v1/crawl/auth/register",
  AUTH_VERIFY_EMAIL: "/api/v1/crawl/auth/verify-email",
  AUTH_RESEND_VERIFICATION: "/api/v1/crawl/auth/resend-verification",
  AUTH_FORGOT_PASSWORD: "/api/v1/crawl/auth/forgot-password",
  AUTH_RESET_PASSWORD: "/api/v1/crawl/auth/reset-password",

  // Google SSO (start is full-page navigation — not Axios)
  AUTH_SSO_DISCOVER: "/api/v1/auth/sso/discover",
  AUTH_SSO_START: "/api/v1/auth/sso/start",

  // Organization admin
  ORG: "/api/v1/org",
  ORG_USERS: "/api/v1/org/users",
  orgUser: (userId: number | string) => `/api/v1/org/users/${encodeURIComponent(String(userId))}`,
  orgUserProjects: (userId: number | string) =>
    `/api/v1/org/users/${encodeURIComponent(String(userId))}/projects`,
  ORG_PROJECTS: "/api/v1/org/projects",
  ORG_SSO: "/api/v1/org/sso",
  ORG_SSO_TEST: "/api/v1/org/sso/test",
  ORG_INVITE_SETUP: "/api/v1/org/invite/setup",

  // Projects
  PROJECTS: "/api/v1/projects",
  project: (id: string) => `/api/v1/projects/${id}`,
  projectActivate: (id: string) => `/api/v1/projects/${id}/activate`,
  projectEmbeddingStatus: (id: string) => `/api/v1/projects/${id}/embedding-status`,
  projectReindex: (id: string) => `/api/v1/projects/${id}/reindex`,
  projectReindexProgress: (id: string) => `/api/v1/projects/${id}/reindex-progress`,
  projectEmbeddingItemCoverage: (id: string) => `/api/v1/projects/${id}/embedding-item-coverage`,

  // Configuration / API keys
  API_KEYS: "/api/v1/api-keys",
  apiKey: (id: string) => `/api/v1/api-keys/${id}`,
  apiKeyReveal: (id: string) => `/api/v1/api-keys/${id}/reveal`,
  TEST_RETRIEVE: "/api/v1/retrieve",
  N8N_INBOUND_TEMPLATE: "/api/v1/n8n/inbound-template",
  N8N_RETRIEVE_TEST: "/api/v1/n8n/retrieve/test",

  // Audit logs
  AUDIT_EVENTS: "/api/v1/audit-events",
  auditEvent: (id: string) => `/api/v1/audit-events/${encodeURIComponent(id)}`,

  // Chatbot config
  CHATBOT_CONFIG_BUNDLE: "/api/v1/chatbot/config",
  CHATBOT_CHAT_HISTORY: "/api/v1/chat/history",
  CHATBOT_MODEL_STATUS: "/api/v1/chat/embedding/status",
  CHATBOT_MODEL_TEST_CONNECTION: "/api/v1/chatbot/model/test-connection",
  CHATBOT_SETTINGS: "/api/v1/chatbot/settings",
  CHATBOT_CONFIGURATION: "/api/v1/chatbot/configuration",
  CHATBOT_CUSTOMIZATION: "/api/v1/chatbot/customization",
  CHATBOT_ACTIVATE: "/api/v1/chatbot/activate",
  INTEGRATIONS_EMBED: "/api/v1/integrations/embed",
  integrationsEmbedKey: (keyId: string) =>
    `/api/v1/integrations/embed/keys/${encodeURIComponent(keyId)}`,
  CHATBOT_MODEL_SETTINGS: "/api/v1/chatbot/model",
  CHATBOT_ACTIVE_CONFIG: "/api/v1/chatbot/training/active",
  CHATBOT_WIDGET_CONFIG: "/api/v1/chatbot/widget/config",
  CHATBOT_WIDGET_CUSTOMIZATION: "/api/v1/chatbot/widget/customization",
  CHATBOT_FEEDBACK: "/api/v1/chatbot/feedback",
  CHATBOT_INTEGRATIONS: "/api/v1/chatbot/integrations",
  AVATARS: "/api/v1/avatars",

  // App chat widget (reference: POST /chat/message, POST /chat/message/stream)
  CHAT_MESSAGE: "/api/v1/chat/message",
  CHAT_MESSAGE_STREAM: "/api/v1/chat/message/stream",
  CHAT_FEEDBACK: "/api/v1/chat/feedback",

  // Chat history
  CHAT_HISTORY: "/api/v1/chat/history",
  CHAT_HISTORY_EXPORT: "/api/v1/chat/history/export",
  CHAT_SESSIONS: "/api/v1/chat/sessions",
  chatSession: (sessionId: string) =>
    `/api/v1/chat/sessions/${encodeURIComponent(sessionId)}`,
  chatMessage: (messageId: string) =>
    `/api/v1/chat/messages/${encodeURIComponent(messageId)}`,
  CHAT_MESSAGES: "/api/v1/chat/messages",
  CHAT_PROMPT: "/api/v1/prompt",

  // Config models (shared catalog + chatbot model settings)
  CONFIG_MODELS: "/api/v1/config-models/",
  CONFIG_MODELS_CATALOG: "/api/v1/config-models/models",
  CONFIG_MODELS_TEST: "/api/v1/config-models/test",

  // Compare models
  // Compare Models: keep legacy aliases but route to active backend endpoints.
  COMPARE_MODEL_CONFIGS: "/api/v1/search/models/profiles/",
  compareModelConfig: (id: string) => `/api/v1/search/models/profiles/${id}`,
  COMPARE_MODELS_RUN: "/api/v1/search/compare/stream",

  // Analytics & overview
  OVERVIEW: "/api/v1/overview",
  ANALYTICS_OVERVIEW: "/api/v1/analytics/overview",
  ANALYTICS_DASHBOARD: "/api/v1/analytics/dashboard",
  ANALYTICS_SOURCE_COVERAGE: "/api/v1/analytics/source-coverage",
  ANALYTICS_POPULAR: "/api/v1/analytics/popular",
  ANALYTICS_HARD_QUERIES: "/api/v1/analytics/hard-queries",
  OVERVIEW_THUMBS_UP_RATE: "/api/v1/overview/feedback/thumbs-up-rate",
  OVERVIEW_P95_LATENCY: "/api/v1/overview/latency/p95-latency",
  OVERVIEW_LATEST_FEEDBACK: "/api/v1/overview/feedback/latest",
  OVERVIEW_TOP_SOURCES: "/api/v1/overview/top-sources",

  // Feedback moderation
  FEEDBACK_MODERATION_SUMMARY: "/api/v1/feedback/moderation/summary",
  FEEDBACK_MODERATION_ENTRIES: "/api/v1/feedback/moderation/entries",
  FEEDBACK_MODERATION_EXPORT: "/api/v1/feedback/moderation/export",
  feedbackModerationMessage: (messageId: string) =>
    `/api/v1/feedback/moderation/${encodeURIComponent(messageId)}`,

  // System health
  SYSTEM_HEALTH: "/api/v1/system-health",

  // Notifications
  NOTIFICATIONS: "/api/v1/notifications",
  NOTIFICATIONS_UNREAD_COUNT: "/api/v1/notifications/unread/count",
  NOTIFICATIONS_READ_ALL: "/api/v1/notifications/read-all",
  notificationRead: (id: string) =>
    `/api/v1/notifications/${encodeURIComponent(id)}/read`,
  notification: (id: string) =>
    `/api/v1/notifications/${encodeURIComponent(id)}`,

  // Search configuration
  SEARCH_PROMPT: "/api/v1/search/prompt",
  SEARCH_RESPONSE_CONFIG: "/api/v1/search/response-config",
  RAG_SETTINGS: "/api/v1/rag/settings",
  SEARCH: "/api/v1/search",
  SEARCH_QUERY: "/api/v1/search/query",
  SEARCH_STREAM: "/api/v1/search/stream",
  SEARCH_COMPARE: "/api/v1/search/compare",
  SEARCH_COMPARE_STREAM: "/api/v1/search/compare/stream",
  SEARCH_HISTORY: "/api/v1/search/history",
  SEARCH_SESSIONS: "/api/v1/search/sessions",
  searchSession: (sessionId: string) =>
    `/api/v1/search/sessions/${encodeURIComponent(sessionId)}`,
  SEARCH_FEEDBACK: "/api/v1/search/feedback",
  searchMessage: (messageId: string) =>
    `/api/v1/search/messages/${encodeURIComponent(messageId)}`,
  SEARCH_MESSAGES: "/api/v1/search/messages",
  SEARCH_ACTIVATE: "/api/v1/search/activate",
  SEARCH_MODELS: "/api/v1/search/models/",
  SEARCH_MODELS_TEST: "/api/v1/search/models/test",
  SEARCH_MODELS_AVAILABLE: "/api/v1/search/models/available",
  SEARCH_CONFIGURATION: "/api/v1/search/configuration",
  SEARCH_CUSTOMIZATION: "/api/v1/search/customization",
  SEARCH_MODEL_PROFILES: "/api/v1/search/models/profiles/",
  searchModelProfile: (profileId: string) =>
    `/api/v1/search/models/profiles/${encodeURIComponent(profileId)}`,
  SEARCH_CITATION: "/api/v1/search/citation/",

  // Documents
  DOCUMENTS: "/api/v1/documents",
  DOCUMENT_UPLOAD: "/api/v1/documents/upload",
  document: (id: string) => `/api/v1/documents/${encodeURIComponent(id)}`,
  documentContent: (id: string) => `/api/v1/documents/${encodeURIComponent(id)}/content`,
  documentContentStream: (id: string) => `/api/v1/documents/${encodeURIComponent(id)}/content-stream`,
  documentChunks: (id: string) => `/api/v1/documents/${encodeURIComponent(id)}/chunks`,
  documentContentToken: (id: string) => `/api/v1/documents/${encodeURIComponent(id)}/content-token`,

  // Gmail
  GMAIL_CREDENTIALS: "/api/v1/gmail/credentials",
  GMAIL_CREDENTIALS_STATUS: "/api/v1/gmail/credentials/status",
  GMAIL_AUTH_URL: "/api/v1/gmail/auth/url",
  GMAIL_STATUS: "/api/v1/gmail/status",
  GMAIL_SYNC: "/api/v1/gmail/sync",
  GMAIL_PAUSE: "/api/v1/gmail/pause",
  GMAIL_RESUME: "/api/v1/gmail/resume",
  GMAIL_DISCONNECT: "/api/v1/gmail/disconnect",
  GMAIL_JOBS: "/api/v1/gmail/jobs",
  GMAIL_INBOX: "/api/v1/gmail/inbox",
  GMAIL_INBOX_INDEX: "/api/v1/gmail/inbox/index",
  GMAIL_INBOX_DISMISS: "/api/v1/gmail/inbox/dismiss",

  // Google Drive connector
  GOOGLE_DRIVE_CREDENTIALS: "/api/v1/connectors/google_drive/credentials",
  GOOGLE_DRIVE_CREDENTIALS_STATUS: "/api/v1/connectors/google_drive/credentials/status",
  GOOGLE_DRIVE_AUTH_START: "/api/v1/connectors/google_drive/auth/start",
  GOOGLE_DRIVE_STATUS: "/api/v1/connectors/google_drive/status",
  GOOGLE_DRIVE_BROWSE: "/api/v1/connectors/google_drive/browse",
  GOOGLE_DRIVE_FOLDERS: "/api/v1/connectors/google_drive/folders",
  GOOGLE_DRIVE_SOURCES: "/api/v1/connectors/google_drive/sources",
  GOOGLE_DRIVE_SETTINGS: "/api/v1/connectors/google_drive/settings",
  GOOGLE_DRIVE_SYNC: "/api/v1/connectors/google_drive/sync",
  GOOGLE_DRIVE_JOBS: "/api/v1/connectors/google_drive/jobs",
  GOOGLE_DRIVE_PAUSE: "/api/v1/connectors/google_drive/pause",
  GOOGLE_DRIVE_RESUME: "/api/v1/connectors/google_drive/resume",
  GOOGLE_DRIVE_DISCONNECT: "/api/v1/connectors/google_drive/disconnect",

  // Notion connector
  NOTION_CREDENTIALS: "/api/v1/connectors/notion/credentials",
  NOTION_CREDENTIALS_STATUS: "/api/v1/connectors/notion/credentials/status",
  NOTION_AUTH_START: "/api/v1/connectors/notion/auth/start",
  NOTION_STATUS: "/api/v1/connectors/notion/status",
  NOTION_SEARCH: "/api/v1/connectors/notion/search",
  NOTION_SOURCES: "/api/v1/connectors/notion/sources",
  NOTION_SETTINGS: "/api/v1/connectors/notion/settings",
  NOTION_SYNC: "/api/v1/connectors/notion/sync",
  NOTION_JOBS: "/api/v1/connectors/notion/jobs",
  NOTION_PAUSE: "/api/v1/connectors/notion/pause",
  NOTION_RESUME: "/api/v1/connectors/notion/resume",
  NOTION_DISCONNECT: "/api/v1/connectors/notion/disconnect",

  // Confluence connector
  CONFLUENCE_CREDENTIALS: "/api/v1/connectors/confluence/credentials",
  CONFLUENCE_CREDENTIALS_STATUS: "/api/v1/connectors/confluence/credentials/status",
  CONFLUENCE_AUTH_START: "/api/v1/connectors/confluence/auth/start",
  CONFLUENCE_STATUS: "/api/v1/connectors/confluence/status",
  CONFLUENCE_SPACES: "/api/v1/connectors/confluence/spaces",
  CONFLUENCE_SOURCES: "/api/v1/connectors/confluence/sources",
  CONFLUENCE_SETTINGS: "/api/v1/connectors/confluence/settings",
  CONFLUENCE_SYNC: "/api/v1/connectors/confluence/sync",
  CONFLUENCE_JOBS: "/api/v1/connectors/confluence/jobs",
  CONFLUENCE_PAUSE: "/api/v1/connectors/confluence/pause",
  CONFLUENCE_RESUME: "/api/v1/connectors/confluence/resume",
  CONFLUENCE_DISCONNECT: "/api/v1/connectors/confluence/disconnect",

  // Slack connector
  SLACK_CREDENTIALS: "/api/v1/connectors/slack/credentials",
  SLACK_CREDENTIALS_STATUS: "/api/v1/connectors/slack/credentials/status",
  SLACK_AUTH_START: "/api/v1/connectors/slack/auth/start",
  SLACK_STATUS: "/api/v1/connectors/slack/status",
  SLACK_CHANNELS: "/api/v1/connectors/slack/channels",
  SLACK_SOURCES: "/api/v1/connectors/slack/sources",
  SLACK_SETTINGS: "/api/v1/connectors/slack/settings",
  SLACK_SYNC: "/api/v1/connectors/slack/sync",
  SLACK_JOBS: "/api/v1/connectors/slack/jobs",
  SLACK_PAUSE: "/api/v1/connectors/slack/pause",
  SLACK_RESUME: "/api/v1/connectors/slack/resume",
  SLACK_DISCONNECT: "/api/v1/connectors/slack/disconnect",

  // SharePoint connector
  SHAREPOINT_CREDENTIALS: "/api/v1/connectors/sharepoint/credentials",
  SHAREPOINT_CREDENTIALS_STATUS: "/api/v1/connectors/sharepoint/credentials/status",
  SHAREPOINT_AUTH_START: "/api/v1/connectors/sharepoint/auth/start",
  SHAREPOINT_STATUS: "/api/v1/connectors/sharepoint/status",
  SHAREPOINT_SITES: "/api/v1/connectors/sharepoint/sites",
  SHAREPOINT_DRIVES: "/api/v1/connectors/sharepoint/drives",
  SHAREPOINT_SOURCES: "/api/v1/connectors/sharepoint/sources",
  SHAREPOINT_SETTINGS: "/api/v1/connectors/sharepoint/settings",
  SHAREPOINT_SYNC: "/api/v1/connectors/sharepoint/sync",
  SHAREPOINT_JOBS: "/api/v1/connectors/sharepoint/jobs",
  SHAREPOINT_PAUSE: "/api/v1/connectors/sharepoint/pause",
  SHAREPOINT_RESUME: "/api/v1/connectors/sharepoint/resume",
  SHAREPOINT_DISCONNECT: "/api/v1/connectors/sharepoint/disconnect",

  // Crawl
  CRAWL_SITES: "/api/v1/crawl/sites",
  CRAWL_EMBEDDING_TARGET_OPTIONS: "/api/v1/crawl/embedding-target-options",
  crawlSite: (id: string) => `/api/v1/crawl/sites/${encodeURIComponent(id)}`,
  crawlStart: (id: string) => `/api/v1/crawl/start/${encodeURIComponent(id)}`,
  crawlStatus: (jobId: string) => `/api/v1/crawl/status/${encodeURIComponent(jobId)}`,
  CRAWL_PREVIEW: "/api/v1/crawl/preview",
  CRAWL_JOBS: "/api/v1/crawl/jobs",

  // User profile & account
  USER_PROFILE: "/api/v1/user/profile",
  USER_PROFILE_PASSWORD: "/api/v1/user/profile/password",
  USER_SESSIONS: "/api/v1/user/sessions",
  userSession: (sessionId: string) => `/api/v1/user/sessions/${encodeURIComponent(sessionId)}`,
  USER_2FA_STATUS: "/api/v1/user/2fa/status",
  USER_2FA_SETUP: "/api/v1/user/2fa/setup",
  USER_2FA_VERIFY: "/api/v1/user/2fa/verify",
  USER_2FA_DISABLE: "/api/v1/user/2fa/disable",
  USER_2FA_BACKUP_CODES: "/api/v1/user/2fa/backup-codes",
  USER_2FA_EMAIL_ENABLE: "/api/v1/user/2fa/email/enable",
  USER_2FA_EMAIL_DISABLE: "/api/v1/user/2fa/email/disable",

  // Workspace settings (org branding)
  WORKSPACE_SETTINGS: "/api/v1/settings",
  COMPLIANCE_RETENTION: "/api/v1/compliance/retention",
  COMPLIANCE_DELETION_RECEIPTS: "/api/v1/compliance/deletion-receipts",
  complianceDeletionReceipt: (receiptId: string) =>
    `/api/v1/compliance/deletion-receipts/${encodeURIComponent(receiptId)}`,
  TRUST_CENTER_ACTIVE_SUBPROCESSORS: "/api/v1/trust-center/active-subprocessors",

  // Onboarding
  ONBOARDING_BRANDING: "/api/v1/onboarding/branding",
  ONBOARDING_PROJECT: "/api/v1/onboarding/project",
  ONBOARDING_DATA_SOURCE: "/api/v1/onboarding/data-source",
  ONBOARDING_TEST_QUERY: "/api/v1/onboarding/test-query",
  ONBOARDING_STATUS: "/api/v1/onboarding/status",
  ONBOARDING_CRAWL_STATUS: "/api/v1/onboarding/crawl-status",
  ONBOARDING_SUGGESTIONS: "/api/v1/onboarding/suggestions",
  ONBOARDING_COMPLETE: "/api/v1/onboarding/complete",

  // Platform (public widget capability advertisement)
  WIDGET_CAPABILITIES: "/api/v1/platform/widget-capabilities",
} as const;

export function buildApiUrl(path: string): string {
  return `${API_CONFIG.BASE_URL}${path}`;
}
