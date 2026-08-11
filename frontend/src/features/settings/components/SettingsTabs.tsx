import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { useTranslation } from '@/i18n';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type SettingsTabKey = 'global' | 'retention' | 'intl';

type Props = {
  activeTab: SettingsTabKey;
  onChange: (tab: SettingsTabKey) => void;
  visibleTabs?: SettingsTabKey[];
};

const TAB_KEYS: { key: SettingsTabKey; labelKey: string }[] = [
  { key: 'global', labelKey: 'settings.profile' },
  { key: 'retention', labelKey: 'settings.data-retention' },
  { key: 'intl', labelKey: 'settings.i18n' },
];

/** Pill tabs — neutral outline on wide web; filled primary on native. */
export function SettingsTabs({ activeTab, onChange, visibleTabs }: Props) {
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const { t } = useTranslation();

  const tabs = TAB_KEYS.filter((tab) => !visibleTabs || visibleTabs.includes(tab.key));

  if (tabs.length === 0) {
    return null;
  }

  return (
    <View accessibilityRole="tablist">
      <AppScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[styles.row, { gap: spacing.xs }]}>
        {tabs.map((tab) => {
          const isActive = tab.key === activeTab;
          const label = t(tab.labelKey);
          return (
            <Pressable
              key={tab.key}
              onPress={() => onChange(tab.key)}
              accessibilityRole="tab"
              accessibilityState={{ selected: isActive }}
              accessibilityLabel={`${label} tab`}
              style={({ pressed, hovered }) => {
                const chrome = getWebParityTabStyle({
                  active: isActive,
                  pressed,
                  hovered,
                  colors,
                  surfaceRadius,
                  brandRadius: radius.sm,
                  useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                });
                return [
                  styles.tab,
                  getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                  { paddingHorizontal: spacing.md },
                ];
              }}>
              <Text
                style={[
                  typography.body,
                  getWebParityTabLabelStyle(
                    getWebParityTabStyle({
                      active: isActive,
                      pressed: false,
                      colors,
                      surfaceRadius,
                      brandRadius: radius.sm,
                      useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                    }).textColor,
                    typography.body,
                  ),
                ]}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    paddingBottom: 4,
  },
  tab: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
