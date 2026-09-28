import React from 'react';
import { StyleSheet, View } from 'react-native';

import type { WidgetTabMeta } from '@/config/widgets-navigation';
import { useTranslation } from '@/i18n';
import { AppCardDescription, AppCardTitle } from '@/shared/components/surfaces/app-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  tab: WidgetTabMeta;
};

const ICON_BADGE_SIZE = 36;

/** Icon + name + description of the selected widget, shown under the Chatbot / Search tabs. */
export function WidgetTabIntro({ tab }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const Icon = tab.icon;

  return (
    <View style={[styles.root, { gap: spacing.sm }]}>
      <View
        style={[
          styles.iconBadge,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: colors.surfaceMuted,
            borderColor: colors.border,
          },
        ]}>
        <Icon size={18} color={colors.primary} />
      </View>
      <View style={[styles.copy, { gap: spacing.xxs }]}>
        <AppCardTitle>{t(tab.labelKey)}</AppCardTitle>
        <AppCardDescription>{t(tab.descriptionKey)}</AppCardDescription>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start' },
  iconBadge: {
    width: ICON_BADGE_SIZE,
    height: ICON_BADGE_SIZE,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  copy: { flex: 1, minWidth: 0 },
});
