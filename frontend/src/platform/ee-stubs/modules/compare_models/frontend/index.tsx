import React from 'react';

import {
  CompareModelsMock,
  EnterpriseLockedPreview,
} from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** Locked Compare Models teaser (CE-alone). */
export function CompareModelsLockedScreen() {
  const { t } = useTranslation();
  return (
    <EnterpriseLockedPreview
      featureName={t('enterprise.locked.features.compareModels', { defaultValue: 'Compare models' })}
      message={t('enterprise.locked.messages.compareModels', {
        defaultValue: 'Multi-model compare is available in RAGSuite Enterprise.',
      })}>
      <CompareModelsMock />
    </EnterpriseLockedPreview>
  );
}
