import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';

import {
  handleGetRetentionPolicy,
  handleUpdateRetentionPolicy,
  type RetentionPolicyResponse,
  type RetentionPreview,
} from '@/network/actions/compliance.actions';
import { RETENTION_LIMITS } from '@/features/settings/services/settings.service';
import {
  buildClientRetentionPreview,
  buildDraftRetentionPreview,
  formatRetentionDate,
} from '@/features/settings/utils/retention-preview';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  retentionDays: number;
  autoDelete?: boolean;
  saving?: boolean;
  onSave: (payload: { autoDelete: boolean; retentionDays: number }) => void | Promise<void>;
};

const ERASED_KEYS = [
  'settings.retention.preview.erasedItem1',
  'settings.retention.preview.erasedItem2',
  'settings.retention.preview.erasedItem3',
  'settings.retention.preview.erasedItem4',
  'settings.retention.preview.erasedItem5',
] as const;

const NOT_ERASED_KEYS = [
  'settings.retention.preview.notErasedItem1',
  'settings.retention.preview.notErasedItem2',
  'settings.retention.preview.notErasedItem3',
  'settings.retention.preview.notErasedItem4',
  'settings.retention.preview.notErasedItem5',
] as const;

type RetentionStatusCardProps = {
  preview: RetentionPreview;
  retentionDays: number;
  autoDeleteActive: boolean;
  lastPurgeAt?: string | null;
  countsStale?: boolean;
};

function RetentionStatusCard({
  preview,
  retentionDays,
  autoDeleteActive,
  lastPurgeAt,
  countsStale,
}: RetentionStatusCardProps) {
  const { t, locale } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  const counts = preview.eligible_counts;
  const lastRun = formatRetentionDate(lastPurgeAt, locale);
  const nextRun = formatRetentionDate(preview.next_purge_estimate_at, locale);

  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: surfaceRadius.card,
        padding: spacing.md,
        gap: spacing.sm,
        backgroundColor: colors.surfaceMuted,
      }}>
      <Text style={[typography.subtitle, { color: colors.text }]}>
        {t('settings.retention.preview.title')}
      </Text>
      <Text style={[typography.body, { color: colors.textSoft }]}>
        {t('settings.retention.preview.retentionPeriod', { count: retentionDays })}
      </Text>
      {preview.cutoff_at ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {autoDeleteActive
            ? t('settings.retention.preview.cutoff', {
                date: formatRetentionDate(preview.cutoff_at, locale),
              })
            : t('settings.retention.preview.cutoffInactive', {
                date: formatRetentionDate(preview.cutoff_at, locale),
              })}
        </Text>
      ) : null}
      {autoDeleteActive ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.eligibleNow', {
            chatMessages: counts.chat_messages,
            queryLogs: counts.query_logs,
            analyticsDays: counts.analytics_days,
            auditEvents: counts.audit_events ?? 0,
          })}
        </Text>
      ) : null}
      {countsStale ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('settings.retention.preview.countsStale')}
        </Text>
      ) : null}
      {preview.new_data_expires_at ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.newDataExpires', {
            date: formatRetentionDate(preview.new_data_expires_at, locale),
            days: preview.days_until_new_data_expires,
          })}
        </Text>
      ) : null}
      {preview.oldest_interaction_at && preview.days_until_oldest_expires != null ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.oldestExpires', {
            days: preview.days_until_oldest_expires,
            date: formatRetentionDate(preview.oldest_interaction_at, locale),
          })}
        </Text>
      ) : null}
      {autoDeleteActive ? (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {lastPurgeAt
            ? t('settings.retention.preview.nextPurge', { lastRun, nextRun })
            : t('settings.retention.preview.nextPurgeNoLast')}
        </Text>
      ) : (
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.purgeInactive')}
        </Text>
      )}

      <View style={{ gap: spacing.xs, marginTop: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.primary }]}>
          {t('settings.retention.preview.erasedList')}
        </Text>
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.erasedIntro')}
        </Text>
        {ERASED_KEYS.map((key) => (
          <Text key={key} style={[typography.body, { color: colors.textSoft }]}>
            •{' '}
            {key === 'settings.retention.preview.erasedItem5'
              ? t(key, { count: retentionDays })
              : t(key)}
          </Text>
        ))}
      </View>

      <View style={{ gap: spacing.xs }}>
        <Text style={[typography.caption, { color: colors.primary }]}>
          {t('settings.retention.preview.notErasedList')}
        </Text>
        <Text style={[typography.body, { color: colors.textSoft }]}>
          {t('settings.retention.preview.notErasedIntro')}
        </Text>
        {NOT_ERASED_KEYS.map((key) => (
          <Text key={key} style={[typography.body, { color: colors.textSoft }]}>
            • {t(key)}
          </Text>
        ))}
      </View>
    </View>
  );
}

