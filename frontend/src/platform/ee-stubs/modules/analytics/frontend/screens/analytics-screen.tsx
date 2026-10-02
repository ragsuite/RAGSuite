import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AnalyticsMock,
  EnterpriseLockedPreview,
} from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** CE locked teaser — full dashboard lives in EE `analytics`. */
export function AnalyticsScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <EnterpriseLockedPreview
        style={styles.preview}
        featureName={t('enterprise.locked.features.analytics', { defaultValue: 'Advanced analytics' })}
        message={t('enterprise.locked.messages.analytics', {
          defaultValue:
            'Advanced analytics — cohorts, trends, and cost — are available in RAGSuite Enterprise.',
        })}>
        <AnalyticsMock />
      </EnterpriseLockedPreview>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 0,
  },
  preview: {
    flex: 1,
    alignSelf: 'stretch',
    width: '100%',
    minHeight: 480,
  },
});
