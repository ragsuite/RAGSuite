import { Search, X } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { ProjectsDropdownMenu } from '@/features/projects/components/ProjectsDropdownMenu';
import type { ProjectSort, ProjectStatusFilter } from '@/features/projects/types/projects.types';
import {
  PROJECTS_WEB_FILTER_WIDTH,
  PROJECTS_WEB_TOOLBAR_HEIGHT,
  useProjectsLayout,
} from '@/features/projects/utils/projects-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusFieldShellStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  statusFilter: ProjectStatusFilter;
  onStatusFilterChange: (value: ProjectStatusFilter) => void;
  sort: ProjectSort;
  onSortChange: (value: ProjectSort) => void;
  activeFilterCount?: number;
  onClearFilters?: () => void;
  embedded?: boolean;
};

export function ProjectsWebToolbar({
  query,
  onQueryChange,
  statusFilter,
  onStatusFilterChange,
  sort,
  onSortChange,
  activeFilterCount = 0,
  onClearFilters,
  embedded = false,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { isToolbarStacked } = useProjectsLayout();
  const [focused, setFocused] = useState(false);
  const controlHeight = PROJECTS_WEB_TOOLBAR_HEIGHT;
  const controlRadius = surfaceRadius.input;

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

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchStacked : styles.searchInline,
        {
          height: controlHeight,
          borderRadius: controlRadius,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.sm,
          ...focusFieldShellStyle(focused, colors.primary, colors.border),
        },
      ]}>
      <Search size={16} color={focused ? colors.primary : colors.textMuted} />
      <TextInput
        {...searchInputAutofillProps}
        accessibilityLabel={t('projects.search.placeholder')}
        placeholder={t('projects.search.placeholder')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={onQueryChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          getToolbarSearchInputStyle(typography.body, controlHeight),
          styles.searchInput,
          { color: colors.text },
          Platform.OS === 'web' ? styles.searchInputWeb : null,
          webSuppressInputOutline(),
        ]}
      />
    </View>
  );

  const filters = (
    <View style={[styles.filters, isToolbarStacked ? styles.filtersStacked : null, { gap: spacing.sm }]}>
      <ProjectsDropdownMenu
        value={statusFilter}
        options={statusOptions}
        onChange={onStatusFilterChange}
        accessibilityLabel={t('projects.filters.status.placeholder')}
        controlHeight={controlHeight}
        triggerWidth={isToolbarStacked ? undefined : PROJECTS_WEB_FILTER_WIDTH}
        fullWidth={isToolbarStacked}
      />
      <ProjectsDropdownMenu
        value={sort}
        options={sortOptions}
        onChange={onSortChange}
        accessibilityLabel={t('projects.filters.sort.placeholder')}
        controlHeight={controlHeight}
        triggerWidth={isToolbarStacked ? undefined : PROJECTS_WEB_FILTER_WIDTH}
        fullWidth={isToolbarStacked}
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

  const inner = isToolbarStacked ? (
    <View style={[styles.stack, { gap: spacing.sm }]}>
      {searchField}
      {filters}
    </View>
  ) : (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {searchField}
      {filters}
    </View>
  );

  if (embedded) {
    return <View style={styles.embeddedShell}>{inner}</View>;
  }

  return <View style={styles.shell}>{inner}</View>;
}

const styles = StyleSheet.create({
  shell: {
    width: '100%',
  },
  embeddedShell: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  stack: {
    width: '100%',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
    minWidth: 0,
  },
  searchInline: {
    flex: 1,
  },
  searchStacked: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    marginVertical: 0,
  },
  searchInputWeb: {
    outlineStyle: 'none',
    outlineWidth: 0,
  } as object,
  filters: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  filtersStacked: {
    width: '100%',
    flexDirection: 'column',
  },
});
