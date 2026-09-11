import type { SettingsSection, TrainingSubTab } from '@/features/chatbot-config/types/chatbot-config.types';

export type TranslateFn = (key: string, params?: Record<string, string | number>) => string;

export type ChatbotConfigDetailRoute =
  | '/(app)/chatbot-config/overview'
  | '/(app)/chatbot-config/model-settings'
  | '/(app)/chatbot-config/allowed-domains'
  | '/(app)/chatbot-config/chat-widget-configuration'
  | '/(app)/chatbot-config/chat-widget-customization'
  | '/(app)/chatbot-config/faq'
  | '/(app)/chatbot-config/feedback'
  | '/(app)/chatbot-config/privacy'
  | '/(app)/chatbot-config/privacy-policy'
  | '/(app)/chatbot-config/integrations'
  | '/(app)/chatbot-config/training-overview'
  | '/(app)/chatbot-config/training-active-config';

export type TrainingDetailRoute =
  | '/(app)/chatbot-config/training-overview'
  | '/(app)/chatbot-config/training-active-config';

export function getChatbotConfigNav(t: TranslateFn) {
  const TRAINING_SUB_TABS: { key: TrainingSubTab; label: string; route?: TrainingDetailRoute }[] = [
    { key: 'overview', label: t('chatbot.training.overview'), route: '/(app)/chatbot-config/training-overview' },
    {
      key: 'active-config',
      label: t('chatbot.training.activeConfig'),
      route: '/(app)/chatbot-config/training-active-config',
    },
  ];

  const SETTINGS_SECTION_META: Record<
    SettingsSection,
    { title: string; subtitle: string; navTitle?: string; route?: ChatbotConfigDetailRoute }
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
    faq: {
      title: t('chatbot.settings.faq'),
      subtitle: t('chatbot.faq.description'),
      route: '/(app)/chatbot-config/faq',
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
      navTitle: t('chatbot.settings.privacy.nav'),
      subtitle: t('chatbot.config.privacy.subtitle'),
      route: '/(app)/chatbot-config/privacy',
    },
    'privacy-policy': {
      title: t('chatbot.settings.privacyPolicy'),
      subtitle: t('chatbot.privacyNotice.description'),
      route: '/(app)/chatbot-config/privacy-policy',
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
      sections: ['overview', 'model', 'domains', 'widget-config', 'widget-customization', 'faq', 'privacy', 'feedback', 'privacy-policy'],
    },
  ];

  const SETTINGS_NAV_SECTIONS: SettingsSection[] = SETTINGS_NAV_GROUPS.flatMap((g) => g.sections);

  const MOBILE_SETTINGS_MENU_SECTIONS: SettingsSection[] = [
    'model',
    'domains',
    'widget-config',
    'widget-customization',
    'faq',
    'privacy',
    'feedback',
    'privacy-policy',
  ];

  return {
    TRAINING_SUB_TABS,
    SETTINGS_SECTION_META,
    SETTINGS_NAV_GROUPS,
    SETTINGS_NAV_SECTIONS,
    MOBILE_SETTINGS_MENU_SECTIONS,
  };
}

export function settingsMenuDisplayTitle(meta: { title: string; navTitle?: string }): string {
  return meta.navTitle ?? meta.title;
}

export function settingsMenuDisplaySubtitle(meta: { title: string; subtitle: string; navTitle?: string }): string {
  return meta.navTitle ? meta.title : meta.subtitle;
}
