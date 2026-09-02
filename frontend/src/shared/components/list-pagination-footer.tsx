import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import {
  PaginationPageSizeSelect,
  PAGINATION_PAGE_SIZE_CONTROL_WIDTH,
} from '@/shared/components/pagination-page-size-select';
import {
  activePageNumberColor,
  circularButtonRadius,
  paginationFooterBarStyle,
} from '@/shared/components/list-pagination-footer.utils';
import {
  pageRangeEnd,
  pageRangeStart,
  visiblePageNumbers,
  VISIBLE_PAGE_BUTTON_COUNT,
  type PageSizeOption,
} from '@/shared/constants/pagination';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useLayoutViewportWidth } from '@/shared/hooks/use-layout-viewport-width';

type Props = {
  page: number;
  pageSize: PageSizeOption;
  total: number;
  totalPages: number;
  loading?: boolean;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
  /** Optional noun for range label, e.g. "events". */
  itemLabel?: string;
};

const PAGE_BUTTON_SIZE_DEFAULT = 36;
const PAGE_BUTTON_SIZE_COMPACT = 32;
const COMPACT_FOOTER_BREAKPOINT = 900;

export function ListPaginationFooter({
  page,
  pageSize,
  total,
  totalPages,
  loading = false,
  onPageChange,
  onPageSizeChange,
  itemLabel,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const viewportWidth = useLayoutViewportWidth();
  const compactControls = viewportWidth < COMPACT_FOOTER_BREAKPOINT;
  const pageButtonSize = compactControls ? PAGE_BUTTON_SIZE_COMPACT : PAGE_BUTTON_SIZE_DEFAULT;
  const pageButtonRadius = circularButtonRadius(pageButtonSize);
  const controlGap = compactControls ? spacing.xxs : spacing.xs;

  if (total === 0) return null;

  const rangeStart = pageRangeStart(page, pageSize, total);
  const rangeEnd = pageRangeEnd(page, pageSize, total);
  const visiblePages = visiblePageNumbers(page, totalPages, VISIBLE_PAGE_BUTTON_COUNT);
  const canGoPrev = page > 1 && !loading;
  const canGoNext = page < totalPages && !loading;

  const rangeText = itemLabel
    ? t('pagination.showingRangeWithLabel', { start: rangeStart, end: rangeEnd, total, label: itemLabel })
    : t('pagination.showingRange', { start: rangeStart, end: rangeEnd, total });

  return (
    <View
      style={[
        paginationFooterBarStyle.bar,
        {
          gap: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
          backgroundColor: colors.surface,
        },
      ]}>
      <View style={[styles.pageSizeBlock, { gap: spacing.xs }]}>
        <Text
          style={[typography.caption, styles.pageSizeLabel, { color: colors.textMuted }]}
          numberOfLines={1}>
          {t('pagination.rowsPerPage')}
        </Text>
        <View style={styles.pageSizeSelect}>
          <PaginationPageSizeSelect
            label={t('pagination.rowsPerPage')}
            pickerTitle={t('pagination.rowsPerPage')}
            value={pageSize}
            onChange={onPageSizeChange}
            controlHeight={pageButtonSize}
          />
        </View>
      </View>

      <Text
        style={[
          typography.caption,
          styles.rangeText,
          { color: colors.textMuted, fontWeight: '500' },
        ]}
        numberOfLines={1}>
        {rangeText}
      </Text>

      <View style={[styles.controls, { gap: controlGap }]}>
        {loading ? <ActivityIndicator color={colors.primary} style={styles.loader} /> : null}
        <PageNavButton
          disabled={!canGoPrev}
          label={t('pagination.first')}
          onPress={() => onPageChange(1)}
          icon={<ChevronsLeft size={16} color={canGoPrev ? colors.text : colors.textMuted} />}
          colors={colors}
          radius={pageButtonRadius}
          size={pageButtonSize}
        />
        <PageNavButton
          disabled={!canGoPrev}
          label={t('pagination.previous')}
          onPress={() => onPageChange(page - 1)}
          icon={<ChevronLeft size={16} color={canGoPrev ? colors.text : colors.textMuted} />}
          colors={colors}
          radius={pageButtonRadius}
          size={pageButtonSize}
        />
        {visiblePages.map((pageNumber) => (
          <PageNumberButton
            key={pageNumber}
            pageNumber={pageNumber}
            active={pageNumber === page}
            loading={loading}
            colors={colors}
            typography={typography}
            radius={pageButtonRadius}
            size={pageButtonSize}
            onPress={() => onPageChange(pageNumber)}
            label={t('pagination.pageNumber', { page: pageNumber })}
          />
        ))}
        <PageNavButton
          disabled={!canGoNext}
          label={t('pagination.next')}
          onPress={() => onPageChange(page + 1)}
          icon={<ChevronRight size={16} color={canGoNext ? colors.text : colors.textMuted} />}
          colors={colors}
          radius={pageButtonRadius}
          size={pageButtonSize}
        />
        <PageNavButton
          disabled={!canGoNext}
          label={t('pagination.last')}
          onPress={() => onPageChange(totalPages)}
          icon={<ChevronsRight size={16} color={canGoNext ? colors.text : colors.textMuted} />}
          colors={colors}
          radius={pageButtonRadius}
          size={pageButtonSize}
        />
      </View>
    </View>
  );
}

type PageNumberButtonProps = {
  pageNumber: number;
  active: boolean;
  loading: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  typography: ReturnType<typeof useAppTheme>['typography'];
  radius: number;
  size: number;
  onPress: () => void;
  label: string;
};

function PageNumberButton({
  pageNumber,
  active,
  loading,
  colors,
  typography,
  radius,
  size,
  onPress,
  label,
}: PageNumberButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      disabled={loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pageButton,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active
            ? colors.primary
            : pressed
              ? colors.surfaceMuted
              : colors.surface,
          opacity: loading ? 0.7 : 1,
        },
      ]}>
      <Text
        style={[
          typography.caption,
          {
            color: activePageNumberColor(active, colors),
            fontWeight: '600',
          },
        ]}>
        {pageNumber}
      </Text>
    </Pressable>
  );
}

type NavButtonProps = {
  disabled: boolean;
  label: string;
  onPress: () => void;
  icon: React.ReactNode;
  colors: ReturnType<typeof useAppTheme>['colors'];
  radius: number;
  size: number;
};

function PageNavButton({ disabled, label, onPress, icon, colors, radius, size }: NavButtonProps) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pageButton,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: colors.border,
          backgroundColor: pressed && !disabled ? colors.surfaceMuted : colors.surface,
          opacity: disabled ? 0.45 : 1,
        },
      ]}>
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pageSizeBlock: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    zIndex: 1,
  },
  pageSizeLabel: {
    fontWeight: '500',
  },
  pageSizeSelect: {
    width: PAGINATION_PAGE_SIZE_CONTROL_WIDTH,
    flexShrink: 0,
  },
  rangeText: {
    flex: 1,
    minWidth: 0,
    textAlign: 'center',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  pageButton: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  loader: {
    marginRight: 4,
  },
});
