export type ThemeMode = 'light' | 'dark' | 'system';

export type GlobalSettings = {
  theme: ThemeMode;
  primaryColor: string;
  fontScale: number;
  backgroundTheme: 'geometric' | 'simple';
};

export type WorkspaceBranding = {
  orgName: string;
  logoDataUrl: string | null;
};

export type DataRetention = {
  autoDelete: boolean;
  retentionDays: number;
};

export type Internationalization = {
  language: string;
  region: string;
  timezone: string;
};

export type HelpSettings = {
  docsUrl: string;
  supportEmail: string;
};

export type SettingsModel = {
  global: GlobalSettings;
  branding: WorkspaceBranding;
  retention: DataRetention;
  intl: Internationalization;
  help: HelpSettings;
};

export type SettingsFeedback = {
  type: 'success' | 'error';
  message: string;
} | null;

export type ThemeOption = {
  value: ThemeMode;
  label: string;
  description: string;
};

export type SelectOption = {
  value: string;
  label: string;
};
