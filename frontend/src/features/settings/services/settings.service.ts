import { handleGetWorkspaceSettings, handleSaveWorkspaceSettings } from '@/network/actions/settings.actions';
import { storage } from '@/services/storage/storage';

import type { SettingsModel } from '@/features/settings/types/settings.types';
import { isSettingsLocaleCode } from '@/features/settings/data/settings-locale-options';
import { BRANDING_DEFAULTS, BRANDING_THEME_PRESETS } from '@/shared/constants/branding-defaults';

export { LANGUAGE_OPTIONS } from '@/features/settings/data/settings-locale-options';

const SETTINGS_STORAGE_KEY = 'settings.module.v1';
const THEME_STORAGE_KEY = 'ui-theme';
export const UI_THEME_STORAGE_KEY = THEME_STORAGE_KEY;

export type UiThemeMode = 'light' | 'dark';

export const PRIMARY_COLOR_OPTIONS = [...BRANDING_THEME_PRESETS] as const;
export const FONT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2] as const;
export const REGION_OPTIONS = ['US', 'IN', 'DE', 'FR', 'SG'] as const;
export const TIMEZONE_OPTIONS = ['UTC', 'Asia/Kolkata', 'America/New_York', 'Europe/Berlin', 'Europe/Paris'] as const;

export const RETENTION_LIMITS = {
  minDays: 7,
  maxDays: 365,
} as const;

export const DEFAULT_SETTINGS: SettingsModel = {
  global: {
    theme: 'light',
    primaryColor: BRANDING_DEFAULTS.primaryColor,
    fontScale: 1,
    backgroundTheme: 'simple',
  },
  branding: {
    orgName: BRANDING_DEFAULTS.orgName,
    logoDataUrl: BRANDING_DEFAULTS.logoDataUrl,
  },
  retention: {
    autoDelete: true,
    retentionDays: 90,
  },
  intl: {
    language: 'en',
    region: 'US',
    timezone: 'UTC',
  },
  help: {
    docsUrl: 'https://docs.ragsuite.ai',
    supportEmail: 'support@ragsuite.ai',
  },
};

function clampRetention(days: number) {
  return Math.min(RETENTION_LIMITS.maxDays, Math.max(RETENTION_LIMITS.minDays, days));
}

function sanitizeSettings(input: SettingsModel): SettingsModel {
  const theme = input.global.theme;
  const language = isSettingsLocaleCode(input.intl.language) ? input.intl.language : 'en';
  const region = REGION_OPTIONS.includes(input.intl.region as (typeof REGION_OPTIONS)[number]) ? input.intl.region : 'US';
  const timezone = TIMEZONE_OPTIONS.includes(input.intl.timezone as (typeof TIMEZONE_OPTIONS)[number]) ? input.intl.timezone : 'UTC';
  const primaryColor = PRIMARY_COLOR_OPTIONS.includes(input.global.primaryColor as (typeof PRIMARY_COLOR_OPTIONS)[number])
    ? input.global.primaryColor
    : input.global.primaryColor?.startsWith('#')
      ? input.global.primaryColor
      : BRANDING_DEFAULTS.primaryColor;
  const fontScale = FONT_SCALE_OPTIONS.includes(input.global.fontScale as (typeof FONT_SCALE_OPTIONS)[number]) ? input.global.fontScale : 1;

  return {
    global: {
      theme: theme === 'dark' ? 'dark' : 'light',
      primaryColor,
      fontScale,
      backgroundTheme: input.global.backgroundTheme === 'simple' ? 'simple' : 'geometric',
    },
    branding: {
      orgName: input.branding?.orgName?.trim() || DEFAULT_SETTINGS.branding.orgName,
      logoDataUrl: input.branding?.logoDataUrl ?? null,
    },
    retention: {
      autoDelete: Boolean(input.retention.autoDelete),
      retentionDays: clampRetention(Number.isFinite(input.retention.retentionDays) ? input.retention.retentionDays : DEFAULT_SETTINGS.retention.retentionDays),
    },
    intl: {
      language,
      region,
      timezone,
    },
    help: {
      docsUrl: input.help.docsUrl || DEFAULT_SETTINGS.help.docsUrl,
      supportEmail: input.help.supportEmail || DEFAULT_SETTINGS.help.supportEmail,
    },
  };
}

