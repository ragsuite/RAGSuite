import { useCallback, useMemo, useState } from 'react';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import {
  createProject,
  deleteProject,
  updateProject,
} from '@/features/projects/services/projects.service';
import type {
  ProjectFormPayload,
  ProjectSheet,
  ProjectSort,
  ProjectStatusFilter,
} from '@/features/projects/types/projects.types';
import { useTranslation } from '@/i18n';
import { useToastRef } from '@/shared/toast/use-toast-ref';

function sortProjects<T extends { name: string; createdAt: string }>(projects: T[], sort: ProjectSort): T[] {
  const copy = [...projects];
  switch (sort) {
    case 'oldest':
      return copy.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    case 'name-asc':
      return copy.sort((a, b) => a.name.localeCompare(b.name));
    case 'name-desc':
      return copy.sort((a, b) => b.name.localeCompare(a.name));
    case 'newest':
    default:
      return copy.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }
}

export function useProjects() {
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const {
    projects,
    total,
    activeProjectId,
    loading,
    refreshing,
    error: providerError,
    canCreateProject,
    reload,
    refresh,
    switchProject,
  } = useActiveProject();

  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProjectStatusFilter>('all');
  const [sort, setSort] = useState<ProjectSort>('newest');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<ProjectSheet>(null);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    let next = projects;

    if (statusFilter === 'active') {
      next = next.filter((project) => project.isActive);
    } else if (statusFilter === 'inactive') {
      next = next.filter((project) => !project.isActive);
    }

    if (normalizedQuery) {
      next = next.filter(
        (project) =>
          project.name.toLowerCase().includes(normalizedQuery) ||
          project.description.toLowerCase().includes(normalizedQuery),
      );
    }

    return sortProjects(next, sort);
  }, [projects, query, sort, statusFilter]);

  const activeFilterCount = (statusFilter !== 'all' ? 1 : 0) + (sort !== 'newest' ? 1 : 0);

  const clearFilters = useCallback(() => {
    setStatusFilter('all');
    setSort('newest');
  }, []);

  const openSheet = useCallback((sheet: ProjectSheet) => {
    setActiveSheet(sheet);
  }, []);

  const closeSheet = useCallback(() => {
    setActiveSheet(null);
  }, []);

  const submitProject = useCallback(
    async (payload: ProjectFormPayload) => {
      setSaving(true);
      setError(null);
      const isEdit = activeSheet?.type === 'edit';
      try {
        if (isEdit) {
          await updateProject(activeSheet.projectId, payload);
          toastRef.current({
            description: t('projects.toast.updated.description', { name: payload.name }),
            variant: 'success',
          });
        } else {
          await createProject(payload);
          toastRef.current({
            description: t('projects.toast.created.description', { name: payload.name }),
            variant: 'success',
          });
        }
        closeSheet();
        await reload();
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : isEdit
              ? t('projects.error.updateFailed')
              : t('projects.error.createFailed');
        setError(message);
        toastRef.current({ description: message, variant: 'error' });
      } finally {
        setSaving(false);
      }
    },
    [activeSheet, closeSheet, reload, t, toastRef],
  );

  const removeProject = useCallback(
    async (id: string) => {
      const project = projects.find((item) => item.id === id);
      setSaving(true);
      setError(null);
      try {
        await deleteProject(id);
        toastRef.current({
          description: t('projects.toast.deleted.description', { name: project?.name ?? id }),
          variant: 'success',
        });
        closeSheet();
        await reload();
      } catch (err) {
        const message = err instanceof Error ? err.message : t('projects.error.deleteFailed');
        setError(message);
        toastRef.current({ description: message, variant: 'error' });
      } finally {
        setSaving(false);
      }
    },
    [closeSheet, projects, reload, t, toastRef],
  );

  const switchActiveProject = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await switchProject(id);
      } catch (err) {
        const message = err instanceof Error ? err.message : t('projects.error.switchFailed');
        setError(message);
        toastRef.current({ description: message, variant: 'error' });
      }
    },
    [switchProject, t, toastRef],
  );

  const editingProject = useMemo(() => {
    if (activeSheet?.type !== 'edit') return null;
    return projects.find((project) => project.id === activeSheet.projectId) ?? null;
  }, [activeSheet, projects]);

  const deletingProject = useMemo(() => {
    if (activeSheet?.type === 'confirm-delete') {
      return projects.find((project) => project.id === activeSheet.projectId) ?? null;
    }
    return null;
  }, [activeSheet, projects]);

  const emptyLabel = useMemo(() => {
    if (query.trim() || statusFilter !== 'all') return t('projects.empty.filtered');
    return t('projects.empty.default');
  }, [query, statusFilter, t]);

  return {
    projects: filteredProjects,
    total,
    activeProjectId,
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
    error: error ?? providerError,
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
  };
}
