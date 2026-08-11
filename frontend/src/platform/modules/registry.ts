import type { ModuleContribution, ModuleNavItem } from './types';

const registry = new Map<string, ModuleContribution>();

export function registerModule(contribution: ModuleContribution): void {
  registry.set(contribution.id, contribution);
}

export function getRegisteredModules(): ModuleContribution[] {
  return Array.from(registry.values());
}

export function getModuleNavItems(): ModuleNavItem[] {
  return getRegisteredModules().flatMap((m) => m.navigation ?? []);
}

export function getModuleById(id: string): ModuleContribution | undefined {
  return registry.get(id);
}
