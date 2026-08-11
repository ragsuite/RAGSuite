import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
  WEB_PARITY_TAB_HEIGHT_SECONDARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Tab<T extends string> = {
  key: T;
  label: string;
};

type PrimaryProps<T extends string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
};

/** Left-aligned pill tabs — neutral outline on wide web; filled primary on native. */
export function ConfigurationPrimaryTabs<T extends string>({ tabs, activeTab, onChange }: PrimaryProps<T>) {
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const { isTabsEqualWidth } = useConfigurationLayout();

  return (
    <View accessibilityRole="tablist" style={[styles.primaryRow, { gap: spacing.xs }]}>
      {tabs.map((tab) => {
        const active = tab.key === activeTab;
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${tab.label} tab`}
            onPress={() => onChange(tab.key)}
            style={({ pressed, hovered }) => {
              const chrome = getWebParityTabStyle({
                active,
                pressed,
                hovered,
                colors,
                surfaceRadius,
                brandRadius: radius.sm,
                useWebParity: isWebParitySurfaces,
                colorMode: mode,
              });
              return [
                styles.primaryTab,
                isTabsEqualWidth ? styles.primaryTabEqual : null,
                getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                { paddingHorizontal: spacing.md },
              ];
            }}>
            <Text
              style={[
                typography.body,
                getWebParityTabLabelStyle(
                  getWebParityTabStyle({
                    active,
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
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

type SecondaryProps<T extends string> = PrimaryProps<T>;

/** Sub-tabs — neutral outline on wide web. */
export function ConfigurationSecondaryTabs<T extends string>({ tabs, activeTab, onChange }: SecondaryProps<T>) {
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const { isNativeMobile, isCompactWeb } = useConfigurationLayout();

  return (
    <View accessibilityRole="tablist">
      <AppScrollView
        horizontal
        showsHorizontalScrollIndicator={isNativeMobile || isCompactWeb}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[styles.secondaryRow, { gap: spacing.xs }]}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${tab.label} tab`}
              onPress={() => onChange(tab.key)}
              style={({ pressed, hovered }) => {
                const chrome = getWebParityTabStyle({
                  active,
                  pressed,
                  hovered,
                  colors,
                  surfaceRadius,
                  brandRadius: radius.lg,
                  useWebParity: isWebParitySurfaces,
                colorMode: mode,
                });
                return [
                  styles.secondaryTab,
                  getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_SECONDARY),
                  { paddingHorizontal: spacing.md },
                ];
              }}>
              <Text
                style={[
                  typography.caption,
                  getWebParityTabLabelStyle(
                    getWebParityTabStyle({
                      active,
                      pressed: false,
                      colors,
                      surfaceRadius,
                      brandRadius: radius.lg,
                      useWebParity: isWebParitySurfaces,
                colorMode: mode,
                    }).textColor,
                    typography.caption,
                  ),
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  primaryTab: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryTabEqual: {
    flex: 1,
    minWidth: 0,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
  },
  secondaryTab: {
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
