import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ProviderApiKeyField } from '@/features/model-configuration/components/ProviderApiKeyField';
import { PROVIDER_MARKS } from '@/features/model-configuration/components/provider-marks';
import { ProviderSurfaceTuningFields } from '@/features/model-configuration/components/ProviderSurfaceTuningFields';
import { useProviderDraft } from '@/features/model-configuration/hooks/useProviderDraft';
import type {
  ModelProviderKey,
  ProviderCatalogEntry,
  ProviderConfigSavePayload,
  ProviderConnectionResult,
  ProviderTestPayload,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  buildProviderSavePayload,
  buildProviderTestPayload,
  CHAT_ONLY_PROVIDERS,
  resolveChatModelOptions,
  resolveEmbeddingOptions,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatusBadge } from '@/shared/components/status-badge';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  entry: ProviderCatalogEntry;
  saving: boolean;
  removing: boolean;
  onSave: (provider: ModelProviderKey, payload: ProviderConfigSavePayload) => Promise<boolean>;
  onTest: (provider: ModelProviderKey, payload: ProviderTestPayload) => Promise<ProviderConnectionResult>;
  onRemove: (provider: ModelProviderKey) => Promise<boolean>;
};

function FieldHint({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{children}</Text>;
}

export function ProviderConfigPanel({ entry, saving, removing, onSave, onTest, onRemove }: Props) {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const toast = useStableToast();
  const { confirm } = useConfirm();
  const controller = useProviderDraft(entry);
  const { draft, setField } = controller;
  const { config } = entry;
  const isChatOnly = CHAT_ONLY_PROVIDERS.has(entry.key);
  const isOllama = controller.isOllama;

  const chatOptions = useMemo(() => resolveChatModelOptions(entry, draft.chatModel), [entry, draft.chatModel]);
  const embeddingOptions = useMemo(
    () => resolveEmbeddingOptions(entry, draft.embeddingModel),
    [entry, draft.embeddingModel],
  );

  const handleSave = async () => {
    const { payload, error } = buildProviderSavePayload({
      provider: entry.key,
      draft,
      pendingPlaintextKey: controller.getPendingKey(),
      hasSavedKey: controller.hasSavedApiKey,
      apiKeyEditing: controller.apiKeyEditing,
    });
    if (error || !payload) {
      const key = error ?? 'modelConfiguration.toast.saveFailed';
      toast({ description: t(key, { defaultValue: key }), variant: 'error' });
      return;
    }
    await onSave(entry.key, payload);
  };

  const handleTest = () =>
    onTest(entry.key, buildProviderTestPayload(entry.key, draft, controller.getPendingKey()));

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: t('modelConfiguration.remove.title', { provider: entry.label }),
      message: t('modelConfiguration.remove.message'),
      confirmLabel: t('modelConfiguration.remove.confirm'),
      cancelLabel: t('common.cancel'),
      destructive: true,
      variant: 'danger',
    });
    if (confirmed) await onRemove(entry.key);
  };

  const statusBadge = config.configured ? (
    <StatusBadge size="compact" tone="success" label={t('modelConfiguration.status.configured')} />
  ) : config.keyRejected ? (
    <StatusBadge size="compact" tone="danger" label={t('modelConfiguration.status.keyRejected')} />
  ) : (
    <StatusBadge size="compact" tone="muted" label={t('modelConfiguration.status.notConfigured')} />
  );

  return (
    <SearchConfigPanelCard
      icon={PROVIDER_MARKS[entry.key]}
      title={entry.label}
      subtitle={t('modelConfiguration.panel.subtitle')}
      headerBadge={statusBadge}>
      <View style={{ gap: spacing.md }}>
        <View style={styles.fieldGroup}>
          <AppSelectField
            label={t('chatbot.models.chatModel.label')}
            value={draft.chatModel}
            options={
              chatOptions.length > 0
                ? chatOptions
                : [{ key: draft.chatModel, label: draft.chatModel || t('chatbot.models.chatModel.noneAvailable') }]
            }
            onChange={(chatModel) => setField('chatModel', chatModel)}
          />
          <FieldHint>{t('chatbot.models.chatModel.helper')}</FieldHint>
        </View>

        <View style={styles.fieldGroup}>
          {embeddingOptions.length > 0 ? (
            <AppSelectField
              label={t('chatbot.models.embeddingModel.label')}
              value={draft.embeddingModel}
              options={embeddingOptions}
              onChange={(embeddingModel) => setField('embeddingModel', embeddingModel)}
            />
          ) : (
            <AppTextField
              label={t('chatbot.models.embeddingModel.label')}
              value=""
              placeholder={t('chatbot.models.embeddingModel.noneAvailable')}
              editable={false}
              onChangeText={() => undefined}
            />
          )}
          <FieldHint>
            {isChatOnly ? t('modelConfiguration.embedding.chatOnly') : t('chatbot.models.embeddingModel.helper')}
          </FieldHint>
        </View>

        <ProviderApiKeyField controller={controller} onTest={handleTest} />

        <View style={[styles.divider, { borderTopColor: colors.border, marginTop: spacing.sm, paddingTop: spacing.md }]} />

        <ProviderSurfaceTuningFields
          provider={entry.key}
          providerLabel={entry.label}
          value={draft.surfaces}
          onChange={controller.setSurfacePatch}
        />

        <View style={[styles.actions, { gap: spacing.sm }]}>
          <AppButton
            variant="cta"
            size="compact"
            label={t('modelConfiguration.save', { provider: entry.label })}
            icon={ActionIcons.save}
            loading={saving}
            disabled={saving || removing}
            onPress={() => void handleSave()}
          />
          {config.configured || config.hasApiKey ? (
            <AppButton
              variant="danger"
              size="compact"
              label={t('modelConfiguration.remove.button')}
              icon={ActionIcons.delete}
              loading={removing}
              disabled={saving || removing}
              onPress={() => void handleRemove()}
            />
          ) : null}
          {saving && !isOllama ? <FieldHint>{t('modelConfiguration.verifying', { provider: entry.label })}</FieldHint> : null}
        </View>
      </View>
    </SearchConfigPanelCard>
  );
}

const styles = StyleSheet.create({
  fieldGroup: { gap: 4 },
  hint: { lineHeight: 18 },
  divider: { borderTopWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
});
