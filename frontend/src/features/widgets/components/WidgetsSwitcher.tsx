import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import type { WidgetRoute } from '@/config/widgets-navigation';
import { WidgetTabButton } from '@/features/widgets/components/WidgetTabButton';
import { useWidgetSwitch } from '@/features/widgets/hooks/use-widget-switch';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  active: WidgetRoute;
  style?: StyleProp<ViewStyle>;
};

/** Chatbot | Search switcher for the Widgets primary tab row. */
export function WidgetsSwitcher({ active, style }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { tabs, switchTo } = useWidgetSwitch(active);

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel={t('widgets.switcher.a11y')}
      style={[styles.tabRow, { gap: spacing.xs }, style]}>
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
}

const styles = StyleSheet.create({
  tabRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
});
