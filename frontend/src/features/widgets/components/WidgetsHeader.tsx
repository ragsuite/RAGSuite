import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WidgetRoute } from '@/config/widgets-navigation';
import { WidgetTabButton } from '@/features/widgets/components/WidgetTabButton';
import { WidgetTabIntro } from '@/features/widgets/components/WidgetTabIntro';
import { useWidgetSwitch } from '@/features/widgets/hooks/use-widget-switch';
import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  active: WidgetRoute;
  /** Mobile / narrow web: hide the page title (the chrome header already shows "Widgets"). */
  compact: boolean;
};

/** Widgets module header: title, Chatbot | Search pill tabs and the selected widget's description. */
export function WidgetsHeader({ active, compact }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { tabs, switchTo } = useWidgetSwitch(active);
  const activeTab = tabs.find((tab) => tab.route === active);

  return (
    <View style={[styles.root, { marginBottom: spacing.md }]}>
      {!compact ? <PageSectionHeader title={t('widgets.title')} subtitle={t('widgets.description')} /> : null}
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('widgets.switcher.a11y')}
        style={[styles.tabRow, { gap: spacing.xs, marginBottom: compact ? spacing.md : spacing.lg }]}>
        {tabs.map((tab) => (
          <WidgetTabButton
            key={tab.route}
            tab={tab}
            active={tab.route === active}
            onPress={() => switchTo(tab.route)}
          />
        ))}
      </View>
      {activeTab ? <WidgetTabIntro tab={activeTab} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { width: '100%' },
  tabRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
