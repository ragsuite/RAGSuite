import React from 'react';

import { EnterpriseLockedPreview, RetentionMock } from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** CE-alone teaser when RAGSUITE_EE is not attached. */
export function SettingsRetentionPanel(_props: {
  retentionDays: number;
  saving?: boolean;
  onSave: (days: number) => void;
}) {
  const { t } = useTranslation();
  return (
    <EnterpriseLockedPreview
      featureName={t('enterprise.locked.features.compliance', {
        defaultValue: 'Compliance & retention',
      })}
      message={t('enterprise.locked.messages.compliance', {
        defaultValue:
          'Data retention controls, compliance exports, and legal hold are available in RAGSuite Enterprise.',
      })}
      style={{ minHeight: 320 }}>
      <RetentionMock />
    </EnterpriseLockedPreview>
  );
}

export function DataRetentionForm(_props: Record<string, unknown>) {
  return <SettingsRetentionPanel retentionDays={90} onSave={() => undefined} />;
}
