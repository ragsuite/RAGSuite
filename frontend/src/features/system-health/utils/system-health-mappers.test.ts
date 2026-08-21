import {
  isSystemHealthApiPayload,
  mapPayloadToSnapshot,
  normalizeHealthStatus,
  SYSTEM_HEALTH_INVALID_PAYLOAD,
} from '@/features/system-health/utils/system-health-mappers';
import type { SystemHealthApiPayload } from '@/features/system-health/types/systemHealth.types';

const validPayload: SystemHealthApiPayload = {
  timestamp: '2026-08-21T04:21:35.000Z',
  overall_health_score: 100,
  overall_status: 'healthy',
  services: {
    'API Gateway': {
      status: 'healthy',
      uptime_percent: 100,
      last_heartbeat_seconds: 0,
      health_score: 100,
      reason: 'Service operating normally.',
      predicted_failure_minutes: null,
    },
    PostgreSQL: {
      status: 'up',
      uptime_percent: 99.5,
      health_score: 98,
    },
  },
};

describe('normalizeHealthStatus', () => {
  it('normalizes known statuses and null/undefined safely', () => {
    expect(normalizeHealthStatus('healthy')).toBe('healthy');
    expect(normalizeHealthStatus('at-risk')).toBe('at_risk');
    expect(normalizeHealthStatus('degraded')).toBe('degraded');
    expect(normalizeHealthStatus(null)).toBe('down');
    expect(normalizeHealthStatus(undefined)).toBe('down');
  });
});

describe('isSystemHealthApiPayload', () => {
  it('accepts a dashboard body with a services map', () => {
    expect(isSystemHealthApiPayload(validPayload)).toBe(true);
  });

  it('rejects null, envelopes without services, and error shapes', () => {
    expect(isSystemHealthApiPayload(null)).toBe(false);
    expect(isSystemHealthApiPayload(undefined)).toBe(false);
    expect(isSystemHealthApiPayload({})).toBe(false);
    expect(isSystemHealthApiPayload({ status: false, message: 'fail' })).toBe(false);
    expect(isSystemHealthApiPayload({ services: null })).toBe(false);
    expect(isSystemHealthApiPayload({ services: [] })).toBe(false);
  });
});

describe('mapPayloadToSnapshot', () => {
  it('maps a valid payload', () => {
    const snapshot = mapPayloadToSnapshot(validPayload);
    expect(snapshot.overallHealthScore).toBe(100);
    expect(snapshot.overallStatus).toBe('healthy');
    expect(snapshot.services.map((s) => s.name)).toEqual(['API Gateway', 'PostgreSQL']);
    expect(snapshot.services[0]?.status).toBe('healthy');
    expect(snapshot.services[1]?.status).toBe('healthy');
  });

  it('throws a stable i18n key when services is missing', () => {
    expect(() =>
      mapPayloadToSnapshot({} as SystemHealthApiPayload),
    ).toThrow(SYSTEM_HEALTH_INVALID_PAYLOAD);
    expect(() =>
      mapPayloadToSnapshot({ services: null } as unknown as SystemHealthApiPayload),
    ).toThrow(SYSTEM_HEALTH_INVALID_PAYLOAD);
  });
});