async function readLocalSettings(): Promise<SettingsModel> {
  const raw = await storage.getItem(SETTINGS_STORAGE_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }
  try {
    const parsed = JSON.parse(raw) as SettingsModel;
    return sanitizeSettings({
      ...DEFAULT_SETTINGS,
      ...parsed,
      branding: { ...DEFAULT_SETTINGS.branding, ...parsed.branding },
      global: { ...DEFAULT_SETTINGS.global, ...parsed.global },
      retention: { ...DEFAULT_SETTINGS.retention, ...parsed.retention },
      intl: { ...DEFAULT_SETTINGS.intl, ...parsed.intl },
      help: { ...DEFAULT_SETTINGS.help, ...parsed.help },
    });
  } catch {
    return DEFAULT_SETTINGS;
  }
}

async function writeLocalSettings(next: SettingsModel): Promise<SettingsModel> {
  const sanitized = sanitizeSettings(next);
  await storage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
  return sanitized;
}

async function mergeWorkspaceBranding(local: SettingsModel): Promise<SettingsModel> {
  const remote = await handleGetWorkspaceSettings();
  return sanitizeSettings({
    ...local,
    branding: {
      orgName: remote.org_name?.trim() || BRANDING_DEFAULTS.orgName,
      logoDataUrl: remote.logo_data_url ?? local.branding.logoDataUrl,
    },
    global: {
      ...local.global,
      primaryColor: remote.primary_color || BRANDING_DEFAULTS.primaryColor,
    },
  });
}

export async function readThemePreference(): Promise<UiThemeMode | null> {
  const saved = await storage.getItem(THEME_STORAGE_KEY);
  return saved === 'light' || saved === 'dark' ? saved : null;
}

/** Reference default: light mode persisted in `ui-theme` when unset. */
export async function ensureThemePreference(): Promise<UiThemeMode> {
  const saved = await readThemePreference();
  if (saved) return saved;
  await storage.setItem(THEME_STORAGE_KEY, 'light');
  return 'light';
}

export async function writeThemePreference(theme: UiThemeMode): Promise<void> {
  await storage.setItem(THEME_STORAGE_KEY, theme);
}

export async function resolveUiTheme(storedTheme?: string): Promise<UiThemeMode> {
  const saved = await readThemePreference();
  if (saved) return saved;
  if (storedTheme === 'dark') return 'dark';
  return ensureThemePreference();
}

export async function getSettings(includeWorkspaceBranding = true): Promise<SettingsModel> {
  const local = await readLocalSettings();
  if (!includeWorkspaceBranding) {
    return sanitizeSettings({
      ...local,
      branding: { ...DEFAULT_SETTINGS.branding },
      global: {
        ...local.global,
        primaryColor: DEFAULT_SETTINGS.global.primaryColor,
      },
    });
  }
  return mergeWorkspaceBranding(local);
}

export async function saveSettings(next: SettingsModel): Promise<SettingsModel> {
  const sanitized = sanitizeSettings(next);
  await handleSaveWorkspaceSettings({
    org_name: sanitized.branding.orgName.trim(),
    logo_data_url: sanitized.branding.logoDataUrl,
    primary_color: sanitized.global.primaryColor,
  });
  return writeLocalSettings(sanitized);
}

export async function saveLocalSettings(next: SettingsModel): Promise<SettingsModel> {
  return writeLocalSettings(next);
}

export async function saveWorkspaceBranding(payload: {
  orgName: string;
  logoDataUrl: string | null;
  primaryColor: string;
}): Promise<SettingsModel> {
  const local = await readLocalSettings();
  const next = sanitizeSettings({
    ...local,
    branding: {
      orgName: payload.orgName.trim(),
      logoDataUrl: payload.logoDataUrl,
    },
    global: {
      ...local.global,
      primaryColor: payload.primaryColor,
    },
  });
  await handleSaveWorkspaceSettings({
    org_name: next.branding.orgName,
    logo_data_url: next.branding.logoDataUrl,
    primary_color: next.global.primaryColor,
  });
  return writeLocalSettings(next);
}
