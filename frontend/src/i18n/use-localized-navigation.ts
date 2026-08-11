import { useMemo } from 'react';

import {
  getDrawerNavSections,
  type DrawerNavItem,
  type DrawerNavSection,
} from '@/config/navigation';
import { useTranslation } from '@/i18n/use-translation';

export type LocalizedDrawerNavItem = Omit<DrawerNavItem, 'labelKey'> & { label: string };

export type LocalizedDrawerNavSection = Omit<DrawerNavSection, 'titleKey' | 'items'> & {
  title: string;
  items: LocalizedDrawerNavItem[];
};

export function useLocalizedDrawerNav(
  isWeb: boolean,
  options?: {
    isOrgAdmin?: boolean;
    enterpriseModulesAvailable?: boolean;
    canAccessRoute?: (route: string) => boolean;
  },
): LocalizedDrawerNavSection[] {
  const { t } = useTranslation();
  const isOrgAdmin = options?.isOrgAdmin ?? false;
  const enterpriseModulesAvailable = options?.enterpriseModulesAvailable ?? false;
  const canAccessRoute = options?.canAccessRoute;

  return useMemo(
    () =>
      getDrawerNavSections(isWeb, {
        isOrgAdmin,
        enterpriseModulesAvailable,
        canAccessRoute: canAccessRoute as
          | ((route: import('@/config/navigation').AppRouteName) => boolean)
          | undefined,
      }).map((section) => ({
        title: t(section.titleKey),
        items: section.items.map((item) => ({
          route: item.route,
          icon: item.icon,
          label: t(item.labelKey),
          enterpriseLocked: item.enterpriseLocked,
        })),
      })),
    [canAccessRoute, enterpriseModulesAvailable, isOrgAdmin, isWeb, t],
  );
}