export function SettingsRetentionPanel({ retentionDays, autoDelete = false, saving, onSave }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [policy, setPolicy] = useState<RetentionPolicyResponse | null>(null);
  const [draftDays, setDraftDays] = useState(String(retentionDays));
  const [draftAutoDelete, setDraftAutoDelete] = useState(autoDelete);
  const [confirmation, setConfirmation] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await handleGetRetentionPolicy();
      setPolicy(data);
      setDraftDays(String(data.retention_days));
      setDraftAutoDelete(data.auto_delete);
    } catch {
      setError(t('settings.retention.loadError', { defaultValue: 'Unable to load retention policy.' }));
      setDraftDays(String(retentionDays));
      setDraftAutoDelete(autoDelete);
    } finally {
      setLoading(false);
    }
  }, [autoDelete, retentionDays, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const parsedDays = useMemo(() => {
    const n = Number.parseInt(draftDays, 10);
    if (Number.isNaN(n)) return RETENTION_LIMITS.minDays;
    return Math.min(RETENTION_LIMITS.maxDays, Math.max(RETENTION_LIMITS.minDays, n));
  }, [draftDays]);

  const preview = useMemo(() => {
    const saved = policy?.preview;
    if (saved?.new_data_expires_at) {
      return buildDraftRetentionPreview(saved, parsedDays, policy?.retention_days ?? parsedDays);
    }
    return buildClientRetentionPreview(parsedDays, {
      ...saved,
      auto_delete_active: draftAutoDelete,
    });
  }, [draftAutoDelete, parsedDays, policy?.preview, policy?.retention_days]);

  const countsStale = policy != null && parsedDays !== policy.retention_days;

  const needsConfirmation = policy != null && parsedDays < (policy.retention_days ?? parsedDays);

  const handleSubmit = async () => {
    if (needsConfirmation && confirmation.trim().toUpperCase() !== 'DELETE') {
      setError(t('settings.retention.confirmation.error'));
      return;
    }
    setError(null);
    try {
      const updated = await handleUpdateRetentionPolicy({
        auto_delete: draftAutoDelete,
        retention_days: parsedDays,
        confirmation: needsConfirmation ? confirmation.trim() : undefined,
      });
      setPolicy(updated);
      setConfirmation('');
      await onSave({ autoDelete: updated.auto_delete, retentionDays: updated.retention_days });
    } catch {
      setError(t('settings.retention.saveError', { defaultValue: 'Unable to save retention policy.' }));
    }
  };

  return (
    <StatePanel loading={loading} error={error} onRetry={() => void load()}>
      <View style={{ gap: spacing.md }}>
        {!draftAutoDelete ? (
          <View
            style={{
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              padding: spacing.md,
              backgroundColor: colors.surfaceMuted,
            }}>
            <Text style={[typography.body, { color: colors.textSoft }]}>
              {t('settings.retention.autoDeleteOffNotice', {
                defaultValue:
                  'Auto-delete is OFF — no chat, search, or feedback history will be removed until you enable it.',
              })}
            </Text>
          </View>
        ) : null}

        <AppSwitchRow
          label={t('settings.retention.autoDelete.label')}
          description={t('settings.retention.autoDelete.description')}
          value={draftAutoDelete}
          onChange={setDraftAutoDelete}
        />

        <RetentionStatusCard
          preview={preview}
          retentionDays={parsedDays}
          autoDeleteActive={draftAutoDelete}
          lastPurgeAt={policy?.retention_last_purge_at}
          countsStale={countsStale && draftAutoDelete}
        />

        <AppTextField
          label={t('settings.retention.period.label')}
          value={draftDays}
          keyboardType="number-pad"
          onChangeText={setDraftDays}
        />
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('settings.retention.period.hint')}
        </Text>

        {needsConfirmation ? (
          <AppTextField
            label={t('settings.retention.confirmation.label')}
            placeholder={t('settings.retention.confirmation.placeholder')}
            value={confirmation}
            onChangeText={setConfirmation}
          />
        ) : null}

        <AppButton
          label={t('common.save', { defaultValue: 'Save' })}
          loading={saving}
          onPress={() => void handleSubmit()}
        />
      </View>
    </StatePanel>
  );
}

export function DataRetentionForm(props: Record<string, unknown>) {
  return (
    <SettingsRetentionPanel
      retentionDays={90}
      autoDelete={false}
      onSave={async () => undefined}
      {...props}
    />
  );
}
