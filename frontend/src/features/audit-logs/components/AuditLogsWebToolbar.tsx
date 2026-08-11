import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { Search, X } from 'lucide-react-native';

import { AuditLogsFilterDropdowns } from '@/features/audit-logs/components/AuditLogsFilterDropdowns';
import type {
  AuditCategoryFilter,
  AuditProjectFilter,
  AuditSeverityFilter,
  AuditStatusFilter,
} from '@/features/audit-logs/types/audit-log.types';
import { useAuditLogsLayout } from '@/features/audit-logs/utils/audit-log-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  project: AuditProjectFilter;
  onProjectChange: (value: AuditProjectFilter) => void;
  projectOptions: { key: AuditProjectFilter; label: string }[];
  category: AuditCategoryFilter;
  onCategoryChange: (value: AuditCategoryFilter) => void;
  severity: AuditSeverityFilter;
  onSeverityChange: (value: AuditSeverityFilter) => void;
  status: AuditStatusFilter;
  onStatusChange: (value: AuditStatusFilter) => void;
  activeFilterCount?: number;
  onClearFilters?: () => void;
};

export function AuditLogsWebToolbar({
  query,
  onQueryChange,
  project,
  onProjectChange,
  projectOptions,
  category,
  onCategoryChange,
  severity,
  onSeverityChange,
  status,
  onStatusChange,
  activeFilterCount = 0,
  onClearFilters,
}: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const { isToolbarStacked, isFilterScroll } = useAuditLogsLayout();
  const [focused, setFocused] = useState(false);
  const controlRadius = surfaceRadius.input;

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchWrapStacked : styles.searchWrapInline,
        {
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: controlRadius,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.sm,
        },
      ]}>
      <Search size={16} color={focused ? colors.primary : colors.textMuted} />
      <TextInput
        {...searchInputAutofillProps}
        accessibilityLabel={t('audit.searchPlaceholder')}
        placeholder={t('audit.searchPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={onQueryChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[getToolbarSearchInputStyle(typography.body), styles.searchInput, { color: colors.text }]}
      />
    </View>
  );

  const filterDropdowns = (
    <View style={[styles.filtersRow, { gap: spacing.sm }]}>
      <AuditLogsFilterDropdowns
        project={project}
        onProjectChange={onProjectChange}
        projectOptions={projectOptions}
        category={category}
        onCategoryChange={onCategoryChange}
        severity={severity}
        onSeverityChange={onSeverityChange}
        status={status}
        onStatusChange={onStatusChange}
      />
      {activeFilterCount > 0 && onClearFilters ? (
        <AppButton
          label={t('projects.actions.clearFilters')}
          icon={X}
          variant="outline"
          size="compact"
          onPress={onClearFilters}
        />
      ) : null}
    </View>
  );

  const filters = isFilterScroll ? (
    <AppScrollView
      horizontal
      nestedScrollEnabled
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator
      accessibilityLabel={t('common.filter')}
      style={styles.filtersScroll}
      contentContainerStyle={[styles.filtersScrollContent, { gap: spacing.sm }]}>
      {filterDropdowns}
    </AppScrollView>
  ) : (
    filterDropdowns
  );

  if (isToolbarStacked) {
    return (
      <View style={[styles.stack, { gap: spacing.sm, width: '100%' }]}>
        {searchField}
        {filters}
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm, width: '100%' }]}>
      {searchField}
      {filters}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stack: {},
  searchWrap: {
    minHeight: 40,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchWrapInline: {
    flex: 1,
    minWidth: 0,
  },
  searchWrapStacked: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  filtersScroll: {
    flexGrow: 0,
    flexShrink: 0,
    maxWidth: '100%',
  },
  filtersScrollContent: {
    flexGrow: 0,
    alignItems: 'center',
  },
  filtersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    flexWrap: 'wrap',
  },
});
