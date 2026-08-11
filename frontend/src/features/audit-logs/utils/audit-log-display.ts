import type { AuditEvent, AuditSeverity, AuditStatus } from '@/features/audit-logs/types/audit-log.types';

export function formatAuditTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      month: 'numeric',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
    });
  } catch {
    return '—';
  }
}

export function formatAuditActor(event: AuditEvent): string {
  if (event.actor?.username) return event.actor.username;
  if (event.actor_type === 'api_key') return 'API key';
  if (event.actor_type === 'system') return 'System';
  return '—';
}

export function formatAuditProject(event: AuditEvent): string {
  if (event.project_name) return event.project_name;
  if (event.project_id == null) return 'Account';
  return '—';
}

export function formatAuditResource(event: AuditEvent): string {
  if (!event.resource_type || !event.resource_id) return '—';
  return `${event.resource_type} #${event.resource_id.slice(0, 8)}`;
}

export function formatAuditStatusLabel(status: AuditStatus): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

export function severityBadgeTone(severity: AuditSeverity): 'default' | 'success' | 'muted' | 'danger' {
  if (severity === 'high' || severity === 'critical') return 'danger';
  if (severity === 'low') return 'muted';
  return 'default';
}

export function statusBadgeTone(status: AuditStatus): 'default' | 'success' | 'muted' | 'danger' | 'warning' {
  if (status === 'failure') return 'danger';
  if (status === 'warning') return 'warning';
  return 'success';
}

export function categoryLabel(category: string): string {
  return category.charAt(0).toUpperCase() + category.slice(1);
}

/** Collapse noisy summaries (e.g. n8n HTML error bodies) for list rows. */
export function formatAuditSummary(summary: string, maxLength = 140): string {
  const normalized = summary.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength - 1)}…`;
}
