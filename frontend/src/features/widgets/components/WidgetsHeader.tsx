import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WidgetRoute } from '@/config/widgets-navigation';
import { useTranslation } from '@/i18n';
import { ViewOnlyBadge } from '@/shared/components/read-only-permission-banner';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';

type Props = {
  active: WidgetRoute;
  /** Mobile / narrow web: hide the page title (the chrome header already shows "Widgets"). */
  compact: boolean;
  /** Show the View only chip when the active widget tab is read-only. */
  readOnly?: boolean;
};

/**
 * Widgets module page title. Chatbot | Search lives in the primary tab row
 * via {@link WidgetsSwitcher}, not beside this header.
 */
export function WidgetsHeader({ active: _active, compact, readOnly = false }: Props) {
  const { t } = useTranslation();

  if (compact) {
    if (!readOnly) return null;
    return (
      <View style={styles.root}>
        <ViewOnlyBadge visible />
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <PageSectionHeader
        title={t('widgets.title')}
        subtitle={t('widgets.description')}
        titleAddon={<ViewOnlyBadge visible={readOnly} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
});
