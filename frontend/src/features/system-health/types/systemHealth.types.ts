/** Matches backend API payload values */
export type HealthStatus = 'healthy' | 'down' | 'degraded' | 'at_risk';

export type ServiceHealthDetailPayload = {
  status: string;
  uptime_percent: number;
  last_heartbeat_seconds?: number | null;
  health_score: number;
  reason?: string | null;
  predicted_failure_minutes?: number | null;
};

export type SystemHealthApiPayload = {
  services: Record<string, ServiceHealthDetailPayload>;
  timestamp: string;
  overall_health_score: number;
  overall_status: string;
};

/** Stable row for lists (ordered in UI) */
export type ServiceHealthRow = {
  id: string;
  name: string;
  status: HealthStatus;
  uptimePercent: number;
  lastHeartbeatSeconds: number | null;
  healthScore: number;
  reason: string | null;
  predictedFailureMinutes: number | null;
};

export type SystemHealthSnapshot = {
  timestamp: string;
  overallHealthScore: number;
  overallStatus: HealthStatus;
  services: ServiceHealthRow[];
};
