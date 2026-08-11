import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';

import { ProjectFormSheet } from '@/features/projects/components/ProjectFormSheet';
import { ProjectRow } from '@/features/projects/components/ProjectRow';
import { ProjectsConfirmDeleteSheet } from '@/features/projects/components/ProjectsConfirmDeleteSheet';
import { ProjectsFilterSheet } from '@/features/projects/components/ProjectsFilterSheet';
import { ProjectsHeaderActions } from '@/features/projects/components/ProjectsHeaderActions';
import { ProjectsMobileToolbar } from '@/features/projects/components/ProjectsMobileToolbar';
import { ProjectsSkeleton } from '@/features/projects/components/ProjectsSkeleton';
import { ProjectsWebToolbar } from '@/features/projects/components/ProjectsWebToolbar';
import { useProjects } from '@/features/projects/hooks/useProjects';
import type { Project } from '@/features/projects/types/projects.types';
import { useProjectsLayout } from '@/features/projects/utils/projects-layout';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function ProjectsScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography, componentRadius } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const {
    contentMaxWidth,
    horizontalPadding,
    isNativeMobile,
    isHeaderStacked,
    useFilterSheet,
    useCardLayout,
    useTableLayout,
    showWebPageHeader,
  } = useProjectsLayout();
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const {
    projects,
    total,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sort,
    setSort,
    activeFilterCount,
    clearFilters,
    loading,
    refreshing,
    saving,
    error,
    reload,
    refresh,
    activeSheet,
    openSheet,
    closeSheet,
    submitProject,
    removeProject,
    switchActiveProject,
    editingProject,
    deletingProject,
    emptyLabel,
    canCreateProject,
  } = useProjects();

  const showInitialSkeleton = loading && projects.length === 0 && !query.trim() && statusFilter === 'all';
  const listIsEmpty = !loading && !error && projects.length === 0;

  const onPressProject = useCallback(
    (project: Project) => {
      if (!project.isActive) {
        void switchActiveProject(project.id);
      }
    },
    [switchActiveProject],
  );

  const onEditProject = useCallback(
    (project: Project) => {
      openSheet({ type: 'edit', projectId: project.id });
    },
    [openSheet],
  );

  const onDeleteProject = useCallback(
    (project: Project) => {
      openSheet({ type: 'confirm-delete', projectId: project.id });
    },
    [openSheet],
  );

  const listShellStyle = useTableLayout
    ? [
        styles.listShell,
        {
          borderColor: colors.border,
          borderRadius: componentRadius.card,
          backgroundColor: colors.surface,
          overflow: 'hidden' as const,
        },
      ]
    : undefined;

  const renderProjectList = () => {
    if (loading && projects.length === 0) {
      return <ProjectsSkeleton rows={2} />;
    }

    if (listIsEmpty) {
      return (
        <View style={listShellStyle}>
          <StatePanel loading={false} error={null} onRetry={() => void reload()}>
            <Text style={[typography.body, { color: colors.textMuted, textAlign: 'center' }]}>{emptyLabel}</Text>
          </StatePanel>
        </View>
      );
    }

    if (useCardLayout) {
      return (
        <View style={{ gap: spacing.sm, width: '100%' }}>
          {projects.map((project) => (
            <ProjectRow
              key={project.id}
              project={project}
              onPress={onPressProject}
              onEdit={onEditProject}
              onDelete={onDeleteProject}
            />
          ))}
        </View>
      );
    }

    return (
      <View style={listShellStyle}>
        {projects.map((project) => (
          <ProjectRow
            key={project.id}
            project={project}
            onPress={onPressProject}
            onEdit={onEditProject}
            onDelete={onDeleteProject}
          />
        ))}
      </View>
    );
  };

  return (
    <>
      <AppKeyboardScreenScroll
        rootStyle={{ backgroundColor: colors.background }}
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: isNativeMobile ? spacing.sm : horizontalPadding ?? spacing.md,
            paddingTop: spacing.sm,
            paddingBottom: scrollBottomPadding,
            maxWidth: contentMaxWidth,
            alignSelf: 'center',
            width: '100%',
            gap: spacing.sm,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => void refresh()} />}>
        {showWebPageHeader ? (
          <PageSectionHeader
            variant={isHeaderStacked ? 'compact' : 'page'}
            title={t('projects.title')}
            subtitle={t('projects.subtitle', { count: total })}
            action={
              <ProjectsHeaderActions
                refreshing={refreshing}
                onRefresh={() => void refresh()}
                canCreate={canCreateProject}
                onCreate={() => openSheet({ type: 'create' })}
              />
            }
          />
        ) : null}

        {useFilterSheet ? (
          <ProjectsMobileToolbar
            query={query}
            onQueryChange={setQuery}
            activeFilterCount={activeFilterCount}
            onOpenFilters={() => setFilterSheetVisible(true)}
            canCreate={canCreateProject}
            onCreate={() => openSheet({ type: 'create' })}
          />
        ) : null}

        {useTableLayout && !useFilterSheet ? (
          <ProjectsWebToolbar
            query={query}
            onQueryChange={setQuery}
            statusFilter={statusFilter}
            onStatusFilterChange={setStatusFilter}
            sort={sort}
            onSortChange={setSort}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
          />
        ) : null}

        {error ? (
          <View
            style={[
              styles.errorBanner,
              {
                borderColor: colors.danger,
                backgroundColor: colors.dangerBackground,
                borderRadius: componentRadius.input,
                padding: spacing.sm,
              },
            ]}>
            <Text style={[typography.body, { color: colors.danger }]}>{error}</Text>
          </View>
        ) : null}

        {showInitialSkeleton ? <ProjectsSkeleton rows={3} /> : renderProjectList()}
      </AppKeyboardScreenScroll>

      <ProjectFormSheet
        visible={activeSheet?.type === 'create' || activeSheet?.type === 'edit'}
        mode={activeSheet?.type === 'edit' ? 'edit' : 'create'}
        project={editingProject}
        saving={saving}
        onClose={closeSheet}
        onSubmit={(payload) => void submitProject(payload)}
      />

      <ProjectsConfirmDeleteSheet
        visible={activeSheet?.type === 'confirm-delete'}
        project={deletingProject}
        saving={saving}
        onClose={closeSheet}
        onConfirm={() => {
          if (activeSheet?.type === 'confirm-delete') {
            void removeProject(activeSheet.projectId);
          }
        }}
      />

      <ProjectsFilterSheet
        visible={filterSheetVisible}
        statusFilter={statusFilter}
        sort={sort}
        activeFilterCount={activeFilterCount}
        onStatusFilterChange={setStatusFilter}
        onSortChange={setSort}
        onClear={clearFilters}
        onClose={() => setFilterSheetVisible(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: {},
  headerBlock: {
    width: '100%',
  },
  headerBlockInline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerBlockStacked: {
    flexDirection: 'column',
  },
  listShell: {
    borderWidth: 1,
    width: '100%',
  },
  errorBanner: {
    borderWidth: 1,
    width: '100%',
  },
});
