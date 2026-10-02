import React from 'react';
import { StyleSheet, View } from 'react-native';

import {
  AnalyticsMock,
  EnterpriseLockedPreview,
} from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

/** CE locked teaser — the full Dashboard lives in EE module `analytics`. */
export function AnalyticsScreen() {
  const { t } = useTranslation();

  return (
    <View style={styles.root}>
      <EnterpriseLockedPreview
        style={styles.preview}
        featureName={t('enterprise.locked.features.analytics', { defaultValue: 'Dashboard' })}
        message={t('enterprise.locked.messages.analytics', {
          defaultValue:
            'The full Dashboard — cohorts, trends, and cost — is available in RAGSuite Enterprise.',
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
