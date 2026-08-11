import type {
  SearchHistoryTimeRange,
  SettingsSection,
  TrainingSubTab,
} from '@/features/search-config/types/search-config.types';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type SearchConfigDetailRoute =
  | '/(app)/search-config/training-overview'
  | '/(app)/search-config/training-active-config'
  | '/(app)/search-config/search-history'
  | `/(app)/search-config/search-history/${string}`
  | '/(app)/search-config/settings-overview'
  | '/(app)/search-config/model-settings'
  | '/(app)/search-config/allowed-domains'
  | '/(app)/search-config/citation-formatting'
  | '/(app)/search-config/search-box-configuration'
  | '/(app)/search-config/search-box-customization'
  | '/(app)/search-config/predefined-questions'
  | '/(app)/search-config/integrations-scripts'
  | '/(app)/search-config/search-test';

export type SettingsSectionMeta = {
  title: string;
  navTitle?: string;
  subtitle: string;
  route?: SearchConfigDetailRoute;
};

export function getSearchConfigNav(t: TranslateFn) {
  const TRAINING_SUB_TABS: { key: TrainingSubTab; label: string; route: SearchConfigDetailRoute }[] = [
    { key: 'overview', label: t('search.training.overview'), route: '/(app)/search-config/training-overview' },
    {
      key: 'active-config',
      label: t('search.training.activeConfig'),
      route: '/(app)/search-config/training-active-config',
    },
    { key: 'history', label: t('search.training.searchHistory'), route: '/(app)/search-config/search-history' },
  ];

  const SETTINGS_SECTION_META: Record<SettingsSection, SettingsSectionMeta> = {
    overview: {
      title: t('search.settings.overview'),
      subtitle: t('search.settings.preview.description'),
      route: '/(app)/search-config/settings-overview',
    },
    model: {
      title: t('search.settings.models'),
      subtitle: t('search.models.description'),
      route: '/(app)/search-config/model-settings',
    },
    domains: {
      title: t('search.settings.domains'),
      subtitle: t('search.domains.description'),
      route: '/(app)/search-config/allowed-domains',
    },
    citation: {
      title: t('search.settings.citations'),
      navTitle: t('search.settings.citationsShort'),
      subtitle: t('search.citations.description'),
      route: '/(app)/search-config/citation-formatting',
    },
    'search-box': {
      title: t('search.config.title'),
      navTitle: t('search.settings.configuration'),
      subtitle: t('search.config.description'),
      route: '/(app)/search-config/search-box-configuration',
    },
    'search-customization': {
      title: t('search.customisation.title'),
      navTitle: t('search.settings.customisation'),
      subtitle: t('search.customisation.description'),
      route: '/(app)/search-config/search-box-customization',
    },
    predefined: {
      title: t('search.questions.title'),
      navTitle: t('search.settings.questions'),
      subtitle: t('search.questions.description'),
      route: '/(app)/search-config/predefined-questions',
    },
    integrations: {
      title: t('search.tabs.integrations'),
      subtitle: t('search.integrations.web.description'),
      route: '/(app)/search-config/integrations-scripts',
    },
    'search-test': {
      title: t('search.tabs.searchTest'),
      subtitle: t('search.description'),
      route: '/(app)/search-config/search-test',
    },
  };

  const SEARCH_HISTORY_TIME_RANGE_OPTIONS: { key: SearchHistoryTimeRange; label: string }[] = [
    { key: 'all', label: t('search.history.filter.allTime') },
    { key: 'today', label: t('search.history.filter.today') },
    { key: '7d', label: t('search.history.filter.last7Days') },
    { key: '30d', label: t('search.history.filter.last30Days') },
    { key: '1y', label: t('search.history.filter.lastYear') },
  ];

  const SETTINGS_NAV_SECTIONS: SettingsSection[] = [
    'overview',
    'model',
    'domains',
    'citation',
    'search-box',
    'search-customization',
    'predefined',
  ];

  const MOBILE_SETTINGS_MENU_SECTIONS: SettingsSection[] = [...SETTINGS_NAV_SECTIONS];

  return {
    TRAINING_SUB_TABS,
    SETTINGS_SECTION_META,
    SEARCH_HISTORY_TIME_RANGE_OPTIONS,
    SETTINGS_NAV_SECTIONS,
    MOBILE_SETTINGS_MENU_SECTIONS,
  };
}

export function settingsMenuDisplayTitle(meta: SettingsSectionMeta): string {
  return meta.navTitle ?? meta.title;
}

export function settingsMenuDisplaySubtitle(meta: SettingsSectionMeta): string {
  return meta.navTitle ? meta.title : meta.subtitle;
}

export function searchHistorySessionRoute(sessionId: string): `/(app)/search-config/search-history/${string}` {
  return `/(app)/search-config/search-history/${sessionId}`;
}
