import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { CRAWL_MOBILE_TOUCH_MIN, useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
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
  icon?: React.ComponentType<{ size?: number; color?: string }>;
};

type Props<T extends string> = {
  tabs: Tab<T>[];
  activeTab: T;
  onChange: (tab: T) => void;
  variant?: 'primary' | 'secondary';
  appearance?: 'segmented' | 'pill';
};

function resolveTabChrome(
  active: boolean,
  pressed: boolean,
  colors: ReturnType<typeof useAppTheme>['colors'],
  surfaceRadius: ReturnType<typeof useAppTheme>['surfaceRadius'],
  brandRadius: number,
  useWebParity: boolean,
  colorMode: 'light' | 'dark',
  hovered = false,
) {
  return getWebParityTabStyle({
    active,
    pressed,
    hovered,
    colors,
    surfaceRadius,
    brandRadius,
    useWebParity,
    colorMode,
  });
}

export function CrawlSegmentTabs<T extends string>({
  tabs,
  activeTab,
  onChange,
  variant = 'primary',
  appearance = 'segmented',
}: Props<T>) {
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const isPrimary = variant === 'primary';
  const isCompact = useCrawlCompactLayout();
  const tabMinHeight = isCompact && isPrimary ? CRAWL_MOBILE_TOUCH_MIN : isPrimary ? WEB_PARITY_TAB_HEIGHT_PRIMARY : WEB_PARITY_TAB_HEIGHT_SECONDARY;
  const usePill = appearance === 'pill' || (isPrimary && isWebParitySurfaces && appearance === 'segmented');

  const renderPillTab = (tab: Tab<T>, equalWidth?: boolean) => {
    const active = tab.key === activeTab;
    const Icon = tab.icon;
    const brandRadius = radius.sm;
    const chrome = resolveTabChrome(active, false, colors, surfaceRadius, brandRadius, isWebParitySurfaces, mode);

    return (
      <Pressable
        key={tab.key}
        accessibilityRole="tab"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`${tab.label} tab`}
        onPress={() => onChange(tab.key)}
        style={({ pressed, hovered }) => {
          const tabChrome = resolveTabChrome(
            active,
            pressed,
            colors,
            surfaceRadius,
            brandRadius,
            isWebParitySurfaces,
            mode,
            hovered,
          );
          return [
            styles.pillTab,
            equalWidth ? styles.pillTabEqual : null,
            getWebParityTabPressableStyle(tabChrome, isPrimary ? WEB_PARITY_TAB_HEIGHT_PRIMARY : WEB_PARITY_TAB_HEIGHT_SECONDARY),
            { paddingHorizontal: spacing.md },
          ];
        }}>
        {Icon ? <Icon size={16} color={chrome.textColor} /> : null}
        <Text numberOfLines={1} style={[typography.body, getWebParityTabLabelStyle(chrome.textColor, typography.body)]}>
          {tab.label}
        </Text>
      </Pressable>
    );
  };

  if (usePill && isPrimary) {
    return (
      <View accessibilityRole="tablist">
        <AppScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.pillRow, styles.pillRowScroll, { gap: spacing.xs }]}>
          {tabs.map((tab) => renderPillTab(tab))}
        </AppScrollView>
      </View>
    );
  }

  if (usePill && !isPrimary) {
    if (tabs.length <= 2) {
      return (
        <View accessibilityRole="tablist" style={[styles.pillRow, { gap: spacing.xs }]}>
          {tabs.map((tab) => renderPillTab(tab))}
        </View>
      );
    }

    return (
      <View accessibilityRole="tablist">
        <AppScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[styles.pillRow, styles.pillRowScroll, { gap: spacing.xs }]}>
          {tabs.map((tab) => renderPillTab(tab))}
        </AppScrollView>
      </View>
    );
  }

  if (isPrimary) {
    return (
      <View
        accessibilityRole="tablist"
        style={[
          styles.primaryTrack,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surfaceMuted,
            padding: spacing.xxs,
            gap: spacing.xxs,
          },
        ]}>
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          const Icon = tab.icon;
          const chrome = resolveTabChrome(active, false, colors, surfaceRadius, radius.sm, isWebParitySurfaces, mode);
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${tab.label} tab`}
              accessibilityHint={active ? 'Currently selected' : `Switch to ${tab.label}`}
              onPress={() => onChange(tab.key)}
              style={({ pressed, hovered }) => {
                const tabChrome = resolveTabChrome(
                  active,
                  pressed,
                  colors,
                  surfaceRadius,
                  radius.sm,
                  isWebParitySurfaces,
                  mode,
                  hovered,
                );
                return [
                  styles.primaryTab,
                  getWebParityTabPressableStyle(tabChrome, tabMinHeight),
                  isWebParitySurfaces
                    ? null
                    : {
                        borderColor: active ? colors.primary : 'transparent',
                        backgroundColor: active
                          ? colors.primary
                          : pressed || hovered
                            ? colors.surface
                            : 'transparent',
                      },
                  { paddingHorizontal: spacing.sm },
                ];
              }}>
              {Icon ? <Icon size={isCompact ? 16 : 15} color={chrome.textColor} /> : null}
              <Text style={[typography.body, getWebParityTabLabelStyle(chrome.textColor, typography.body)]}>{tab.label}</Text>
            </Pressable>
          );
        })}
      </View>
    );
  }

  return (
    <View accessibilityRole="tablist">
      <AppScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={[styles.secondaryRow, { gap: spacing.xs, paddingRight: spacing.sm }]}
        keyboardShouldPersistTaps="handled">
        {tabs.map((tab) => {
          const active = tab.key === activeTab;
          const chrome = resolveTabChrome(
            active,
            false,
            colors,
            surfaceRadius,
            surfaceRadius.button,
            isWebParitySurfaces,
            mode,
          );
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${tab.label} tab`}
              onPress={() => onChange(tab.key)}
              style={({ pressed, hovered }) => {
                const tabChrome = resolveTabChrome(
                  active,
                  pressed,
                  colors,
                  surfaceRadius,
                  surfaceRadius.button,
                  isWebParitySurfaces,
                  mode,
                  hovered,
                );
                return [
                  styles.secondaryTab,
                  getWebParityTabPressableStyle(tabChrome, tabMinHeight),
                  isWebParitySurfaces
                    ? null
                    : {
                        backgroundColor: active
                          ? colors.surface
                          : pressed || hovered
                            ? colors.surfaceMuted
                            : colors.surface,
                      },
                  { paddingHorizontal: spacing.md },
                ];
              }}>
              <Text
                style={[
                  typography.caption,
                  getWebParityTabLabelStyle(chrome.textColor, typography.caption, { fontSize: typography.caption.fontSize }),
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
  pillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  pillRowScroll: {
    flexWrap: 'nowrap',
    flexGrow: 1,
  },
  pillTab: {
    flexDirection: 'row',
    gap: 6,
    flexShrink: 0,
  },
  pillTabEqual: {
    flex: 1,
    minWidth: 0,
  },
  primaryTrack: {
    flexDirection: 'row',
    borderWidth: 1,
  },
  primaryTab: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
  },
  secondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  secondaryTab: {
    flexShrink: 0,
  },
});
