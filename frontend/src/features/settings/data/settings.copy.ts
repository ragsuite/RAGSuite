import { BRANDING_THEME_PRESETS } from '@/shared/constants/branding-defaults';

export const SETTINGS_COPY = {
  title: 'Settings',
  description: 'Manage your organization settings and preferences',
  tabs: {
    global: 'Global Settings',
    retention: 'Data Retention',
    i18n: 'Internationalization',
  },
  branding: {
    title: 'Theme Option',
    logoUpload: 'Logo Upload',
    logoRemove: 'Remove',
    logoHint: 'Recommended: 64x64px PNG or SVG',
    orgName: 'Organization Name',
    backgroundTheme: 'Background Theme',
    backgroundGeometric: 'Geometric',
    backgroundSimple: 'Default',
    primaryColor: 'Primary Color',
    themePresets: 'Theme Presets',
    livePreview: 'Live Preview',
    primaryButton: 'Primary Button',
    previewDescription:
      'This is how your branding will appear in the admin interface and embeddable widget.',
  },
  retention: {
    title: 'Data Retention Policy',
    periodLabel: 'Retention Period (Days)',
    periodHint: 'Number of days to retain user queries, responses, and feedback data',
    rule1: (days: number) => `Query logs and responses will be automatically deleted after ${days} days`,
    rule2: 'User feedback and analytics data will be retained for the same period',
    rule3: 'Crawled documents and embeddings are not affected by this policy',
    rule4: 'System logs and audit trails follow separate retention rules',
  },
  i18n: {
    title: 'Internationalization',
    defaultLanguage: 'Default Language',
    selectPlaceholder: 'Select language',
  },
  actions: { reset: 'Reset', saveChanges: 'Save Changes', saving: 'Saving...' },
  presets: [...BRANDING_THEME_PRESETS] as const,
} as const;
