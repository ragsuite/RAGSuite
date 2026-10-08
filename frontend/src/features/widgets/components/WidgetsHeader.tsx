import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WidgetRoute } from '@/config/widgets-navigation';
import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';

type Props = {
  active: WidgetRoute;
  /** Mobile / narrow web: hide the page title (the chrome header already shows "Widgets"). */
  compact: boolean;
};

/**
 * Widgets module page title. Chatbot | Search lives in the primary tab row
 * via {@link WidgetsSwitcher}, not beside this header.
 */
export function WidgetsHeader({ active: _active, compact }: Props) {
  const { t } = useTranslation();

  if (compact) return null;

  return (
    <View style={styles.root}>
      <PageSectionHeader title={t('widgets.title')} subtitle={t('widgets.description')} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
});
