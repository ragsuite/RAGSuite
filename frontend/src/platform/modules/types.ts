/** Community Module contribution types (Phase 3 — ADR-002). */
export type ModuleEdition = 'community' | 'enterprise' | 'platform';
export type ModuleStatus = 'migrated' | 'partial' | 'legacy';

export type ModuleNavItem = {
  route: string;
  labelKey: string;
  section?: 'application' | 'management';
};

export type ModuleContribution = {
  id: string;
  version: string;
  edition: ModuleEdition;
  status: ModuleStatus;
  navigation?: ModuleNavItem[];
  permissions?: string[];
  settingsPanels?: string[];
};
