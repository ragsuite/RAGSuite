import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WidgetRoute } from '@/config/widgets-navigation';
import { WidgetTabButton } from '@/features/widgets/components/WidgetTabButton';
import { useWidgetSwitch } from '@/features/widgets/hooks/use-widget-switch';
import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  active: WidgetRoute;
  /** Mobile / narrow web: hide the page title (the chrome header already shows "Widgets"). */
  compact: boolean;
};

/** Widgets module header: title with Chatbot | Search on the right. */
export function WidgetsHeader({ active, compact }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { tabs, switchTo } = useWidgetSwitch(active);

  const switcher = (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('widgets.switcher.a11y')}
      style={[styles.tabRow, compact ? styles.tabRowCompact : null, { gap: spacing.xs }]}>
      {tabs.map((tab) => (
        <WidgetTabButton
          key={tab.route}
          tab={tab}
          active={tab.route === active}
          onPress={() => switchTo(tab.route)}
        />
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      {compact ? (
        switcher
      ) : (
        <PageSectionHeader
          title={t('widgets.title')}
          subtitle={t('widgets.description')}
          action={switcher}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  tabRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  tabRowCompact: { justifyContent: 'flex-end', alignSelf: 'stretch' },
});
