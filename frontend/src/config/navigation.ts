import type { Href } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';

import type { HeaderMetaKeys } from '@/i18n/resolve-header-meta';
import {
  Bot,
  ChartColumn,
  Fingerprint,
  FolderKanban,
  Gauge,
  GitCompare,
  History,
  KeyRound,
  MessageSquare,
  ScrollText,
  Search,
  ShieldCheck,
  Users,
} from 'lucide-react-native';

export type AppRouteName =
  | 'index'
  | 'projects'
  | 'crawl-management'
  | 'documents'
  | 'chatbot-config'
  | 'search-config'
  | 'compare-models'
  | 'analytics'
  | 'history'
  | 'configuration'
  | 'feedback-moderation'
  | 'system-health'
  | 'audit-logs'
  | 'organization'
  | 'organization-settings'
  | 'organization-users'
  | 'organization-projects'
  | 'organization-sso'
  | 'notifications'
  | 'profile'
  | 'settings'
  | 'onboarding'
  | 'sign-out';

/** Primary mobile bottom tabs; web hides tab bar (drawer + header only). */
export const APP_BOTTOM_TAB_ROUTES = [
  'index',
  'crawl-management',
  'chatbot-config',
  'search-config',
  'settings',
] as const satisfies readonly AppRouteName[];

export type AppBottomTabRoute = (typeof APP_BOTTOM_TAB_ROUTES)[number];

const TAB_ROUTE_SET = new Set<string>(APP_BOTTOM_TAB_ROUTES);

export const APP_ROUTE_TITLE_KEYS: Record<AppRouteName, string> = {
  index: 'nav.overview',
  projects: 'projects.title',
  'crawl-management': 'nav.crawl',
  documents: 'nav.documents',
  'chatbot-config': 'nav.chatbot-configuration',
  'search-config': 'nav.search-configuration',
  'compare-models': 'nav.compare-models',
  analytics: 'nav.overview',
  history: 'nav.history',
  configuration: 'nav.configuration',
  'feedback-moderation': 'nav.feedback',
  'system-health': 'settings.system-health',
  'audit-logs': 'settings.audit-logs',
  organization: 'org.title',
  'organization-settings': 'org.overview.title',
  'organization-users': 'org.members.title',
  'organization-projects': 'projects.title',
  'organization-sso': 'org.sso.title',
  notifications: 'notifications.title',
  profile: 'profile.title',
  settings: 'settings.title',
  onboarding: 'onboarding.header.title',
  'sign-out': 'userMenu.signOut',
};

/** @deprecated Use APP_ROUTE_TITLE_KEYS with useTranslation().t() */
export const APP_ROUTE_TITLES: Record<string, string> = APP_ROUTE_TITLE_KEYS;

export function hrefForAppRoute(route: AppRouteName): Href {
  if (route === 'onboarding') return '/(app)/onboarding';
  if (route === 'sign-out') return '/(app)/sign-out';
  if (TAB_ROUTE_SET.has(route)) {
    if (route === 'index') return '/(app)/(tabs)';
    return `/(app)/(tabs)/${route}` as Href;
  }
  return `/(app)/${route}` as Href;
}

/** Resolves drawer highlight + header title from expo-router segments. */
export function activeRouteFromSegments(segments: string[]): AppRouteName {
  const tabsIdx = segments.indexOf('(tabs)');
  if (tabsIdx !== -1) {
    const next = segments[tabsIdx + 1];
    if (!next || next === 'index') return 'index';
    if (isAppRouteName(next)) return next;
  }
  const candidates = [...segments].reverse();
  for (const seg of candidates) {
    if (seg.startsWith('(')) continue;
    if (isAppRouteName(seg)) return seg;
  }
  return 'index';
}

