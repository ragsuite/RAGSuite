import React from 'react';

import { EnterpriseLockedPreview, RetentionMock } from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** Community keeps data without a time limit; per-project retention is an Enterprise teaser. */
export function SettingsRetentionPanel() {
  const { t } = useTranslation();
  return (
    <EnterpriseLockedPreview
      featureName={t('enterprise.locked.features.retention')}
      message={t('enterprise.locked.messages.retention')}
      fitContent>
      <RetentionMock />
    </EnterpriseLockedPreview>
  );
}

export { SettingsRetentionPanel as ProjectRetentionPanel };
