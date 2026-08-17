import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { useAuthenticatedBootstrap } from '@/features/auth/hooks/use-authenticated-bootstrap';
import { useSession } from '@/features/auth/providers/session-provider';
import {
  permissionGranted,
  routeVisible,
  usesWorkspacePermissionScope,
} from '@/features/organization/utils/workspace-permissions';
import { activateProject, fetchProjects } from '@/features/projects/services/projects.service';
import type { Project } from '@/features/projects/types/projects.types';
import { resolveAppErrorMessage, useTranslation } from '@/i18n';

type ActiveProjectContextValue = {
  projects: Project[];
  activeProject: Project | null;
  activeProjectId: string | null;
  activePermissions: string[];
  workspacePermissions: string[];
  canCreateProject: boolean;
  total: number;
  loading: boolean;
  refreshing: boolean;
  error: string | null;
  hasPermission: (permission: string) => boolean;
  canAccessRoute: (route: string) => boolean;
  reload: () => Promise<void>;
  refresh: () => Promise<void>;
  switchProject: (id: string) => Promise<void>;
};

const ActiveProjectContext = createContext<ActiveProjectContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

export function ActiveProjectProvider({ children }: Props) {
  const { t } = useTranslation();
  const { session } = useSession();
  const { isReady } = useAuthenticatedBootstrap();
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activePermissions, setActivePermissions] = useState<string[]>([]);
  const [workspacePermissions, setWorkspacePermissions] = useState<string[]>([]);
  const [canCreateProject, setCanCreateProject] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isOrgAdmin = Boolean(session?.user.isAdmin);

  const applyListResponse = useCallback((response: Awaited<ReturnType<typeof fetchProjects>>) => {
    setProjects(response.projects);
    setTotal(response.total);
    setActiveProjectId(response.activeProjectId);
    setActivePermissions(response.activePermissions);
    setWorkspacePermissions(response.workspacePermissions);
    setCanCreateProject(response.canCreateProject || isOrgAdmin);
  }, [isOrgAdmin]);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetchProjects();
      applyListResponse(response);
    } catch (err) {
      setError(resolveAppErrorMessage(err, t, 'projects.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [applyListResponse, t]);

  const refresh = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const response = await fetchProjects();
      applyListResponse(response);
    } catch (err) {
      setError(resolveAppErrorMessage(err, t, 'projects.error.loadFailed'));
    } finally {
      setRefreshing(false);
    }
  }, [applyListResponse, t]);

  const switchProject = useCallback(
    async (id: string) => {
      if (activeProjectId === id) return;
      setError(null);
      try {
        const response = await activateProject(id);
        applyListResponse(response);
      } catch (err) {
        setError(resolveAppErrorMessage(err, t, 'projects.error.switchFailed'));
        await reload();
        throw err;
      }
    },
    [activeProjectId, applyListResponse, reload, t],
  );

  useEffect(() => {
    if (!isReady) {
      return;
    }
    void reload();
  }, [isReady, reload]);

  const activeProject = useMemo(
    () => projects.find((project) => project.id === activeProjectId) ?? projects.find((project) => project.isActive) ?? null,
    [activeProjectId, projects],
  );

  const workspacePermissionSet = useMemo(() => new Set(workspacePermissions), [workspacePermissions]);
  const activePermissionSet = useMemo(() => new Set(activePermissions), [activePermissions]);

  const permissionSetFor = useCallback(
    (scope: 'active' | 'workspace') => (scope === 'workspace' ? workspacePermissionSet : activePermissionSet),
    [activePermissionSet, workspacePermissionSet],
  );

  const hasPermission = useCallback(
    (permission: string) => {
      if (isOrgAdmin) return true;
      const scope = usesWorkspacePermissionScope(permission) ? 'workspace' : 'active';
      return permissionGranted(permissionSetFor(scope), permission as never);
    },
    [isOrgAdmin, permissionSetFor],
  );

  const canAccessRoute = useCallback(
    (route: string) => {
      if (isOrgAdmin) return true;
      const scope = usesWorkspacePermissionScope(route) ? 'workspace' : 'active';
      return routeVisible(route, permissionSetFor(scope), { isOrgAdmin });
    },
    [isOrgAdmin, permissionSetFor],
  );

  const value = useMemo(
    () => ({
      projects,
      activeProject,
      activeProjectId,
      activePermissions,
      workspacePermissions,
      canCreateProject,
      total,
      loading,
      refreshing,
      error,
      hasPermission,
      canAccessRoute,
      reload,
      refresh,
      switchProject,
    }),
    [
      projects,
      activeProject,
      activeProjectId,
      activePermissions,
      workspacePermissions,
      canCreateProject,
      total,
      loading,
      refreshing,
      error,
      hasPermission,
      canAccessRoute,
      reload,
      refresh,
      switchProject,
    ],
  );

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}

export function useActiveProject() {
  const context = useContext(ActiveProjectContext);
  if (!context) {
    throw new Error('useActiveProject must be used inside ActiveProjectProvider');
  }
  return context;
}

/** Minimal project context for public `/embed/chatbot` and `/embed/search` (no auth / project list). */
export function EmbedActiveProjectProvider({
  projectId,
  children,
}: {
  projectId: string;
  children: React.ReactNode;
}) {
  const value = useMemo<ActiveProjectContextValue>(
    () => ({
      projects: [],
      activeProject: null,
      activeProjectId: projectId,
      activePermissions: [],
      workspacePermissions: [],
      canCreateProject: false,
      total: 0,
      loading: false,
      refreshing: false,
      error: null,
      hasPermission: () => true,
      canAccessRoute: () => true,
      reload: async () => undefined,
      refresh: async () => undefined,
      switchProject: async () => undefined,
    }),
    [projectId],
  );

  return <ActiveProjectContext.Provider value={value}>{children}</ActiveProjectContext.Provider>;
}
