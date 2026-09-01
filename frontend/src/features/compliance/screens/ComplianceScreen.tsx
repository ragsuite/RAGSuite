import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';
import { useRouter, type Href } from 'expo-router';

import { SettingsRetentionPanel } from '@/features/settings/components/SettingsRetentionPanel';
import {
  handleGetDeletionReceipt,
  handleListDeletionReceipts,
  type DeletionReceiptResponse,
} from '@/network/actions/compliance.actions';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';

export function ComplianceScreen() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const router = useRouter();
  const { settings, saving, updateRetention } = useSettings();
  const [receipts, setReceipts] = useState<DeletionReceiptResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<DeletionReceiptResponse | null>(null);

  const loadReceipts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await handleListDeletionReceipts({ limit: 50 });
      setReceipts(data.items);
    } catch {
      setError(t('compliance.receipts.loadError', { defaultValue: 'Unable to load deletion log.' }));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadReceipts();
  }, [loadReceipts]);

  const openReceipt = async (id: string) => {
    try {
      const row = await handleGetDeletionReceipt(id);
      setSelected(row);
    } catch {
      setSelected(null);
    }
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppKeyboardScreenScroll
        contentContainerStyle={{
          paddingHorizontal: horizontalPadding,
          paddingBottom: scrollBottomPadding,
          maxWidth: contentMaxWidth,
          width: '100%',
          alignSelf: 'center',
          gap: spacing.md,
        }}
        refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void loadReceipts()} />}>
        <PageSectionHeader
          title={t('compliance.nav', { defaultValue: 'Compliance' })}
          subtitle={t('compliance.subtitle', {
            defaultValue: 'Retention policy and provable deletion receipts for your organization.',
          })}
        />

        <SectionCard title={t('settings.retention.title')}>
          <SettingsRetentionPanel
            retentionDays={settings.retention.retentionDays}
            autoDelete={settings.retention.autoDelete}
            saving={saving}
            onSave={(payload) => void updateRetention(payload)}
          />
        </SectionCard>

        <SectionCard title={t('compliance.receipts.title', { defaultValue: 'Deletion log' })}>
          <StatePanel loading={loading} error={error} onRetry={() => void loadReceipts()}>
            {receipts.length === 0 ? (
              <Text style={[typography.body, { color: colors.textMuted }]}>
                {t('compliance.receipts.empty', { defaultValue: 'No deletion receipts yet.' })}
              </Text>
            ) : (
              <View style={{ gap: spacing.sm }}>
                {receipts.map((row) => (
                  <Pressable
                    key={row.id}
                    onPress={() => void openReceipt(row.id)}
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                      padding: spacing.md,
                      backgroundColor: colors.surface,
                      gap: spacing.xs,
                    }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {new Date(row.initiated_at).toLocaleString()} · {row.trigger_type}
                    </Text>
                    <Text style={[typography.body, { color: colors.text }]}>{row.summary}</Text>
                    <Text style={[typography.caption, { color: colors.primary }]}>
                      {t('compliance.receipts.id', { defaultValue: 'Receipt' })} #{row.id.slice(0, 8)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          </StatePanel>
        </SectionCard>

        {selected ? (
          <SectionCard title={t('compliance.receipts.detail', { defaultValue: 'Receipt detail' })}>
            <Text style={[typography.caption, { color: colors.textMuted, marginBottom: spacing.sm }]}>
              {selected.id}
            </Text>
            <Text style={[typography.body, { color: colors.text, fontFamily: 'monospace' }]}>
              {JSON.stringify(selected.manifest, null, 2)}
            </Text>
          </SectionCard>
        ) : null}

        <Pressable onPress={() => router.push('/(app)/trust-center' as Href)}>
          <Text style={[typography.body, { color: colors.primary }]}>
            {t('compliance.trustCenterLink', { defaultValue: 'Open Trust Center documentation →' })}
          </Text>
        </Pressable>
      </AppKeyboardScreenScroll>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
