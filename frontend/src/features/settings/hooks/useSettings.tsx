import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { DEFAULT_SETTINGS, RETENTION_LIMITS, getSettings, resolveUiTheme, saveLocalSettings, saveWorkspaceBranding, writeThemePreference, type UiThemeMode } from '@/features/settings/services/settings.service';
import { isSettingsLocaleCode } from '@/features/settings/data/settings-locale-options';
import type { DataRetention, Internationalization, SettingsFeedback, SettingsModel, WorkspaceBranding } from '@/features/settings/types/settings.types';

type SettingsContextValue = {
  settings: SettingsModel;
  loading: boolean;
  refreshing: boolean;
  saving: boolean;
  error: string | null;
  feedback: SettingsFeedback;
  effectiveTheme: UiThemeMode;
  refresh: () => Promise<void>;
  clearFeedback: () => void;
  toggleTheme: () => Promise<void>;
  updateTheme: (theme: UiThemeMode) => Promise<void>;
  updateAppearance: (payload: { primaryColor?: string; fontScale?: number }) => Promise<void>;
  updateBranding: (payload: WorkspaceBranding & { primaryColor?: string }) => Promise<void>;
  updateBackgroundTheme: (theme: 'geometric' | 'simple') => Promise<void>;
  updateRetention: (payload: DataRetention) => Promise<void>;
  updateIntl: (payload: Internationalization, options?: { silent?: boolean }) => Promise<void>;
  applyBrandingPreview: (payload: Partial<WorkspaceBranding & { primaryColor?: string }>) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

type Props = {
  children: React.ReactNode;
};

const DEFAULT_ERROR = 'Unable to load settings. Please try again.';
const SAVE_ERROR = "Couldn't save changes. Please try again.";
const SAVE_SUCCESS = 'Changes saved';

export function SettingsProvider({ children }: Props) {
  const { isAuthenticated, session } = useSession();
  const [settings, setSettings] = useState<SettingsModel>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedback>(null);
  const saveLockRef = useRef(false);
  const successFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSuccessFeedbackRef = useRef<{ message: string; at: number } | null>(null);

  const load = useCallback(
    async (mode: 'initial' | 'refresh', includeWorkspaceBranding = isAuthenticated) => {
      if (mode === 'initial') {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);
      try {
        let data = await getSettings(includeWorkspaceBranding);
        const uiTheme = await resolveUiTheme(data.global.theme);
        data = {
          ...data,
          global: {
            ...data.global,
            theme: uiTheme,
          },
        };
        setSettings(data);
      } catch {
        setError(DEFAULT_ERROR);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isAuthenticated],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  useEffect(() => {
    if (!isAuthenticated || !session?.accessToken) return;
    void load('refresh');
  }, [isAuthenticated, session?.accessToken, load]);

  useEffect(() => {
    if (successFeedbackTimeoutRef.current) {
      clearTimeout(successFeedbackTimeoutRef.current);
      successFeedbackTimeoutRef.current = null;
    }
    if (feedback?.type !== 'success') return;
    successFeedbackTimeoutRef.current = setTimeout(() => {
      setFeedback((current) => (current?.type === 'success' ? null : current));
      successFeedbackTimeoutRef.current = null;
    }, 2500);

    return () => {
      if (successFeedbackTimeoutRef.current) {
        clearTimeout(successFeedbackTimeoutRef.current);
        successFeedbackTimeoutRef.current = null;
      }
    };
  }, [feedback]);

  const persist = useCallback(
    async (next: SettingsModel) => {
      if (saveLockRef.current) {
        setFeedback({ type: 'error', message: 'Save already in progress. Please wait.' });
        return;
      }
      saveLockRef.current = true;
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveLocalSettings(next);
        setSettings(saved);
        const now = Date.now();
        const last = lastSuccessFeedbackRef.current;
        if (!last || last.message !== SAVE_SUCCESS || now - last.at > 1800) {
          setFeedback({ type: 'success', message: SAVE_SUCCESS });
          lastSuccessFeedbackRef.current = { message: SAVE_SUCCESS, at: now };
        }
      } catch {
        setFeedback({ type: 'error', message: SAVE_ERROR });
      } finally {
        setSaving(false);
        saveLockRef.current = false;
      }
    },
    []
  );

  useEffect(() => {
    if (isAuthenticated) return;
    void (async () => {
      const uiTheme = await resolveUiTheme();
      const reset = await getSettings(false);
      const next = {
        ...reset,
        global: { ...reset.global, theme: uiTheme },
      };
      setSettings(next);
      await saveLocalSettings(next);
    })();
  }, [isAuthenticated]);

  const applyUiTheme = useCallback(
    async (theme: UiThemeMode) => {
      const next = {
        ...settings,
        global: {
          ...settings.global,
          theme,
        },
      };
      setSettings(next);
      await writeThemePreference(theme);
      await persist(next);
    },
    [persist, settings],
  );

  const toggleTheme = useCallback(async () => {
    const nextTheme: UiThemeMode = settings.global.theme === 'dark' ? 'light' : 'dark';
    await applyUiTheme(nextTheme);
  }, [applyUiTheme, settings.global.theme]);

  const updateTheme = useCallback(
    async (theme: UiThemeMode) => {
      await applyUiTheme(theme);
    },
    [applyUiTheme],
  );

  const updateAppearance = useCallback(
    async (payload: { primaryColor?: string; fontScale?: number }) => {
      const next = {
        ...settings,
        global: {
          ...settings.global,
          primaryColor: payload.primaryColor ?? settings.global.primaryColor,
          fontScale: payload.fontScale ?? settings.global.fontScale,
        },
      };
      setSettings(next);
      await persist(next);
      if (payload.primaryColor) {
        try {
          const saved = await saveWorkspaceBranding({
            orgName: settings.branding.orgName,
            logoDataUrl: settings.branding.logoDataUrl,
            primaryColor: payload.primaryColor,
          });
          setSettings(saved);
        } catch {
          setFeedback({ type: 'error', message: SAVE_ERROR });
        }
      }
    },
    [persist, settings],
  );

  const updateBranding = useCallback(
    async (payload: WorkspaceBranding & { primaryColor?: string }) => {
      setSaving(true);
      setFeedback(null);
      try {
        const saved = await saveWorkspaceBranding({
          orgName: payload.orgName,
          logoDataUrl: payload.logoDataUrl,
          primaryColor: payload.primaryColor ?? settings.global.primaryColor,
        });
        setSettings(saved);
        setFeedback({ type: 'success', message: SAVE_SUCCESS });
      } catch {
        setFeedback({ type: 'error', message: SAVE_ERROR });
      } finally {
        setSaving(false);
      }
    },
    [settings.branding.logoDataUrl, settings.branding.orgName, settings.global.primaryColor],
  );

  const updateBackgroundTheme = useCallback(
    async (backgroundTheme: 'geometric' | 'simple') => {
      const next = {
        ...settings,
        global: {
          ...settings.global,
          backgroundTheme,
        },
      };
      setSettings(next);
      await persist(next);
    },
    [persist, settings],
  );

  const updateRetention = useCallback(
    async (payload: DataRetention) => {
      const nextDays = Math.min(RETENTION_LIMITS.maxDays, Math.max(RETENTION_LIMITS.minDays, payload.retentionDays));
      const next = {
        ...settings,
        retention: {
          autoDelete: payload.autoDelete,
          retentionDays: nextDays,
        },
      };
      setSettings(next);
      await persist(next);
    },
    [persist, settings]
  );

  const updateIntl = useCallback(
    async (payload: Internationalization, options?: { silent?: boolean }) => {
      const safeLanguage = isSettingsLocaleCode(payload.language) ? payload.language : 'en';
      const next = {
        ...settings,
        intl: {
          ...payload,
          language: safeLanguage,
        },
      };
      setSettings(next);
      if (options?.silent) {
        await saveLocalSettings(next);
        return;
      }
      await persist(next);
    },
    [persist, settings],
  );

  const applyBrandingPreview = useCallback((payload: Partial<WorkspaceBranding & { primaryColor?: string }>) => {
    setSettings((current) => ({
      ...current,
      branding: {
        orgName: payload.orgName ?? current.branding.orgName,
        logoDataUrl: payload.logoDataUrl !== undefined ? payload.logoDataUrl : current.branding.logoDataUrl,
      },
      global: {
        ...current.global,
        primaryColor: payload.primaryColor ?? current.global.primaryColor,
      },
    }));
  }, []);

  const value = useMemo<SettingsContextValue>(() => {
    const effectiveTheme: UiThemeMode = settings.global.theme === 'dark' ? 'dark' : 'light';
    return {
      settings,
      loading,
      refreshing,
      saving,
      error,
      feedback,
      effectiveTheme,
      refresh: () => load('refresh'),
      clearFeedback: () => setFeedback(null),
      toggleTheme,
      updateTheme,
      updateAppearance,
      updateBranding,
      updateBackgroundTheme,
      updateRetention,
      updateIntl,
      applyBrandingPreview,
    };
  }, [settings, loading, refreshing, saving, error, feedback, load, toggleTheme, updateTheme, updateAppearance, updateBranding, updateBackgroundTheme, updateRetention, updateIntl, applyBrandingPreview]);

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettings() {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettings must be used inside SettingsProvider');
  }
  return context;
}

/** Safe for error boundaries and other shells mounted above SettingsProvider. */
export function useSettingsOptional() {
  return useContext(SettingsContext);
}
