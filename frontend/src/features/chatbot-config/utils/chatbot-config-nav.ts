import type { SettingsSection, TrainingSubTab } from '@/features/chatbot-config/types/chatbot-config.types';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type ChatbotConfigDetailRoute =
  | '/(app)/chatbot-config/overview'
  | '/(app)/chatbot-config/model-settings'
  | '/(app)/chatbot-config/allowed-domains'
  | '/(app)/chatbot-config/chat-widget-configuration'
  | '/(app)/chatbot-config/chat-widget-customization'
  | '/(app)/chatbot-config/feedback'
  | '/(app)/chatbot-config/privacy'
  | '/(app)/chatbot-config/integrations'
  | '/(app)/chatbot-config/training-overview'
  | '/(app)/chatbot-config/training-active-config'
  | '/(app)/chatbot-config/chat-history';

export type TrainingDetailRoute =
  | '/(app)/chatbot-config/training-overview'
  | '/(app)/chatbot-config/training-active-config'
  | '/(app)/chatbot-config/chat-history';

export function getChatbotConfigNav(t: TranslateFn) {
  const TRAINING_SUB_TABS: { key: TrainingSubTab; label: string; route?: TrainingDetailRoute }[] = [
    { key: 'overview', label: t('chatbot.training.overview'), route: '/(app)/chatbot-config/training-overview' },
    {
      key: 'active-config',
      label: t('chatbot.training.activeConfig'),
      route: '/(app)/chatbot-config/training-active-config',
    },
    { key: 'history', label: t('chatbot.training.chatHistory'), route: '/(app)/chatbot-config/chat-history' },
  ];

  const SETTINGS_SECTION_META: Record<
    SettingsSection,
    { title: string; subtitle: string; route?: ChatbotConfigDetailRoute }
  > = {
    overview: {
      title: t('chatbot.settings.overview'),
      subtitle: t('chatbot.settings.preview.description'),
      route: '/(app)/chatbot-config/overview',
    },
    model: {
      title: t('chatbot.settings.models'),
      subtitle: t('chatbot.models.description'),
      route: '/(app)/chatbot-config/model-settings',
    },
    'widget-config': {
      title: t('chatbot.settings.configuration'),
      subtitle: t('chatbot.config.description'),
      route: '/(app)/chatbot-config/chat-widget-configuration',
    },
    'widget-customization': {
      title: t('chatbot.settings.customisation'),
      subtitle: t('chatbot.widget.settings.title'),
      route: '/(app)/chatbot-config/chat-widget-customization',
    },
    domains: {
      title: t('chatbot.settings.domains'),
      subtitle: t('chatbot.domains.description'),
      route: '/(app)/chatbot-config/allowed-domains',
    },
    feedback: {
      title: t('chatbot.settings.feedback'),
      subtitle: t('chatbot.config.feedbackEnabled.description'),
      route: '/(app)/chatbot-config/feedback',
    },
    privacy: {
      title: t('chatbot.settings.privacy'),
      subtitle: t('chatbot.config.privacy.subtitle'),
      route: '/(app)/chatbot-config/privacy',
    },
    integrations: {
      title: t('chatbot.tabs.integrations'),
      subtitle: t('chatbot.integrations.web.description'),
      route: '/(app)/chatbot-config/integrations',
    },
    'web-integration': {
      title: t('chatbot.tabs.integrations'),
      subtitle: t('chatbot.integrations.web.description'),
      route: '/(app)/chatbot-config/integrations',
    },
    'mobile-integration': {
      title: t('chatbot.tabs.integrations'),
      subtitle: t('chatbot.integrations.mobile.description'),
      route: '/(app)/chatbot-config/integrations',
    },
  };

  const SETTINGS_NAV_GROUPS: { label: string; sections: SettingsSection[] }[] = [
    {
      label: t('chatbot.settings.title'),
      sections: ['overview', 'model', 'domains', 'widget-config', 'widget-customization', 'privacy', 'feedback'],
    },
  ];

  const SETTINGS_NAV_SECTIONS: SettingsSection[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.sections);

  const MOBILE_SETTINGS_MENU_SECTIONS: SettingsSection[] = [
    'model',
    'domains',
    'widget-config',
    'widget-customization',
    'privacy',
    'feedback',
  ];

  const HISTORY_TIME_RANGE_OPTIONS: {
    key: import('@/features/chatbot-config/types/chatbot-config.types').HistoryTimeRange;
    label: string;
  }[] = [
    { key: 'all', label: t('chatbot.history.filter.allTime') },
    { key: 'today', label: t('chatbot.history.filter.today') },
    { key: '7d', label: t('chatbot.history.filter.last7Days') },
    { key: '30d', label: t('chatbot.history.filter.last30Days') },
    { key: 'year', label: t('chatbot.history.filter.lastYear') },
  ];

  return {
    TRAINING_SUB_TABS,
    SETTINGS_SECTION_META,
    SETTINGS_NAV_GROUPS,
    SETTINGS_NAV_SECTIONS,
    MOBILE_SETTINGS_MENU_SECTIONS,
    HISTORY_TIME_RANGE_OPTIONS,
  };
}

export function chatHistorySessionRoute(sessionId: string): `/(app)/chatbot-config/chat-history/${string}` {
  return `/(app)/chatbot-config/chat-history/${sessionId}`;
}
