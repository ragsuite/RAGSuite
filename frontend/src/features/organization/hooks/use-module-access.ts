import { useMemo } from 'react';

import { useActiveProject } from '@/features/projects/providers/active-project-provider';

export function useModuleAccess(moduleId: string): {
  enabled: boolean;
  canRead: boolean;
  canWrite: boolean;
} {
  const { hasPermission } = useActiveProject();
  return useMemo(() => {
    const canRead = hasPermission(`${moduleId}:read`);
    const canWrite = hasPermission(`${moduleId}:write`);
    return { enabled: canRead, canRead, canWrite };
  }, [hasPermission, moduleId]);
}
