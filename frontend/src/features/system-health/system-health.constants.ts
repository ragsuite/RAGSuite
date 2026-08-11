/** Preferred core services first (matches reference SystemHealth sort). */
export const CORE_SERVICE_NAMES = ['API Gateway', 'Redis Cache', 'Vector Database', 'PostgreSQL'] as const;

/** @deprecated Prefer CORE_SERVICE_NAMES + sortServicesForDisplay */
export const SERVICE_DISPLAY_ORDER = [
  'API Gateway',
  'PostgreSQL',
  'Redis Cache',
  'Vector Database',
  'OpenAI API (Chatbot)',
] as const;
