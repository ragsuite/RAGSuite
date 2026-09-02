import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Shield } from 'lucide-react-native';

import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { PrivacySettings } from '@/features/search-config/types/search-config.types';
import { useTranslation } from '@/i18n';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { HistoryPrivacyDisclosure } from '@/shared/components/history-privacy-disclosure';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function SearchPrivacySettingsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { confirm } = useConfirm();
  const { bundle, loading, saving, handleSavePrivacySettings } = useSearchConfig();
  const [draft, setDraft] = useState<PrivacySettings | null>(null);

  useEffect(() => {
    if (bundle?.privacySettings) setDraft(bundle.privacySettings);
  }, [bundle?.privacySettings]);

  const formDisabled = loading || saving;
  const i18nPrefix = 'search.config.privacy';

  const onToggle = async (next: boolean) => {
    const confirmed = await confirm({
      title: t(next ? `${i18nPrefix}.confirm.enable.title` : `${i18nPrefix}.confirm.disable.title`),
      message: t(next ? `${i18nPrefix}.confirm.enable.message` : `${i18nPrefix}.confirm.disable.message`),
      cancelLabel: t('common.cancel'),
      confirmLabel: t(next ? `${i18nPrefix}.confirm.enable.confirm` : `${i18nPrefix}.confirm.disable.confirm`),
      destructive: !next,
    });
    if (!confirmed) return;
    setDraft((prev) => (prev ? { ...prev, storeHistoryEnabled: next } : prev));
  };

  const onSave = () => {
    if (!draft) return;
    void handleSavePrivacySettings(draft);
  };

  if (loading && !bundle?.privacySettings) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('search.config.loading')}</Text>
      </View>
    );
  }

  return (
    <StatePanel isEmpty={!draft} emptyLabel={t(`${i18nPrefix}.unavailable`)}>
      {draft ? (
        <SearchConfigPanelCard icon={Shield} title={t('search.settings.privacy')} subtitle={t(`${i18nPrefix}.subtitle`)}>
          <View style={{ gap: spacing.lg }}>
            <AppSwitchRow
              bordered
              label={t(`${i18nPrefix}.storeHistory.label`)}
              description={t(`${i18nPrefix}.storeHistory.description`)}
              value={draft.storeHistoryEnabled}
              disabled={formDisabled}
              onChange={onToggle}
            />
            <HistoryPrivacyDisclosure historyEnabled={draft.storeHistoryEnabled} i18nPrefix={i18nPrefix} />
            <SearchConfigSaveButton
              label={saving ? t('search.config.saving') : t('search.config.save')}
              disabled={formDisabled}
              loading={saving}
              onPress={onSave}
            />
          </View>
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  loadingWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
});
