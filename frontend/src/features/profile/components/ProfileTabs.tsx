import { Shield, UserRound } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import type { ProfileTabKey } from '@/features/profile/types/profile.types';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  activeTab: ProfileTabKey;
  compact?: boolean;
  onChange: (next: ProfileTabKey) => void;
  showGeneral?: boolean;
  showSecurity?: boolean;
};

export function ProfileTabs({
  activeTab,
  compact = false,
  onChange,
  showGeneral = true,
  showSecurity = true,
}: Props) {
  const { colors, radius, surfaceRadius, isWebParitySurfaces, spacing, typography, mode } = useAppTheme();
  const useWebParity = Platform.OS === 'web' && isWebParitySurfaces;
  const copy = useProfileCopy();
  const tabs = useMemo(
    () =>
      [
        showGeneral ? { key: 'general' as const, label: copy.tabs.general, Icon: UserRound } : null,
        showSecurity ? { key: 'security' as const, label: copy.tabs.security, Icon: Shield } : null,
      ].filter(Boolean) as Array<{ key: ProfileTabKey; label: string; Icon: typeof UserRound }>,
    [copy.tabs.general, copy.tabs.security, showGeneral, showSecurity],
  );

  if (tabs.length === 0) {
    return null;
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
        },
      ]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <Pressable
            key={tab.key}
            onPress={() => onChange(tab.key)}
            style={({ pressed, hovered }) => {
              const chrome = getWebParityTabStyle({
                active: isActive,
                pressed,
                hovered,
                colors,
                surfaceRadius,
                brandRadius: radius.sm,
                useWebParity,
                colorMode: mode,
              });
              return [
                styles.tab,
                useWebParity
                  ? getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY)
                  : { paddingVertical: compact ? spacing.xs : spacing.sm },
                {
                  borderRadius: chrome.borderRadius,
                  borderWidth: useWebParity ? chrome.borderWidth : 0,
                  borderColor: chrome.borderColor,
                  backgroundColor: useWebParity
                    ? chrome.backgroundColor
                    : isActive
                      ? colors.primary
                      : pressed
                        ? colors.surfaceMuted
                        : 'transparent',
                },
              ];
            }}>
            <tab.Icon
              size={16}
              color={
                getWebParityTabStyle({
                  active: isActive,
                  pressed: false,
                  colors,
                  surfaceRadius,
                  brandRadius: radius.sm,
                  useWebParity,
                colorMode: mode,
                }).textColor
              }
            />
            <Text
              style={[
                typography.body,
                styles.label,
                getWebParityTabLabelStyle(
                  getWebParityTabStyle({
                    active: isActive,
                    pressed: false,
                    colors,
                    surfaceRadius,
                    brandRadius: radius.sm,
                    useWebParity,
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

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    flexDirection: 'row',
    gap: 6,
    padding: 6,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
  },
});
