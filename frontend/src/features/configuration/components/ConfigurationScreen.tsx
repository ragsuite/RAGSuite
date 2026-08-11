import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { ApiKeyCreatedSheet } from '@/features/configuration/components/ApiKeyCreatedSheet';
import { ApiKeysPanel } from '@/features/configuration/components/ApiKeysPanel';
import { ConfigurationConfirmDeleteSheet } from '@/features/configuration/components/ConfigurationConfirmDeleteSheet';
import { ConfigurationSkeleton } from '@/features/configuration/components/ConfigurationSkeleton';
import { CreateApiKeySheet } from '@/features/configuration/components/CreateApiKeySheet';
import { N8nIntegrationPanel } from '@/features/configuration/components/N8nIntegrationPanel';
import { useConfiguration } from '@/features/configuration/hooks/useConfiguration';
import type { ConfigurationPrimaryTab } from '@/features/configuration/types/configuration.types';
import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import { ConfigurationPrimaryTabs } from '@/features/configuration/components/ConfigurationTabs';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

export function ConfigurationScreen() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const { isWeb, showWebPageHeader, isCompactWebHeader, contentMaxWidth, horizontalPadding } =
    useConfigurationLayout();
  const {
    loading,
    refreshing,
    error,
    feedback,
    primaryTab,
    activeSheet,
    saving,
    createdKey,
    createdFullKey,
    deletingKey,
    refresh,
    clearFeedback,
    notify,
    closeSheet,
    handleCreateApiKey,
    handleDeleteApiKey,
    setPrimaryTab,
  } = useConfiguration();
  const { tab } = useLocalSearchParams<{ tab?: string | string[] }>();

  useEffect(() => {
    const raw = Array.isArray(tab) ? tab[0] : tab;
    if (raw === 'api-keys' || raw === 'n8n') {
      setPrimaryTab(raw as ConfigurationPrimaryTab);
    }
  }, [setPrimaryTab, tab]);

  const showSkeleton = loading;
  const showErrorOnly = Boolean(error) && !showSkeleton;

  const headerWithTabs = (
    <>
      {showWebPageHeader ? (
        <PageSectionHeader
          variant={isCompactWebHeader ? 'compact' : 'page'}
          title={t('configuration.title')}
          subtitle={t('configuration.description')}
        />
      ) : null}
      <View style={{ marginBottom: spacing.lg }}>
        <ConfigurationTabs />
      </View>
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={horizontalPadding ?? spacing.sm}
        topPadding={isWeb ? (isCompactWebHeader ? spacing.md : spacing.lg) : spacing.sm}
        bottomPaddingExtra={56}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        header={headerWithTabs}>
        {showSkeleton ? (
          <ConfigurationSkeleton rows={3} />
        ) : showErrorOnly ? (
          <StatePanel error={error} onRetry={() => void refresh()}>
            {null}
          </StatePanel>
        ) : (
          <>
            {primaryTab === 'api-keys' ? <ApiKeysPanel /> : null}
            {primaryTab === 'n8n' ? <N8nIntegrationPanel /> : null}
          </>
        )}
      </FeatureScreenScroll>

      <CreateApiKeySheet
        visible={activeSheet?.type === 'create'}
        saving={saving}
        onClose={closeSheet}
        onSubmit={(payload) => void handleCreateApiKey(payload)}
      />

      <ApiKeyCreatedSheet
        visible={activeSheet?.type === 'created'}
        apiKey={createdKey}
        fullKey={createdFullKey}
        onClose={closeSheet}
        onCopyFeedback={notify}
      />

      <ConfigurationConfirmDeleteSheet
        visible={activeSheet?.type === 'confirm-delete'}
        apiKey={deletingKey}
        saving={saving}
        onClose={closeSheet}
        onConfirm={() => {
          if (deletingKey) void handleDeleteApiKey(deletingKey.id);
        }}
      />

      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

function ConfigurationTabs() {
  const { t } = useTranslation();
  const { primaryTab, setPrimaryTab } = useConfiguration();
  const tabs: { key: ConfigurationPrimaryTab; label: string }[] = [
    { key: 'api-keys', label: t('configuration.tabs.apiKeys') },
    { key: 'n8n', label: t('configuration.tabs.n8n') },
  ];
  return <ConfigurationPrimaryTabs tabs={tabs} activeTab={primaryTab} onChange={setPrimaryTab} />;
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  headerCopy: {
    flex: 1,
    gap: 4,
  },
  title: {
    fontSize: 28,
  },
  titleCompact: {
    fontSize: 22,
  },
});
