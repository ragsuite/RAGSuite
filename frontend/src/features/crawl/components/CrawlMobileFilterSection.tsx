import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CRAWL_MOBILE_TOUCH_MIN, useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  search: React.ReactNode;
  filters: React.ReactNode;
  trailing?: React.ReactNode;
  activeFilterCount?: number;
  accessibilityLabel?: string;
};

export function CrawlMobileFilterSection({
  search,
  filters,
  trailing,
  activeFilterCount = 0,
  accessibilityLabel,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [sheetVisible, setSheetVisible] = useState(false);
  const isCompact = useCrawlCompactLayout();
  const filterLabel = accessibilityLabel ?? t('common.filter');

  if (!isCompact) {
    return (
      <View style={[styles.webRow, { gap: spacing.sm }]}>
        <View style={styles.webSearch}>{search}</View>
        <View style={[styles.webFilters, { gap: spacing.sm }]}>{filters}</View>
        {trailing ? <View style={[styles.webTrailing, { gap: spacing.sm }]}>{trailing}</View> : null}
      </View>
    );
  }

  const hasActiveFilters = activeFilterCount > 0;
  const filterBtnBg = hasActiveFilters ? colors.surfaceMuted : colors.surface;
  const filterIconColor = hasActiveFilters ? colors.primary : colors.textMuted;

  return (
    <>
      <View style={[styles.compactRow, { gap: spacing.sm }]} accessibilityRole="search">
        <View style={styles.searchWrap}>{search}</View>

        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: sheetVisible }}
          accessibilityLabel={`${filterLabel}${hasActiveFilters ? `, ${activeFilterCount} active` : ''}`}
          accessibilityHint="Opens filter options"
          onPress={() => setSheetVisible(true)}
          style={({ pressed }) => [
            styles.filterBtn,
            {
              minHeight: CRAWL_MOBILE_TOUCH_MIN,
              minWidth: CRAWL_MOBILE_TOUCH_MIN,
              borderColor: hasActiveFilters ? colors.primary : colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed ? colors.surfaceMuted : filterBtnBg,
            },
          ]}>
          <ActionIcons.filter size={16} color={filterIconColor} />
          {hasActiveFilters ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.primary, borderRadius: surfaceRadius.button },
              ]}>
              <Text style={[typography.caption, styles.badgeText, { color: colors.textOnPrimary }]}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </View>

      <AdaptiveOverlay
        visible={sheetVisible}
        title={filterLabel}
        onClose={() => setSheetVisible(false)}
        scrollable={false}
        contentStyle={{ gap: spacing.md }}>
        {filters}
        {trailing}
      </AdaptiveOverlay>
    </>
  );
}

export const crawlFilterClearStyle = {
  minHeight: TOOLBAR_CONTROL_HEIGHT,
  justifyContent: 'center' as const,
  paddingHorizontal: 4,
};

const styles = StyleSheet.create({
  webRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexWrap: 'nowrap',
    width: '100%',
  },
  webSearch: {
    flex: 1,
    minWidth: 240,
  },
  webFilters: {
    flexDirection: 'row',
    alignItems: 'stretch',
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  webTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    marginLeft: 'auto',
    flexWrap: 'nowrap',
  },
  compactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchWrap: {
    flex: 1,
    minWidth: 0,
  },
  filterBtn: {
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    fontSize: 10,
    lineHeight: 12,
  },
});
