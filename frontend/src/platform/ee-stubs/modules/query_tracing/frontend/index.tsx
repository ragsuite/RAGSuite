import React from 'react';

import { useTranslation } from '@/i18n';
import { EnterpriseLockedIconButton } from '@/platform/ee-locked';

/**
 * CE stub for CSV/JSON history export — opens edition comparison (no real export).
 * Real menu lives in EE `query_tracing`.
 */
export function ChatHistorySourceTraceCard(_props: Record<string, unknown>) {
  return null;
}

export function ChatHistoryTimingSpans(_props: Record<string, unknown>) {
  return null;
}

export function ChatHistoryExportMenu({
  disabled = false,
  controlHeight,
}: {
  disabled?: boolean;
  onExport?: (format: 'csv' | 'json') => void;
  controlHeight?: number;
}) {
  const { t } = useTranslation();

  return (
    <EnterpriseLockedIconButton
      accessibilityLabel={t('enterprise.locked.features.queryTracing', {
        defaultValue: 'Deep query tracing',
      })}
      disabled={disabled}
      controlHeight={controlHeight}
    />
  );
}