function isAppRouteName(value: string): value is AppRouteName {
  return (
    value === 'index' ||
    value === 'projects' ||
    value === 'crawl-management' ||
    value === 'documents' ||
    value === 'chatbot-config' ||
    value === 'search-config' ||
    value === 'compare-models' ||
    value === 'analytics' ||
    value === 'history' ||
    value === 'configuration' ||
    value === 'feedback-moderation' ||
    value === 'system-health' ||
    value === 'audit-logs' ||
    value === 'organization' ||
    value === 'organization-settings' ||
    value === 'organization-users' ||
    value === 'organization-projects' ||
    value === 'organization-sso' ||
    value === 'notifications' ||
    value === 'profile' ||
    value === 'settings' ||
    value === 'onboarding' ||
    value === 'sign-out'
  );
}

export function titleKeyForAppRoute(route: AppRouteName): string {
  return APP_ROUTE_TITLE_KEYS[route] ?? 'nav.overview';
}

export function titleForAppRoute(route: AppRouteName): string {
  return APP_ROUTE_TITLE_KEYS[route] ?? 'nav.overview';
}

/** Drawer `settings/*` detail screens — title + subtitle keys for chrome header. */
const SETTINGS_DETAIL_HEADER: Record<string, HeaderMetaKeys> = {
  'global-setup': { titleKey: 'settings.branding.title', subtitleKey: 'settings.branding.previewDescription' },
  'data-retentions': { titleKey: 'settings.retention.title', subtitleKey: 'settings.retention.period.hint' },
  'language-region': { titleKey: 'settings.i18n.title', subtitleKey: 'settings.i18n.description' },
  help: { titleKey: 'help.title', subtitleKey: 'help.description' },
  'about-us': { titleKey: 'app.about.title', subtitleKey: 'app.about.subtitle' },
  licenses: { titleKey: 'app.licenses.title', subtitleKey: 'app.licenses.subtitle' },
  'terms-of-service': { titleKey: 'app.terms.title', subtitleKey: 'app.terms.subtitle' },
};

export function getSettingsHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const settingsIdx = segments.indexOf('settings');
  if (settingsIdx === -1) return null;
  const leaf = segments[settingsIdx + 1];
  if (!leaf || leaf.startsWith('(')) return null;
  return SETTINGS_DETAIL_HEADER[leaf] ?? null;
}

/** Drawer `search-config/*` detail screens — title + subtitle keys for chrome header. */
const SEARCH_CONFIG_DETAIL_HEADER: Record<string, HeaderMetaKeys> = {
  'settings-overview': { titleKey: 'search.settings.overview', subtitleKey: 'search.settings.preview.description' },
  'training-overview': { titleKey: 'search.training.overview', subtitleKey: 'search.training.preview.description' },
  'training-active-config': {
    titleKey: 'search.training.activeConfig',
    subtitleKey: 'search.training.activeStatus.description',
  },
  'search-history': { titleKey: 'search.training.searchHistory', subtitleKey: 'history.subtitle' },
  'model-settings': { titleKey: 'search.settings.models', subtitleKey: 'search.settings.preview.description' },
  'allowed-domains': { titleKey: 'search.settings.domains', subtitleKey: 'search.settings.preview.description' },
  'citation-formatting': { titleKey: 'search.settings.citations', subtitleKey: 'search.settings.preview.description' },
  'search-box-configuration': {
    titleKey: 'search.settings.configuration',
    subtitleKey: 'search.config.description',
  },
  'search-box-customization': {
    titleKey: 'search.settings.customisation',
    subtitleKey: 'search.config.description',
  },
  'predefined-questions': { titleKey: 'search.settings.questions', subtitleKey: 'search.settings.preview.description' },
  'integrations-scripts': { titleKey: 'search.tabs.integrations', subtitleKey: 'chatbot.integrations.web.description' },
  'search-test': { titleKey: 'search.tabs.searchTest', subtitleKey: 'search.settings.preview.description' },
};

export function getSearchConfigHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const searchIdx = segments.indexOf('search-config');
  if (searchIdx === -1) return null;
  const leaf = segments[searchIdx + 1];
  if (!leaf || leaf.startsWith('(')) return null;
  if (leaf === 'search-history') {
    const sessionId = segments[searchIdx + 2];
    if (sessionId && !sessionId.startsWith('(')) {
      return {
        titleKey: 'search.training.searchHistory',
        subtitleKey: 'history.detail.subtitle',
      };
    }
  }
  return SEARCH_CONFIG_DETAIL_HEADER[leaf] ?? null;
}

