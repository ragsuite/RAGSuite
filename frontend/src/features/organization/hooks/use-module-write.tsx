import React, { createContext, useContext } from 'react';

const ModuleWriteContext = createContext(true);

/** Screens wrap write controls so Save / Add / Delete disable when the member only has Read. */
export function ModuleWriteProvider({
  canWrite,
  children,
}: {
  canWrite: boolean;
  children: React.ReactNode;
}) {
  return <ModuleWriteContext.Provider value={canWrite}>{children}</ModuleWriteContext.Provider>;
}

export function useModuleWriteEnabled(): boolean {
  return useContext(ModuleWriteContext);
}

/** True when the control should ignore input (explicit disabled or module Read). */
export function useFieldWriteLock(
  disabled?: boolean,
  options?: { ignoreModuleLock?: boolean },
): boolean {
  if (options?.ignoreModuleLock) return Boolean(disabled);
  return Boolean(disabled) || !useModuleWriteEnabled();
}
