import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import type { TrustCenterTabId } from '@/features/trust-center/content/types';
import { TRUST_CENTER_TAB_IDS } from '@/features/trust-center/content/types';
import { useTranslation } from '@/i18n';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  activeTab: TrustCenterTabId;
  onChange: (tab: TrustCenterTabId) => void;
};

const TAB_LABEL_KEYS: Record<TrustCenterTabId, string> = {
  overview: 'trustCenter.tabs.overview',
  dpa: 'trustCenter.tabs.dpa',
  subprocessors: 'trustCenter.tabs.subprocessors',
  security: 'trustCenter.tabs.security',
  processing: 'trustCenter.tabs.processing',
  ai: 'trustCenter.tabs.ai',
};

export function TrustCenterTabs({ activeTab, onChange }: Props) {
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View accessibilityRole="tablist">
      <AppScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.row, { gap: spacing.xs }]}>
        {TRUST_CENTER_TAB_IDS.map((tab) => {
          const isActive = activeTab === tab;
          const label = t(TAB_LABEL_KEYS[tab]);
          return (
            <Pressable
              key={tab}
              onPress={() => onChange(tab)}
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
                  { fontWeight: isActive ? '600' : '500' },
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
    alignItems: 'center',
    paddingVertical: 2,
  },
  tab: {
    justifyContent: 'center',
  },
});
