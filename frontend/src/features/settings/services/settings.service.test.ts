import { storage } from '@/services/storage/storage';

import {
  DEFAULT_SETTINGS,
  RETENTION_LIMITS,
  getSettings,
  saveLocalSettings,
  saveWorkspaceBranding,
} from '@/features/settings/services/settings.service';
import type { SettingsModel } from '@/features/settings/types/settings.types';

jest.mock('@/network/actions/settings.actions', () => {
  let savedColor = '#1F5AAD';
  return {
    handleGetWorkspaceSettings: jest.fn(async () => ({
      org_name: 'RAGSuite',
      logo_data_url: null,
      primary_color: savedColor,
    })),
    handleSaveWorkspaceSettings: jest.fn(async (payload: { org_name: string; primary_color?: string }) => {
      if (payload.primary_color) savedColor = payload.primary_color;
      return {
        org_name: payload.org_name,
        logo_data_url: null,
        primary_color: savedColor,
      };
    }),
  };
});

describe('settings.service', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('clamps retention days within min and max bounds', async () => {
    const belowMin: SettingsModel = {
      ...DEFAULT_SETTINGS,
      retention: {
        autoDelete: true,
        retentionDays: RETENTION_LIMITS.minDays - 3,
      },
    };
    const aboveMax: SettingsModel = {
      ...DEFAULT_SETTINGS,
      retention: {
        autoDelete: true,
        retentionDays: RETENTION_LIMITS.maxDays + 30,
      },
    };

    jest.spyOn(storage, 'setItem').mockResolvedValue(undefined);

    const lowResult = await saveLocalSettings(belowMin);
    const highResult = await saveLocalSettings(aboveMax);

    expect(lowResult.retention.retentionDays).toBe(RETENTION_LIMITS.minDays);
    expect(highResult.retention.retentionDays).toBe(RETENTION_LIMITS.maxDays);
  });

  it('falls back to english for unsupported locales', async () => {
    const payload = {
      ...DEFAULT_SETTINGS,
      intl: {
        language: 'xx',
        region: 'US',
        timezone: 'UTC',
      },
    };

    jest.spyOn(storage, 'getItem').mockResolvedValue(JSON.stringify(payload));

    const result = await getSettings();

    expect(result.intl.language).toBe('en');
  });

  it('persists and loads settings roundtrip', async () => {
    const memory = new Map<string, string>();
    jest.spyOn(storage, 'setItem').mockImplementation(async (key, value) => {
      memory.set(key, value);
    });
    jest.spyOn(storage, 'getItem').mockImplementation(async (key) => memory.get(key) ?? null);

    const next: SettingsModel = {
      ...DEFAULT_SETTINGS,
      global: {
        ...DEFAULT_SETTINGS.global,
        theme: 'dark',
        primaryColor: '#6d5efc',
        fontScale: 1.1,
      },
      retention: {
        autoDelete: false,
        retentionDays: 120,
      },
      intl: {
        language: 'de',
        region: 'DE',
        timezone: 'Europe/Berlin',
      },
    };

    await saveWorkspaceBranding({
      orgName: next.branding.orgName,
      logoDataUrl: next.branding.logoDataUrl,
      primaryColor: next.global.primaryColor,
    });
    await saveLocalSettings(next);
    const loaded = await getSettings();

    expect(loaded.global.theme).toBe('dark');
    expect(loaded.global.primaryColor).toBe('#6d5efc');
    expect(loaded.global.fontScale).toBe(1.1);
    expect(loaded.retention.autoDelete).toBe(false);
    expect(loaded.retention.retentionDays).toBe(120);
    expect(loaded.intl.language).toBe('de');
    expect(loaded.intl.region).toBe('DE');
    expect(loaded.intl.timezone).toBe('Europe/Berlin');
  });
});
