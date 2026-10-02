import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';

type MockSeed = Pick<AuditEvent, 'event_type' | 'category' | 'severity' | 'status' | 'action' | 'summary'> & {
  resource_type: string;
  timestamp: string;
};

const SEEDS: MockSeed[] = [
  {
    event_type: 'project.updated',
    category: 'config',
    severity: 'low',
    status: 'success',
    action: 'update',
    summary: 'Project settings updated',
    resource_type: 'project',
    timestamp: '2025-01-14T09:12:00Z',
  },
  {
    event_type: 'api_key.created',
    category: 'integration',
    severity: 'medium',
    status: 'success',
    action: 'create',
    summary: 'API key created',
    resource_type: 'api_key',
    timestamp: '2025-01-12T16:40:00Z',
  },
  {
    event_type: 'auth.login_failed',
    category: 'identity',
    severity: 'high',
    status: 'failure',
    action: 'login',
    summary: 'Sign-in attempt failed',
    resource_type: 'user',
    timestamp: '2025-01-10T07:05:00Z',
  },
  {
    event_type: 'document.deleted',
    category: 'data',
    severity: 'medium',
    status: 'success',
    action: 'delete',
    summary: 'Document removed from knowledge base',
    resource_type: 'document',
    timestamp: '2025-01-08T13:27:00Z',
  },
  {
    event_type: 'settings.changed',
    category: 'config',
    severity: 'low',
    status: 'warning',
    action: 'update',
    summary: 'Chat model settings changed',
    resource_type: 'settings',
    timestamp: '2025-01-06T11:51:00Z',
  },
];

/** Decorative rows behind the Community audit-history lock — never real data. */
export const AUDIT_LOCKED_MOCK_EVENTS: readonly AuditEvent[] = SEEDS.map((seed, index) => ({
  ...seed,
  id: `locked-mock-${index}`,
  project_id: null,
  project_name: 'Knowledge base',
  user_id: null,
  api_key_id: null,
  actor_type: 'user',
  actor: { id: 0, username: 'admin', email: 'admin@example.com' },
  resource_id: null,
  details: null,
  ip_address: null,
  user_agent: null,
}));
