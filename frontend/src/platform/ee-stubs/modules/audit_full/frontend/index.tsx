import React from 'react';

import { useTranslation } from '@/i18n';
import { EnterpriseLockedIconButton } from '@/platform/ee-locked';

/**
 * CE stub for audit log export — opens edition comparison (no real export).
 * Real menu lives in EE `audit_full`.
 */
export function AuditLogsExportMenu({
  disabled = false,
  controlHeight,
}: {
  disabled?: boolean;
  exporting?: boolean;
  onExport?: (format: 'csv' | 'json') => void;
  controlHeight?: number;
}) {
  const { t } = useTranslation();

  return (
    <EnterpriseLockedIconButton
      accessibilityLabel={t('enterprise.locked.a11y', {
        feature: t('enterprise.locked.features.auditExport'),
      })}
      disabled={disabled}
      controlHeight={controlHeight}
    />
  );
}