export const SEARCH_HISTORY_LIST_HREF = '/(app)/search-config/search-history' as Href;

export function isSearchHistoryDetailRoute(segments: string[]): boolean {
  const searchIdx = segments.indexOf('search-config');
  if (searchIdx === -1) return false;
  if (segments[searchIdx + 1] !== 'search-history') return false;
  const sessionId = segments[searchIdx + 2];
  return Boolean(sessionId && !sessionId.startsWith('('));
}

/** Drawer `chatbot-config/*` detail screens — title + subtitle keys for chrome header. */
const CHATBOT_CONFIG_DETAIL_HEADER: Record<string, HeaderMetaKeys> = {
  overview: { titleKey: 'chatbot.settings.overview', subtitleKey: 'chatbot.settings.preview.description' },
  'model-settings': { titleKey: 'chatbot.settings.models', subtitleKey: 'chatbot.settings.preview.description' },
  'allowed-domains': { titleKey: 'chatbot.settings.domains', subtitleKey: 'chatbot.settings.preview.description' },
  'chat-widget-configuration': {
    titleKey: 'chatbot.settings.configuration',
    subtitleKey: 'chatbot.settings.preview.description',
  },
  'chat-widget-customization': {
    titleKey: 'chatbot.settings.customisation',
    subtitleKey: 'chatbot.settings.preview.description',
  },
  feedback: { titleKey: 'chatbot.settings.feedback', subtitleKey: 'chatbot.settings.preview.description' },
  integrations: { titleKey: 'chatbot.tabs.integrations', subtitleKey: 'chatbot.integrations.web.description' },
  'integrations-scripts': { titleKey: 'chatbot.tabs.integrations', subtitleKey: 'chatbot.integrations.web.description' },
  'web-integration': { titleKey: 'chatbot.integrations.web.title', subtitleKey: 'chatbot.integrations.web.description' },
  'mobile-integration': {
    titleKey: 'chatbot.integrations.mobile.title',
    subtitleKey: 'chatbot.integrations.mobile.description',
  },
  'training-overview': { titleKey: 'chatbot.training.overview', subtitleKey: 'chatbot.training.preview.description' },
  'training-active-config': {
    titleKey: 'chatbot.training.activeConfig',
    subtitleKey: 'chatbot.training.preview.description',
  },
  'chat-history': { titleKey: 'chatbot.training.chatHistory', subtitleKey: 'history.subtitle' },
};

export const AUDIT_LOGS_LIST_HREF = '/(app)/audit-logs' as Href;

/** Mobile stack detail under audit-logs (e.g. /audit-logs/:eventId). */
export function isAuditLogsDetailRoute(segments: string[]): boolean {
  const idx = segments.indexOf('audit-logs');
  if (idx === -1) return false;
  const leaf = segments[idx + 1];
  return Boolean(leaf && !leaf.startsWith('('));
}

export const CHAT_HISTORY_LIST_HREF = '/(app)/history' as Href;

export function isChatHistoryDetailRoute(segments: string[]): boolean {
  const idx = segments.indexOf('history');
  if (idx === -1) return false;
  const leaf = segments[idx + 1];
  return Boolean(leaf && !leaf.startsWith('('));
}

export function getChatHistoryHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('history');
  if (idx === -1) return null;
  const leaf = segments[idx + 1];
  if (leaf && !leaf.startsWith('(')) {
    return {
      titleKey: 'history.detail.title',
      subtitleKey: 'history.detail.subtitle',
    };
  }
  return {
    titleKey: 'history.title',
    subtitleKey: 'history.subtitle',
  };
}

export function getAnalyticsHeaderMeta(active: AppRouteName): HeaderMetaKeys | null {
  if (active !== 'index' && active !== 'analytics') return null;
  return {
    titleKey: 'nav.overview',
    subtitleKey: 'overview.description',
  };
}

