export type AuditEventActorOut = {
  id?: number | null;
  username?: string | null;
  email?: string | null;
};

export type AuditEventOut = {
  id: string;
  timestamp: string;
  project_id?: string | null;
  project_name?: string | null;
  user_id?: number | null;
  api_key_id?: string | null;
  actor_type: string;
  actor?: AuditEventActorOut | null;
  event_type: string;
  category: string;
  severity: string;
  status: string;
  action: string;
  resource_type?: string | null;
  resource_id?: string | null;
  summary: string;
  details?: Record<string, unknown> | null;
  ip_address?: string | null;
  user_agent?: string | null;
};

export type AuditEventListOut = {
  events: AuditEventOut[];
  total: number;
  limit: number;
  offset: number;
};
