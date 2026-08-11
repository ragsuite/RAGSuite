import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  AuditCategoryFilter,
  AuditProjectFilter,
  AuditSeverityFilter,
  AuditStatusFilter,
} from '@/features/audit-logs/types/audit-log.types';
import {
  getAuditCategoryFilterOptions,
  getAuditSeverityFilterOptions,
  getAuditStatusFilterOptions,
} from '@/features/audit-logs/utils/audit-log-options';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  onClose: () => void;
  project: AuditProjectFilter;
  onProjectChange: (value: AuditProjectFilter) => void;
  projectOptions: { key: AuditProjectFilter; label: string }[];
  category: AuditCategoryFilter;
  onCategoryChange: (value: AuditCategoryFilter) => void;
  severity: AuditSeverityFilter;
  onSeverityChange: (value: AuditSeverityFilter) => void;
  status: AuditStatusFilter;
  onStatusChange: (value: AuditStatusFilter) => void;
  activeFilterCount: number;
  onClearFilters: () => void;
};

export function AuditLogsFilterSheet({
  visible,
  onClose,
  project,
  onProjectChange,
  projectOptions,
  category,
  onCategoryChange,
  severity,
  onSeverityChange,
  status,
  onStatusChange,
  activeFilterCount,
  onClearFilters,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const categoryOptions = useMemo(() => getAuditCategoryFilterOptions(t), [t]);
  const severityOptions = useMemo(() => getAuditSeverityFilterOptions(t), [t]);
  const statusOptions = useMemo(() => getAuditStatusFilterOptions(t), [t]);

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
              onPress={onClearFilters}
              accessibilityRole="button"
              accessibilityLabel={t('common.clear')}
              style={({ pressed }) => [
                styles.clearBtn,
                {
                  borderColor: colors.border,
                  backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
                  borderRadius: surfaceRadius.input,
                },
              ]}>
              <Text style={[typography.body, { color: colors.primary, fontWeight: '500', textAlign: 'center' }]}>
                {t('common.clear')}
              </Text>
            </Pressable>
          ) : null}
          <AppButton label={t('common.done')} size="compact" onPress={onClose} />
        </View>
      }>
      <View style={{ gap: spacing.md }}>
        <AppSelectField
          label={t('audit.filter.project')}
          value={project}
          options={projectOptions}
          onChange={onProjectChange}
          pickerPresentation="inline"
          accessibilityLabel={t('audit.filter.project')}
        />
        <AppSelectField
          label={t('audit.filter.category')}
          value={category}
          options={categoryOptions}
          onChange={onCategoryChange}
          pickerPresentation="inline"
          accessibilityLabel={t('audit.filter.category')}
        />
        <AppSelectField
          label={t('audit.filter.severity')}
          value={severity}
          options={severityOptions}
          onChange={onSeverityChange}
          pickerPresentation="inline"
          accessibilityLabel={t('audit.filter.severity')}
        />
        <AppSelectField
          label={t('audit.filter.status')}
          value={status}
          options={statusOptions}
          onChange={onStatusChange}
          pickerPresentation="inline"
          accessibilityLabel={t('audit.filter.status')}
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
