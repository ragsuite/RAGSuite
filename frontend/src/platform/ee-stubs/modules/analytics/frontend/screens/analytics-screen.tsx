import React from 'react';

import {
  AnalyticsMock,
  EnterpriseLockedPreview,
} from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** CE locked teaser — full dashboard lives in EE `analytics`. */
export function AnalyticsScreen() {
  const { t } = useTranslation();
  return (
    <EnterpriseLockedPreview
      featureName={t('enterprise.locked.features.analytics', { defaultValue: 'Advanced analytics' })}
      message={t('enterprise.locked.messages.analytics', {
        defaultValue:
          'Advanced analytics — cohorts, trends, and cost — are available in RAGSuite Enterprise.',
      })}>
      <AnalyticsMock />
    </EnterpriseLockedPreview>
  );
}
