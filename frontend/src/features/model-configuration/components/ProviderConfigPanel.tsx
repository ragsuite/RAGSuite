import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { ProviderApiKeyField } from '@/features/model-configuration/components/ProviderApiKeyField';
import { ProviderFieldInfo } from '@/features/model-configuration/components/ProviderFieldInfo';
import { PROVIDER_MARKS } from '@/features/model-configuration/components/provider-marks';
import { ProviderSurfaceTuningFields } from '@/features/model-configuration/components/ProviderSurfaceTuningFields';
import { useProviderDraft } from '@/features/model-configuration/hooks/useProviderDraft';
import type {
  AzureDeploymentsListPayload,
  AzureDeploymentsListResult,
  ModelOption,
  ModelProviderKey,
  ProviderCatalogEntry,
  ProviderConfigSavePayload,
  ProviderConnectionResult,
  ProviderTestPayload,
} from '@/features/model-configuration/types/model-configuration.types';
import {
  applyAzureDeploymentLists,
  buildProviderSavePayload,
  buildProviderTestPayload,
  CHAT_ONLY_PROVIDERS,
  ENDPOINT_REQUIRED_PROVIDERS,
  resolveAzureDeploymentsRefreshMessage,
  resolveChatModelOptions,
  resolveEmbeddingOptions,
} from '@/features/model-configuration/utils/model-configuration.mappers';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { hasPendingPlaintextApiKey } from '@/features/search-config/utils/search-model-settings';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatusBadge } from '@/shared/components/status-badge';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';

type Props = {
  entry: ProviderCatalogEntry;
  saving: boolean;
  removing: boolean;
  onSave: (provider: ModelProviderKey, payload: ProviderConfigSavePayload) => Promise<boolean>;
  onTest: (provider: ModelProviderKey, payload: ProviderTestPayload) => Promise<ProviderConnectionResult>;
  onRemove: (provider: ModelProviderKey) => Promise<boolean>;
  onListAzureDeployments?: (payload: AzureDeploymentsListPayload) => Promise<AzureDeploymentsListResult>;
};

