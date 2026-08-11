export type AuditActorType = 'user' | 'api_key' | 'system';

export type AuditCategory = 'identity' | 'integration' | 'data' | 'config';

export type AuditSeverity = 'low' | 'medium' | 'high' | 'critical';

export type AuditStatus = 'success' | 'failure' | 'warning';

export type AuditProjectFilter = 'active' | 'all' | 'account' | (string & {});

export type AuditActor = {
  id: number;
  username: string;
  email: string;
};

export type AuditEvent = {
  id: string;
  timestamp: string;
  project_id: string | null;
  project_name: string | null;
  user_id: number | null;
  api_key_id: string | null;
  actor_type: AuditActorType;
  actor: AuditActor | null;
  event_type: string;
  category: AuditCategory;
  severity: AuditSeverity;
  status: AuditStatus;
  action: string;
  resource_type: string | null;
  resource_id: string | null;
  summary: string;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
};

export type AuditEventsResponse = {
  events: AuditEvent[];
  total: number;
  limit: number;
  offset: number;
};

/** GET /api/v1/audit/events/:id — single event, identical fields to list rows. */
export type AuditEventDetailResponse = AuditEvent;

export type AuditLogQueryParams = {
  limit: number;
  offset: number;
  q?: string;
  project?: AuditProjectFilter;
  category?: AuditCategory | 'all';
  severity?: AuditSeverity | 'all';
  status?: AuditStatus | 'all';
};

export type AuditCategoryFilter = AuditCategory | 'all';
export type AuditSeverityFilter = AuditSeverity | 'all';
export type AuditStatusFilter = AuditStatus | 'all';
