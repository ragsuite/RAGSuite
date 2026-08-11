import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ProjectSort, ProjectStatusFilter } from '@/features/projects/types/projects.types';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  statusFilter: ProjectStatusFilter;
  sort: ProjectSort;
  activeFilterCount: number;
  onStatusFilterChange: (value: ProjectStatusFilter) => void;
  onSortChange: (value: ProjectSort) => void;
  onClear: () => void;
  onClose: () => void;
};

export function ProjectsFilterSheet({
  visible,
  statusFilter,
  sort,
  activeFilterCount,
  onStatusFilterChange,
  onSortChange,
  onClear,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  const statusOptions = useMemo(
    () => [
      { key: 'all' as const, label: t('projects.filters.status.all') },
      { key: 'active' as const, label: t('projects.filters.status.active') },
      { key: 'inactive' as const, label: t('projects.filters.status.inactive') },
    ],
    [t],
  );

  const sortOptions = useMemo(
    () => [
      { key: 'newest' as const, label: t('projects.filters.sort.newest') },
      { key: 'oldest' as const, label: t('projects.filters.sort.oldest') },
      { key: 'name-asc' as const, label: t('projects.filters.sort.nameAsc') },
      { key: 'name-desc' as const, label: t('projects.filters.sort.nameDesc') },
    ],
    [t],
  );

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t('common.filter')}
      onClose={onClose}
      accessibilityLabel={t('common.filter')}
      footer={
        <View style={{ gap: spacing.xs }}>
          {activeFilterCount > 0 ? (
            <Pressable
              onPress={onClear}
              accessibilityRole="button"
              accessibilityLabel={t('projects.actions.clearFilters')}
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderRadius: surfaceRadius.input,
                },
              ]}>
              <Text style={[typography.body, { color: colors.primary, fontWeight: '500', textAlign: 'center' }]}>
                {t('projects.actions.clearFilters')}
              </Text>
            </Pressable>
          ) : null}
          <AppButton label={t('common.done')} size="compact" onPress={onClose} />
        </View>
      }>
      <View style={{ gap: spacing.md }}>
        <AppSelectField
          label={t('projects.filters.status.placeholder')}
          value={statusFilter}
          options={statusOptions}
          onChange={onStatusFilterChange}
          pickerPresentation="inline"
          accessibilityLabel={t('projects.filters.status.placeholder')}
        />
        <AppSelectField
          label={t('projects.filters.sort.placeholder')}
          value={sort}
          options={sortOptions}
          onChange={onSortChange}
          pickerPresentation="inline"
          accessibilityLabel={t('projects.filters.sort.placeholder')}
        />
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  clearBtn: {
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
});