function FieldHint({ children }: { children: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>{children}</Text>;
}

export function ProviderConfigPanel({
  entry,
  saving,
  removing,
  onSave,
  onTest,
  onRemove,
  onListAzureDeployments,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, mode } = useAppTheme();
  const toast = useStableToast();
  const { confirm } = useConfirm();
  const controller = useProviderDraft(entry);
  const { draft, setField } = controller;
  const { config } = entry;
  const isChatOnly = CHAT_ONLY_PROVIDERS.has(entry.key);
  const isOllama = controller.isOllama;
  const isAzure = entry.key === 'azure_openai';
  const [listingDeployments, setListingDeployments] = useState(false);
  const [azureChatOptions, setAzureChatOptions] = useState<ModelOption[]>([]);
  const [azureEmbeddingOptions, setAzureEmbeddingOptions] = useState<ModelOption[]>([]);
  const refreshIconColor = mode === 'dark' ? colors.text : colors.textSoft;

  const chatOptions = useMemo(
    () => resolveChatModelOptions(entry, draft.chatModel),
    [entry, draft.chatModel],
  );

  const embeddingOptions = useMemo(() => {
    if (isChatOnly) return [];
    return resolveEmbeddingOptions(entry, draft.embeddingModel);
  }, [entry, draft.embeddingModel, isChatOnly]);

  const canRefreshDeployments =
    Boolean(onListAzureDeployments) &&
    draft.endpoint.trim().length > 0 &&
    (hasPendingPlaintextApiKey(controller.getPendingKey()) ||
      hasPendingPlaintextApiKey(draft.apiKey) ||
      controller.hasSavedApiKey);

  const handleRefreshDeployments = async () => {
    if (!onListAzureDeployments) return;
    const pending = controller.getPendingKey().trim();
    const hasKey =
      hasPendingPlaintextApiKey(pending) ||
      hasPendingPlaintextApiKey(draft.apiKey) ||
      controller.hasSavedApiKey;
    if (!draft.endpoint.trim() || !hasKey) {
      toast({ description: t('modelConfiguration.deployments.refresh.needCredentials'), variant: 'error' });
      return;
    }
    setListingDeployments(true);
    try {
      const payload: AzureDeploymentsListPayload = {
        endpoint: draft.endpoint.trim().replace(/\/+$/, ''),
        api_version: draft.apiVersion.trim() || null,
      };
      if (hasPendingPlaintextApiKey(pending)) payload.api_key = pending;
      else if (hasPendingPlaintextApiKey(draft.apiKey)) payload.api_key = draft.apiKey.trim();
      const result = await onListAzureDeployments(payload);
      const applied = applyAzureDeploymentLists({
        chat: result.chat,
        embedding: result.embedding,
        currentChat: draft.chatModel,
        currentEmbedding: draft.embeddingModel,
      });
      if (!applied) {
        setAzureChatOptions([]);
        setAzureEmbeddingOptions([]);
        toast({
          description: resolveAzureDeploymentsRefreshMessage(result.error, t),
          variant: 'error',
        });
        return;
      }
      setAzureChatOptions(applied.chatOptions);
      setAzureEmbeddingOptions(applied.embeddingOptions);
      if (applied.filledChat) setField('chatModel', applied.chatModel);
      if (applied.filledEmbedding) setField('embeddingModel', applied.embeddingModel);

      if (applied.filledChat && applied.filledEmbedding) {
        toast({
          description: t('modelConfiguration.deployments.refresh.success', {
            chat: applied.chatModel,
            embedding: applied.embeddingModel,
          }),
          variant: 'success',
        });
      } else if (applied.filledChat) {
        toast({
          description: t('modelConfiguration.deployments.refresh.partialChat', {
            chat: applied.chatModel,
          }),
          variant: 'success',
        });
      } else if (applied.filledEmbedding) {
        toast({
          description: t('modelConfiguration.deployments.refresh.partialEmbedding', {
            embedding: applied.embeddingModel,
          }),
          variant: 'success',
        });
      }
    } catch (err) {
      const raw = err instanceof Error ? err.message : String(err ?? '');
      toast({
        description: resolveAzureDeploymentsRefreshMessage(raw, t),
        variant: 'error',
      });
    } finally {
      setListingDeployments(false);
    }
  };

  const renderDeploymentRefreshControl = () => (
    <View style={styles.refreshActions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('modelConfiguration.deployments.refresh.a11y')}
        disabled={listingDeployments || !canRefreshDeployments}
        onPress={() => void handleRefreshDeployments()}
        hitSlop={8}
        style={({ focused, pressed }) => [
          styles.refreshBtn,
          focusRingStyle(focused, colors.primary),
          pressed ? { backgroundColor: colors.surfaceMuted } : null,
          listingDeployments || !canRefreshDeployments ? { opacity: 0.45 } : null,
        ]}>
        {listingDeployments ? (
          <ActivityIndicator size="small" color={colors.primary} />
        ) : (
          <ActionIcons.refresh size={16} color={canRefreshDeployments ? refreshIconColor : colors.textMuted} />
        )}
      </Pressable>
    </View>
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

  const handleTest = async (): Promise<ProviderConnectionResult> => {
    const { payload, error } = buildProviderTestPayload({
      provider: entry.key,
      draft,
      pendingPlaintextKey: controller.getPendingKey(),
      hasSavedKey: controller.hasSavedApiKey,
    });
    if (error || !payload) {
      return { ok: false, message: error ?? 'models.apiKey.test.connectionFailed' };
    }
    return onTest(entry.key, payload);
  };

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

  const chatDeploymentInfo = (
    <ProviderFieldInfo
      titleKey={
        isAzure
          ? 'modelConfiguration.deployments.chat.hintTitle'
          : 'modelConfiguration.chatModel.hintTitle'
      }
      bodyKey={
        isAzure
          ? 'modelConfiguration.deployments.chat.hintBody'
          : 'modelConfiguration.chatModel.hintBody'
      }
    />
  );

  const embeddingDeploymentInfo = (
    <ProviderFieldInfo
      titleKey={
        isChatOnly
          ? 'modelConfiguration.embeddingModel.chatOnlyHintTitle'
          : isAzure
            ? 'modelConfiguration.deployments.embedding.hintTitle'
            : 'modelConfiguration.embeddingModel.hintTitle'
      }
      bodyKey={
        isChatOnly
          ? 'modelConfiguration.embeddingModel.chatOnlyHintBody'
          : isAzure
            ? 'modelConfiguration.deployments.embedding.hintBody'
            : 'modelConfiguration.embeddingModel.hintBody'
      }
    />
  );

  const chatDeploymentFields = isAzure ? (
    <View style={[styles.fieldGroup, styles.fieldGrow]}>
      {azureChatOptions.length > 0 ? (
        <View style={styles.deploymentFieldRow}>
          <View style={styles.deploymentFieldGrow}>
            <AppSelectField
              label={t('modelConfiguration.deployments.chatLabel')}
              labelAccessory={chatDeploymentInfo}
              value={draft.chatModel}
              options={
                azureChatOptions.some((o) => o.key === draft.chatModel)
                  ? azureChatOptions
                  : [
                      ...azureChatOptions,
                      ...(draft.chatModel
                        ? [{ key: draft.chatModel, label: draft.chatModel }]
                        : []),
                    ]
              }
              onChange={(chatModel) => setField('chatModel', chatModel)}
            />
          </View>
          {renderDeploymentRefreshControl()}
        </View>
      ) : (
        <AppTextField
          label={t('modelConfiguration.deployments.chatLabel')}
          labelAccessory={chatDeploymentInfo}
          value={draft.chatModel}
          placeholder={t('modelConfiguration.deployments.chatPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(chatModel) => setField('chatModel', chatModel)}
          rightAdornment={renderDeploymentRefreshControl()}
        />
      )}
    </View>
  ) : (
    <View style={styles.fieldGroup}>
      <AppSelectField
        label={t('chatbot.models.chatModel.label')}
        labelAccessory={chatDeploymentInfo}
        value={draft.chatModel}
        options={
          chatOptions.length > 0
            ? chatOptions
            : [{ key: draft.chatModel, label: draft.chatModel || t('chatbot.models.chatModel.noneAvailable') }]
        }
        onChange={(chatModel) => setField('chatModel', chatModel)}
      />
    </View>
  );

  const embeddingDeploymentFields = isChatOnly ? (
    <View style={styles.fieldGroup}>
      <AppTextField
        label={t('chatbot.models.embeddingModel.label')}
        labelAccessory={embeddingDeploymentInfo}
        value=""
        placeholder={t('chatbot.models.embeddingModel.noneAvailable')}
        editable={false}
        onChangeText={() => undefined}
      />
    </View>
  ) : isAzure ? (
    <View style={[styles.fieldGroup, styles.fieldGrow]}>
      {azureEmbeddingOptions.length > 0 ? (
        <View style={styles.deploymentFieldRow}>
          <View style={styles.deploymentFieldGrow}>
            <AppSelectField
              label={t('modelConfiguration.deployments.embeddingLabel')}
              labelAccessory={embeddingDeploymentInfo}
              value={draft.embeddingModel}
              options={
                azureEmbeddingOptions.some((o) => o.key === draft.embeddingModel)
                  ? azureEmbeddingOptions
                  : [
                      ...azureEmbeddingOptions,
                      ...(draft.embeddingModel
                        ? [{ key: draft.embeddingModel, label: draft.embeddingModel }]
                        : []),
                    ]
              }
              onChange={(embeddingModel) => setField('embeddingModel', embeddingModel)}
            />
          </View>
          {renderDeploymentRefreshControl()}
        </View>
      ) : (
        <AppTextField
          label={t('modelConfiguration.deployments.embeddingLabel')}
          labelAccessory={embeddingDeploymentInfo}
          value={draft.embeddingModel}
          placeholder={t('modelConfiguration.deployments.embeddingPlaceholder')}
          autoCapitalize="none"
          autoCorrect={false}
          onChangeText={(embeddingModel) => setField('embeddingModel', embeddingModel)}
          rightAdornment={renderDeploymentRefreshControl()}
        />
      )}
    </View>
  ) : (
    <View style={styles.fieldGroup}>
      {embeddingOptions.length > 0 ? (
        <AppSelectField
          label={t('chatbot.models.embeddingModel.label')}
          labelAccessory={embeddingDeploymentInfo}
          value={draft.embeddingModel}
          options={embeddingOptions}
          onChange={(embeddingModel) => setField('embeddingModel', embeddingModel)}
        />
      ) : (
        <AppTextField
          label={t('chatbot.models.embeddingModel.label')}
          labelAccessory={embeddingDeploymentInfo}
          value=""
          placeholder={t('chatbot.models.embeddingModel.noneAvailable')}
          editable={false}
          onChangeText={() => undefined}
        />
      )}
    </View>
  );

  return (
    <SearchConfigPanelCard
      icon={PROVIDER_MARKS[entry.key]}
      title={entry.label}
      subtitle={t('modelConfiguration.panel.subtitle')}
      headerBadge={statusBadge}>
      <View style={{ gap: spacing.md }}>
        {isAzure ? (
          <>
            <View style={styles.fieldGroup}>
              <AppTextField
                label={t('modelConfiguration.endpoint.label')}
                labelAccessory={
                  <ProviderFieldInfo
                    titleKey="modelConfiguration.endpoint.hintTitle"
                    bodyKey="modelConfiguration.endpoint.hintBody"
                  />
                }
                value={draft.endpoint}
                placeholder={t('modelConfiguration.endpoint.placeholder')}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(endpoint) => setField('endpoint', endpoint)}
              />
            </View>

            <ProviderApiKeyField controller={controller} onTest={handleTest} />

            <View style={styles.fieldGroup}>
              <AppTextField
                label={t('modelConfiguration.apiVersion.label')}
                labelAccessory={
                  <ProviderFieldInfo
                    titleKey="modelConfiguration.apiVersion.hintTitle"
                    bodyKey="modelConfiguration.apiVersion.hintBody"
                  />
                }
                value={draft.apiVersion}
                placeholder={t('modelConfiguration.apiVersion.placeholder')}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(apiVersion) => setField('apiVersion', apiVersion)}
              />
            </View>

            <View style={styles.fieldGroup}>
              <View style={[styles.deploymentRow, { gap: spacing.md }]}>
                {chatDeploymentFields}
                {embeddingDeploymentFields}
              </View>
              {!canRefreshDeployments ? (
                <FieldHint>{t('modelConfiguration.deployments.refresh.needCredentialsHint')}</FieldHint>
              ) : (
                <FieldHint>{t('modelConfiguration.deployments.refresh.manualHint')}</FieldHint>
              )}
            </View>
          </>
        ) : (
          <>
            {chatDeploymentFields}
            {embeddingDeploymentFields}
            <ProviderApiKeyField controller={controller} onTest={handleTest} />
            {ENDPOINT_REQUIRED_PROVIDERS.has(entry.key) ? (
              <View style={styles.fieldGroup}>
                <AppTextField
                  label={t('modelConfiguration.endpoint.label')}
                  labelAccessory={
                    <ProviderFieldInfo
                      titleKey="modelConfiguration.endpoint.hintTitle"
                      bodyKey="modelConfiguration.endpoint.hintBody"
                    />
                  }
                  value={draft.endpoint}
                  placeholder={t('modelConfiguration.endpoint.placeholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  onChangeText={(endpoint) => setField('endpoint', endpoint)}
                />
              </View>
            ) : null}
          </>
        )}

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
  fieldGrow: { flex: 1, minWidth: 0 },
  deploymentRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  deploymentFieldRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4 },
  deploymentFieldGrow: { flex: 1, minWidth: 0 },
  hint: { lineHeight: 18 },
  divider: { borderTopWidth: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  refreshActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    paddingBottom: 2,
  },
  refreshBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: TOOLBAR_CONTROL_HEIGHT,
    height: TOOLBAR_CONTROL_HEIGHT,
    borderRadius: 4,
  },
});
