import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { Timer } from 'lucide-react-native';

import { useSession } from '@/features/auth/providers/session-provider';
import {
  clampSessionTimeoutMinutes,
  formatSessionCountdown,
  SESSION_TIMEOUT_MAX_MINUTES,
  SESSION_TIMEOUT_MIN_MINUTES,
  SESSION_TIMEOUT_WARN_MS,
  shouldShowSessionCountdown,
} from '@/features/auth/utils/session-countdown';
import {
  handleGetSessionTimeout,
  handleRefreshSession,
  handleUpdateSessionTimeout,
  type SessionTimeoutResponse,
} from '@/network/actions/session-timeout.actions';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useToastRef } from '@/shared/toast/use-toast-ref';

type Props = {
  /** When true, show the live countdown card for the signed-in user. */
  showCountdown?: boolean;
};

export function SettingsSessionTimeoutPanel({ showCountdown = true }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toastRef = useToastRef();
  const { session, sessionRemainingMs, applySession } = useSession();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<SessionTimeoutResponse | null>(null);
  const [draft, setDraft] = useState('');
  const [enabledDraft, setEnabledDraft] = useState(true);

  const renewSession = useCallback(async () => {
    const refreshed = await handleRefreshSession({
      hasCompletedOnboarding: session?.user.hasCompletedOnboarding ?? true,
    });
    await applySession(refreshed);
  }, [applySession, session?.user.hasCompletedOnboarding]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await handleGetSessionTimeout();
      setPolicy(next);
      setDraft(String(next.session_timeout_minutes));
      setEnabledDraft(next.session_timeout_enabled !== false);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('settings.sessionTimeout.loadError'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const persistPolicy = useCallback(
    async (payload: { session_timeout_enabled?: boolean; session_timeout_minutes?: number }) => {
      setSaving(true);
      setError(null);
      try {
        const updated = await handleUpdateSessionTimeout(payload);
        setPolicy(updated);
        setDraft(String(updated.session_timeout_minutes));
        setEnabledDraft(updated.session_timeout_enabled !== false);
        await renewSession();
        toastRef.current({
          title: t('settings.sessionTimeout.toast.saved.title'),
          description: updated.session_timeout_enabled
            ? t('settings.sessionTimeout.toast.saved.description', {
                minutes: updated.session_timeout_minutes,
              })
            : t('settings.sessionTimeout.toast.saved.disabled'),
          variant: 'success',
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : t('settings.sessionTimeout.saveError');
        setError(message);
        toastRef.current({ description: message, variant: 'error' });
        throw err;
      } finally {
        setSaving(false);
      }
    },
    [renewSession, t, toastRef],
  );

  const handleToggleEnabled = useCallback(
    async (nextEnabled: boolean) => {
      if (saving) return;
      const previous = enabledDraft;
      setEnabledDraft(nextEnabled);

      const confirmed = await confirm({
        title: nextEnabled
          ? t('settings.sessionTimeout.confirm.enable.title')
          : t('settings.sessionTimeout.confirm.disable.title'),
        message: nextEnabled
          ? t('settings.sessionTimeout.confirm.enable.message', {
              minutes: clampSessionTimeoutMinutes(Number.parseInt(draft.trim(), 10) || policy?.session_timeout_minutes || 60),
            })
          : t('settings.sessionTimeout.confirm.disable.message'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('settings.sessionTimeout.confirm.action'),
        dimBackdrop: true,
        variant: 'warning',
      });
      if (!confirmed) {
        setEnabledDraft(previous);
        return;
      }

      try {
        if (nextEnabled) {
          const parsed = Number.parseInt(draft.trim(), 10);
          const minutes = Number.isFinite(parsed)
            ? clampSessionTimeoutMinutes(parsed)
            : clampSessionTimeoutMinutes(policy?.session_timeout_minutes ?? 60);
          await persistPolicy({
            session_timeout_enabled: true,
            session_timeout_minutes: minutes,
          });
        } else {
          await persistPolicy({ session_timeout_enabled: false });
        }
      } catch {
        setEnabledDraft(previous);
      }
    },
    [confirm, draft, enabledDraft, persistPolicy, policy?.session_timeout_minutes, saving, t],
  );

  const handleSave = useCallback(async () => {
    if (!enabledDraft) return;

    const parsed = Number.parseInt(draft.trim(), 10);
    if (!Number.isFinite(parsed)) {
      toastRef.current({
        description: t('settings.sessionTimeout.validation.invalid'),
        variant: 'error',
      });
      return;
    }
    const minutes = clampSessionTimeoutMinutes(parsed);
    if (minutes !== parsed) {
      setDraft(String(minutes));
      toastRef.current({
        description: t('settings.sessionTimeout.validation.clamped', {
          min: SESSION_TIMEOUT_MIN_MINUTES,
          max: SESSION_TIMEOUT_MAX_MINUTES,
        }),
        variant: 'info',
      });
    }

    const confirmed = await confirm({
      title: t('settings.sessionTimeout.confirm.title'),
      message: t('settings.sessionTimeout.confirm.message', { minutes }),
      cancelLabel: t('common.cancel'),
      confirmLabel: t('settings.sessionTimeout.confirm.action'),
      dimBackdrop: true,
      variant: 'warning',
    });
    if (!confirmed) return;

    try {
      await persistPolicy({
        session_timeout_enabled: true,
        session_timeout_minutes: minutes,
      });
    } catch {
      /* toast already shown */
    }
  }, [confirm, draft, enabledDraft, persistPolicy, t, toastRef]);

  const countdownVisible = shouldShowSessionCountdown(sessionRemainingMs);
  const countdown =
    countdownVisible && sessionRemainingMs != null
      ? formatSessionCountdown(sessionRemainingMs)
      : null;
  const warn =
    countdownVisible &&
    sessionRemainingMs != null &&
    sessionRemainingMs <= SESSION_TIMEOUT_WARN_MS;

  return (
    <StatePanel loading={loading} error={error} onRetry={() => void load()}>
      <View style={{ gap: spacing.md }}>
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.sessionTimeout.description')}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('settings.sessionTimeout.note.others')}
        </Text>

        <AppSwitchRow
          bordered={false}
          label={t('settings.sessionTimeout.enable.label')}
          description={t('settings.sessionTimeout.enable.helper')}
          value={enabledDraft}
          disabled={loading || saving}
          onChange={(next) => void handleToggleEnabled(next)}
        />

        {enabledDraft ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t('settings.sessionTimeout.hint.range', {
                min: policy?.min_minutes ?? SESSION_TIMEOUT_MIN_MINUTES,
                max: policy?.max_minutes ?? SESSION_TIMEOUT_MAX_MINUTES,
                defaultMinutes: policy?.default_minutes ?? 60,
              })}
            </Text>

            <AppTextField
              label={t('settings.sessionTimeout.field.label')}
              value={draft}
              onChangeText={setDraft}
              keyboardType="number-pad"
              editable={!saving}
              accessibilityLabel={t('settings.sessionTimeout.field.label')}
            />

            {policy ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t('settings.sessionTimeout.source', {
                  source:
                    policy.source === 'org'
                      ? t('settings.sessionTimeout.source.org')
                      : t('settings.sessionTimeout.source.env'),
                })}
              </Text>
            ) : null}

            <AppButton
              label={t('settings.sessionTimeout.save')}
              onPress={() => void handleSave()}
              loading={saving}
              disabled={saving}
            />

            {showCountdown && countdown ? (
              <View
                style={{
                  borderWidth: 1,
                  borderColor: warn ? colors.danger : colors.border,
                  borderRadius: surfaceRadius.card,
                  padding: spacing.md,
                  gap: spacing.xs,
                  backgroundColor: colors.surfaceMuted,
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Timer size={18} color={warn ? colors.danger : colors.textMuted} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {t('settings.sessionTimeout.countdown.label')}
                  </Text>
                  <Text
                    style={[
                      typography.subtitle,
                      { color: warn ? colors.danger : colors.text, fontVariant: ['tabular-nums'] },
                    ]}
                  >
                    {countdown}
                  </Text>
                </View>
              </View>
            ) : null}
          </>
        ) : (
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('settings.sessionTimeout.disabled.note')}
          </Text>
        )}
      </View>
    </StatePanel>
  );
}
