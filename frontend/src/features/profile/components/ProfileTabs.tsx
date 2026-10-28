import { KeyRound, Shield, UserRound } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  showAccess?: boolean;
};

export function ProfileTabs({
  activeTab,
  onChange,
  showGeneral = true,
  showSecurity = true,
  showAccess = false,
}: Props) {
  const { colors, radius, surfaceRadius, isWebParitySurfaces, spacing, typography, mode } = useAppTheme();
  const copy = useProfileCopy();
  const tabs = useMemo(() => {
    const next: { key: ProfileTabKey; label: string; Icon: typeof UserRound }[] = [];
    if (showGeneral) {
      next.push({ key: 'general', label: copy.tabs.general, Icon: UserRound });
    }
    if (showSecurity) {
      next.push({ key: 'security', label: copy.tabs.security, Icon: Shield });
    }
    if (showAccess) {
      next.push({ key: 'access', label: copy.tabs.access, Icon: KeyRound });
    }
    return next;
  }, [copy.tabs.access, copy.tabs.general, copy.tabs.security, showAccess, showGeneral, showSecurity]);

  if (tabs.length === 0) {
    return null;
  }

  return (
    <View accessibilityRole="tablist" style={[styles.row, { gap: spacing.xs }]}>
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        const Icon = tab.Icon;
        const chrome = getWebParityTabStyle({
          active: isActive,
          pressed: false,
          colors,
          surfaceRadius,
          brandRadius: radius.sm,
          useWebParity: isWebParitySurfaces,
          colorMode: mode,
        });
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label} tab`}
            onPress={() => onChange(tab.key)}
            style={({ pressed, hovered }) => {
              const pressChrome = getWebParityTabStyle({
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
                getWebParityTabPressableStyle(pressChrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                { paddingHorizontal: spacing.md, gap: spacing.xs },
              ];
            }}>
            <Icon size={16} color={chrome.textColor} />
            <Text style={[typography.body, getWebParityTabLabelStyle(chrome.textColor, typography.body)]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    alignSelf: 'flex-start',
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