export const FEEDBACK_MODERATION_LIST_HREF = '/(app)/feedback-moderation' as Href;

export function isFeedbackModerationDetailRoute(segments: string[]): boolean {
  const idx = segments.indexOf('feedback-moderation');
  if (idx === -1) return false;
  const leaf = segments[idx + 1];
  return Boolean(leaf && !leaf.startsWith('('));
}

export function getCompareModelsHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('compare-models');
  if (idx === -1) return null;
  return {
    titleKey: 'nav.compare-models',
    subtitleKey: 'compareModels.description',
  };
}

export function getConfigurationHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('configuration');
  if (idx === -1) return null;
  return {
    titleKey: 'configuration.title',
    subtitleKey: 'configuration.description',
  };
}

export function getProjectsHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('projects');
  if (idx === -1) return null;
  return {
    titleKey: 'projects.title',
    subtitleKey: 'projects.subtitle',
    subtitleParams: { count: 0 },
  };
}

export function getFeedbackModerationHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('feedback-moderation');
  if (idx === -1) return null;
  const leaf = segments[idx + 1];
  if (leaf && !leaf.startsWith('(')) {
    return {
      titleKey: 'feedback.detail.title',
      subtitleKey: 'feedback.detail.subtitle',
    };
  }
  return {
    titleKey: 'feedback.title',
    subtitleKey: 'feedback.description',
  };
}

export function getAuditLogsHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.indexOf('audit-logs');
  if (idx === -1) return null;
  const leaf = segments[idx + 1];
  if (leaf && !leaf.startsWith('(')) {
    return {
      titleKey: 'audit.detail.title',
      subtitleKey: 'audit.detail.title',
    };
  }
  return {
    titleKey: 'audit.title',
    subtitleKey: 'audit.description',
  };
}

export function getOrganizationHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const idx = segments.findIndex((segment) =>
    segment === 'organization' ||
    segment === 'organization-settings' ||
    segment === 'organization-users' ||
    segment === 'organization-projects' ||
    segment === 'organization-sso',
  );
  if (idx === -1) return null;

  const leaf = segments[idx];
  if (leaf === 'organization' || leaf === 'organization-settings') {
    return {
      titleKey: 'org.members.title',
      subtitleKey: 'org.members.subtitle',
      subtitleParams: { count: 0 },
    };
  }
  if (leaf === 'organization-users') {
    return {
      titleKey: 'org.members.title',
      subtitleKey: 'org.members.subtitle',
      subtitleParams: { count: 0 },
    };
  }
  if (leaf === 'organization-projects') {
    return {
      titleKey: 'projects.title',
      subtitleKey: 'org.subtitle',
    };
  }
  if (leaf === 'organization-sso') {
    return {
      titleKey: 'org.sso.title',
      subtitleKey: 'org.sso.subtitle',
    };
  }

  return {
    titleKey: 'org.title',
    subtitleKey: 'org.subtitle',
  };
}

export function getChatbotConfigHeaderMeta(segments: string[]): HeaderMetaKeys | null {
  const chatbotIdx = segments.indexOf('chatbot-config');
  if (chatbotIdx === -1) return null;
  const leaf = segments[chatbotIdx + 1];
  if (!leaf || leaf.startsWith('(')) return null;
  if (leaf === 'chat-history') {
    const sessionLeaf = segments[chatbotIdx + 2];
    if (sessionLeaf && !sessionLeaf.startsWith('(')) {
      return { titleKey: 'chatbot.training.chatHistory', subtitleKey: 'history.detail.subtitle' };
    }
    return CHATBOT_CONFIG_DETAIL_HEADER['chat-history'] ?? null;
  }
  return CHATBOT_CONFIG_DETAIL_HEADER[leaf] ?? null;
}

export type DrawerNavItem = {
  route: AppRouteName;
  labelKey: string;
  icon: LucideIcon;
  /** CE: show Lock badge; EE unlocked when entitlements/UI attached. */
  enterpriseLocked?: boolean;
};

