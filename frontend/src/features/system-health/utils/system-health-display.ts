import { AlertCircle, AlertTriangle, CheckCircle2, Clock, type LucideIcon } from 'lucide-react-native';

import type { HealthStatus } from '@/features/system-health/types/systemHealth.types';
import type { systemHealthUi } from '@/features/system-health/system-health-ui.tokens';

type Ui = ReturnType<typeof systemHealthUi>;
type Translate = (key: string, params?: Record<string, string | number>) => string;

/** Score color bands — reference `getHealthScoreColor` (green / yellow / red). */
export function healthScoreColor(score: number, ui: Ui): string {
  if (score >= 90) return ui.scoreGood;
  if (score >= 70) return ui.scoreWarn;
  return ui.scoreBad;
}

export function healthStatusVisual(
  status: HealthStatus,
  ui: Ui,
  t: Translate,
): { label: string; bg: string; fg: string; softBg: string; softFg: string; Icon: LucideIcon } {
  if (status === 'healthy') {
    return {
      label: t('system-health.status.healthy'),
      bg: ui.healthy.bg,
      fg: ui.healthy.fg,
      softBg: ui.healthy.softBg,
      softFg: ui.healthy.softFg,
      Icon: CheckCircle2,
    };
  }
  if (status === 'degraded') {
    return {
      label: t('system-health.status.degraded'),
      bg: ui.degraded.bg,
      fg: ui.degraded.fg,
      softBg: ui.degraded.softBg,
      softFg: ui.degraded.softFg,
      Icon: AlertTriangle,
    };
  }
  if (status === 'at_risk') {
    return {
      label: t('system-health.status.atRisk'),
      bg: ui.atRisk.bg,
      fg: ui.atRisk.fg,
      softBg: ui.atRisk.softBg,
      softFg: ui.atRisk.softFg,
      Icon: Clock,
    };
  }
  return {
    label: t('system-health.status.down'),
    bg: ui.down.bg,
    fg: ui.down.fg,
    softBg: ui.down.softBg,
    softFg: ui.down.softFg,
    Icon: AlertCircle,
  };
}

/** Reference `formatLastHeartbeat` — s / m / h / d. */
export function formatLastHeartbeat(
  seconds: number | null,
  t: Translate,
): string {
  if (seconds === null || Number.isNaN(seconds)) return t('system-health.value.na');
  if (seconds < 60) return t('system-health.time.secondsAgo', { count: Math.floor(seconds) });
  if (seconds < 3600) return t('system-health.time.minutesAgo', { count: Math.floor(seconds / 60) });
  if (seconds < 86400) return t('system-health.time.hoursAgo', { count: Math.floor(seconds / 3600) });
  return t('system-health.time.daysAgo', { count: Math.floor(seconds / 86400) });
}

/** Reference `formatPredictedFailure`. */
export function formatPredictedFailure(minutes: number, t: Translate): string {
  if (minutes <= 0) return t('system-health.value.na');
  if (minutes < 60) return t('system-health.predicted.minutes', { count: Math.floor(minutes) });
  if (minutes < 1440) return t('system-health.predicted.hours', { count: Math.floor(minutes / 60) });
  return t('system-health.predicted.days', { count: Math.floor(minutes / 1440) });
}
