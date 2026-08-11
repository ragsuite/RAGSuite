export type ApiKeyEnvironment = 'production' | 'staging' | 'development';

export type ApiKeyExpiration = 'never' | '30d' | '90d' | '1y';

export type ConfigurationPrimaryTab = 'api-keys' | 'n8n';

export type CurlCommandVariant = 'retrieve' | 'search';

export type ApiKey = {
  id: string;
  name: string;
  description: string;
  /** Masked display value for list views, e.g. rgs_live_abc...xyz */
  maskedKey: string;
  /** Full secret — only stored for keys created in this session (mock). */
  secretKey?: string;
  environment: ApiKeyEnvironment;
  createdAt: string;
  lastUsedAt: string | null;
  requestCount: number;
  expiresAt: string | null;
};

export type CreateApiKeyPayload = {
  name: string;
  description: string;
  environment: ApiKeyEnvironment;
  expiration: ApiKeyExpiration;
};

export type CreateApiKeyResult = {
  key: ApiKey;
  fullKey: string;
};

export type ConfigurationSheet =
  | { type: 'create' }
  | { type: 'created'; keyId: string; fullKey: string }
  | { type: 'confirm-delete'; keyId: string }
  | null;

export type ConfigurationFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;
