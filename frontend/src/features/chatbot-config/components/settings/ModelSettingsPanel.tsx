import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { Cpu } from 'lucide-react-native';

import { ChatbotEmbeddingReindexBanner } from '@/features/chatbot-config/components/settings/ChatbotEmbeddingReindexBanner';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { ModelSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { NoConfiguredProvidersCta } from '@/features/model-configuration/components/NoConfiguredProvidersCta';
import { WidgetProviderPicker } from '@/features/model-configuration/components/WidgetProviderPicker';
import { useConfiguredProviders } from '@/features/model-configuration/hooks/useConfiguredProviders';
import type { ModelProviderKey } from '@/features/model-configuration/types/model-configuration.types';
import {
  applyProviderToWidgetSettings,
  resolveUnavailableWidgetProvider,
  resolveWidgetProviderEntry,
} from '@/features/model-configuration/utils/widget-provider-selection';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppRangeField } from '@/shared/components/app-range-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { ActionIcons } from '@/shared/constants/action-icons';
import { CHAT_RETRIEVAL_LIMITS, clampToRange } from '@/shared/constants/widget-retrieval-limits';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function clampChatSettings(settings: ModelSettings): ModelSettings {
  return { ...settings, topKResults: clampToRange(settings.topKResults ?? 5, CHAT_RETRIEVAL_LIMITS.topK) };
}

function FieldHint({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{children}</Text>;
}

export function ModelSettingsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { bundle, saving, refreshing, handleSaveModelSettings, handleRefreshModelStatus } = useChatbotConfig();
  const providers = useConfiguredProviders();
  const [draft, setDraft] = useState<ModelSettings | null>(null);
  const [selectedProvider, setSelectedProvider] = useState<ModelProviderKey | null>(null);
  const [embeddingRefreshKey, setEmbeddingRefreshKey] = useState(0);
  const settingsSnapshotRef = useRef('');

  useEffect(() => {
    if (!bundle?.modelSettings) return;
    const snapshot = JSON.stringify(bundle.modelSettings);
    if (snapshot === settingsSnapshotRef.current && draft) return;
    settingsSnapshotRef.current = snapshot;
    setDraft(clampChatSettings(bundle.modelSettings));
    setSelectedProvider(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle?.modelSettings]);

  const selectedEntry = useMemo(
    () => resolveWidgetProviderEntry(selectedProvider ?? draft?.provider, providers.configured),
    [selectedProvider, draft?.provider, providers.configured],
  );

  const unavailableProvider = useMemo(
    () => resolveUnavailableWidgetProvider(draft?.provider, providers.all),
    [draft?.provider, providers.all],
  );

  const patchDraft = (patch: Partial<ModelSettings>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const saveSettings = async () => {
    if (!draft || !selectedEntry) return;
    const saved = await handleSaveModelSettings(applyProviderToWidgetSettings(draft, selectedEntry), {
      providerManaged: true,
    });
    if (saved) setEmbeddingRefreshKey((key) => key + 1);
  };

  const isLoading = (refreshing && !bundle?.modelSettings) || (providers.loading && providers.configured.length === 0);

  if (isLoading) {
    return (
      <StatePanel isEmpty={false} emptyLabel="">
        <View style={[styles.center, { paddingVertical: spacing.xl }]}>
          <ActivityIndicator color={colors.primary} />
          <Text style={[typography.body, { color: colors.textMuted, marginTop: spacing.sm }]}>
            {t('chatbot.models.loading')}
          </Text>
        </View>
      </StatePanel>
    );
  }

  return (
    <StatePanel
      error={providers.error}
      onRetry={() => void providers.reload()}
      isEmpty={!draft}
      emptyLabel={t('chatbot.models.unavailable')}>
      {draft ? (
        <SearchConfigPanelCard icon={Cpu} title={t('chatbot.models.title')} subtitle={t('chatbot.models.description')}>
          {selectedEntry ? (
            <View style={{ gap: spacing.md }}>
              <WidgetProviderPicker
                configured={providers.configured}
                selected={selectedEntry}
                embeddingModel={draft.embeddingModel}
                labels={{
                  provider: t('chatbot.models.provider.label'),
                  chatModel: t('chatbot.models.chatModel.label'),
                  embeddingModel: t('chatbot.models.embeddingModel.label'),
                }}
                unavailable={unavailableProvider}
                onChange={setSelectedProvider}
              />

              <ChatbotEmbeddingReindexBanner
                refreshKey={`${embeddingRefreshKey}-${draft.embeddingModel}-${draft.provider}`}
                onReindexFinished={() => {
                  void handleRefreshModelStatus();
                }}
              />

              <View style={[styles.divider, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md }]} />

              <View style={styles.fieldGroup}>
                <AppRangeField
                  label={t('chatbot.models.rag.topK')}
                  value={draft.topKResults}
                  {...CHAT_RETRIEVAL_LIMITS.topK}
                  formatValue={(v) => String(v)}
                  onChange={(topKResults) => patchDraft({ topKResults })}
                />
                <FieldHint>{t('chatbot.models.rag.topKHelper')}</FieldHint>
              </View>

              <AppSwitchRow
                bordered
                label={t('chatbot.models.rag.useReranker')}
                description={t('chatbot.models.rag.useRerankerHelper')}
                value={draft.useReranker}
                onChange={(useReranker) => patchDraft({ useReranker })}
              />

              <AppButton
                variant="cta"
                size="compact"
                label={t('chatbot.models.save')}
                icon={ActionIcons.save}
                loading={saving}
                disabled={saving}
                onPress={() => void saveSettings()}
              />
            </View>
          ) : (
            <NoConfiguredProvidersCta />
          )}
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center' },
  fieldGroup: { gap: 4 },
  hint: { lineHeight: 18 },
  divider: { borderTopWidth: 1 },
});
