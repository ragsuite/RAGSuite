import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

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
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  project: AuditProjectFilter;
  onProjectChange: (value: AuditProjectFilter) => void;
  projectOptions: { key: AuditProjectFilter; label: string }[];
  category: AuditCategoryFilter;
  onCategoryChange: (value: AuditCategoryFilter) => void;
  severity: AuditSeverityFilter;
  onSeverityChange: (value: AuditSeverityFilter) => void;
  status: AuditStatusFilter;
  onStatusChange: (value: AuditStatusFilter) => void;
};

export function AuditLogsFilterDropdowns({
  project,
  onProjectChange,
  projectOptions,
  category,
  onCategoryChange,
  severity,
  onSeverityChange,
  status,
  onStatusChange,
}: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const categoryOptions = useMemo(() => getAuditCategoryFilterOptions(t), [t]);
  const severityOptions = useMemo(() => getAuditSeverityFilterOptions(t), [t]);
  const statusOptions = useMemo(() => getAuditStatusFilterOptions(t), [t]);

  return (
    <View style={[styles.inlineRow, { gap: spacing.sm }]}>
      <View style={styles.filterSlotWide}>
        <AppSelectField
          label=""
          variant="inline"
          value={project}
          options={projectOptions}
          onChange={onProjectChange}
          accessibilityLabel={t('audit.filter.project')}
          pickerTitle={t('audit.filter.project')}
          controlHeight={TOOLBAR_CONTROL_HEIGHT}
        />
      </View>
      <View style={styles.filterSlot}>
        <AppSelectField
          label=""
          variant="inline"
          value={category}
          options={categoryOptions}
          onChange={onCategoryChange}
          accessibilityLabel={t('audit.filter.category')}
          pickerTitle={t('audit.filter.category')}
          controlHeight={TOOLBAR_CONTROL_HEIGHT}
        />
      </View>
      <View style={styles.filterSlot}>
        <AppSelectField
          label=""
          variant="inline"
          value={severity}
          options={severityOptions}
          onChange={onSeverityChange}
          accessibilityLabel={t('audit.filter.severity')}
          pickerTitle={t('audit.filter.severity')}
          controlHeight={TOOLBAR_CONTROL_HEIGHT}
        />
      </View>
      <View style={styles.filterSlot}>
        <AppSelectField
          label=""
          variant="inline"
          value={status}
          options={statusOptions}
          onChange={onStatusChange}
          accessibilityLabel={t('audit.filter.status')}
          pickerTitle={t('audit.filter.status')}
          controlHeight={TOOLBAR_CONTROL_HEIGHT}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  /** Must be ≥ AppSelectField inline minWidth (140) so slots do not overlap. */
  filterSlot: {
    minWidth: 140,
    width: 148,
  },
  filterSlotWide: {
    minWidth: 156,
    width: 168,
  },
});