export type DrawerNavSection = {
  titleKey: string;
  items: DrawerNavItem[];
};

/** Drawer items — Documents is not listed (route remains for deep links only). */
export const drawerNavSections: DrawerNavSection[] = [
  {
    titleKey: 'nav.group.application',
    items: [
      { route: 'index', labelKey: 'nav.analytics', icon: ChartColumn },
      { route: 'crawl-management', labelKey: 'nav.crawl', icon: Gauge },
      { route: 'chatbot-config', labelKey: 'nav.chatbot-configuration', icon: Bot },
      { route: 'search-config', labelKey: 'nav.search-configuration', icon: Search },
      { route: 'compare-models', labelKey: 'nav.compare-models', icon: GitCompare },
      { route: 'history', labelKey: 'nav.history', icon: History },
      { route: 'configuration', labelKey: 'nav.configuration', icon: KeyRound },
      { route: 'feedback-moderation', labelKey: 'nav.feedback', icon: MessageSquare },
    ],
  },
  {
    titleKey: 'nav.group.management',
    items: [
      { route: 'organization-users', labelKey: 'org.members.title', icon: Users },
      { route: 'projects', labelKey: 'projects.title', icon: FolderKanban },
      { route: 'organization-sso', labelKey: 'org.sso.title', icon: Fingerprint },
      { route: 'system-health', labelKey: 'settings.system-health', icon: ShieldCheck },
      { route: 'audit-logs', labelKey: 'settings.audit-logs', icon: ScrollText },
    ],
  },
];

/** Tab-bar routes hidden from the mobile drawer — reachable via bottom navigation. */
const MOBILE_DRAWER_HIDDEN_ROUTES: ReadonlySet<AppRouteName> = new Set([
  'index',
  'crawl-management',
  'chatbot-config',
  'search-config',
]);

/**
 * EE admin surfaces — Team Members / SSO / org settings.
 * Projects stay CE-visible (unlimited projects on Community).
 */
const ORG_ADMIN_ONLY_ROUTES: ReadonlySet<AppRouteName> = new Set([
  'organization',
  'organization-settings',
  'organization-users',
  'organization-projects',
  'organization-sso',
]);

/** Nav items that show a Lock badge in CE (stubs) and unlock when EE UI is attached. */
const ENTERPRISE_TEASER_ROUTES: ReadonlySet<AppRouteName> = new Set([
  'index',
  'analytics',
  'compare-models',
  'organization-users',
  'organization-sso',
  'organization',
  'organization-settings',
  'organization-projects',
]);

export function getDrawerNavSections(
  isWeb: boolean,
  options?: {
    isOrgAdmin?: boolean;
    /** False when CE stubs are active (locked teasers). */
    enterpriseModulesAvailable?: boolean;
    canAccessRoute?: (route: AppRouteName) => boolean;
  },
): DrawerNavSection[] {
  const isOrgAdmin = options?.isOrgAdmin ?? false;
  const enterpriseModulesAvailable = options?.enterpriseModulesAvailable ?? false;
  const canAccessRoute = options?.canAccessRoute;

  let sections = drawerNavSections.map((section) => ({
    ...section,
    items: section.items
      .filter((item) => {
        if (ORG_ADMIN_ONLY_ROUTES.has(item.route)) {
          if (isOrgAdmin) return true;
          // CE: keep Team Members / SSO visible as locked teasers.
          if (!enterpriseModulesAvailable) return true;
          // EE attached but not org-admin: hide admin surfaces.
          return false;
        }
        if (!isWeb && MOBILE_DRAWER_HIDDEN_ROUTES.has(item.route)) return false;
        if (canAccessRoute && !isOrgAdmin && !canAccessRoute(item.route)) return false;
        return true;
      })
      .map((item) => ({
        ...item,
        enterpriseLocked:
          ENTERPRISE_TEASER_ROUTES.has(item.route) && !enterpriseModulesAvailable,
      })),
  }));

  return sections.filter((section) => section.items.length > 0);
}
