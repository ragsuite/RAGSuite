import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Workflow } from 'lucide-react-native';

import { EditionBadge } from '@/shared/components/brand/edition-badge';
import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { ConfigurationPanelCard } from '@/features/configuration/components/ConfigurationPanelCard';
import { useConfiguration } from '@/features/configuration/hooks/useConfiguration';
import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import { formatApiKeySelectLabel } from '@/features/configuration/utils/configuration-display';
import {
  buildN8nCurlSnippet,
  formatN8nRequestPreview,
  getN8nSelectPlaceholder,
} from '@/features/configuration/utils/curl-snippets';
import { AppSelectField } from '@/shared/components/app-select-field';
import { PasswordField } from '@/shared/components/password-field';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { copyText } from '@/shared/utils/copy-text';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

export function N8nIntegrationPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { isHeaderStacked, isActionsStacked } = useConfigurationLayout();
  const {
    apiKeys,
    refreshing,
    testing,
    n8nSelectedKeyId,
    n8nPastedKey,
    n8nTemplate,
    n8nTemplateLoading,
    activeProjectId,
    setN8nSelectedKeyId,
    setN8nPastedKey,
    setPrimaryTab,
    refresh,
    handleTestRetrieval,
    loadN8nKeySecret,
    effectiveN8nApiKey,
    notify,
  } = useConfiguration();
  const [copied, setCopied] = useState(false);
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const keyOptions = apiKeys.map((key) => ({
    key: key.id,
    label: formatApiKeySelectLabel(key),
  }));

  const previewApiKey = useMemo(() => {
    if (n8nPastedKey.trim()) return n8nPastedKey.trim();
    const selected = apiKeys.find((key) => key.id === n8nSelectedKeyId);
    if (selected?.secretKey) return selected.secretKey;
    if (selected) return selected.maskedKey;
    return 'Your_API_key';
  }, [apiKeys, n8nPastedKey, n8nSelectedKeyId]);

  const requestPreview = formatN8nRequestPreview(previewApiKey, n8nTemplate);
  const curlSnippet = buildN8nCurlSnippet(effectiveN8nApiKey, n8nTemplate);
  const selectPlaceholder = getN8nSelectPlaceholder(apiKeys.length);

  const handleCopyCurl = async () => {
    const ok = await copyText(curlSnippet);
    if (!ok) {
      notify(t('api-keys.curl.copyFailed'), 'error');
      return;
    }
    setCopied(true);
    notify(t('api-keys.curl.copied'));
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopied(false), 1500);
  };

  const refreshButton = (
    <ConfigurationOutlineButton
      label={t('configuration.n8n.refreshKeys')}
      loading={refreshing}
      disabled={refreshing}
      onPress={() => void refresh()}
      fullWidth={isHeaderStacked}
    />
  );

  if (!activeProjectId) {
    return (
      <ConfigurationPanelCard
        icon={Workflow}
        title={t('n8n.title')}
        subtitle={t('configuration.n8n.description')}
        headerBadge={<EditionBadge variant="beta" />}>
        <StatePanel isEmpty emptyLabel={t('compareModels.empty.noProject')}>
          {null}
        </StatePanel>
      </ConfigurationPanelCard>
    );
  }

  return (
    <ConfigurationPanelCard
      icon={Workflow}
      title={t('n8n.title')}
      subtitle={t('configuration.n8n.description')}
      headerBadge={<EditionBadge variant="beta" />}
      headerAction={refreshButton}>
      <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>
        {t('configuration.n8n.inboundHelp')}
      </Text>

      <AppSelectField
        label={t('configuration.n8n.selectSavedKey')}
        value={n8nSelectedKeyId ?? ''}
        options={keyOptions}
        onChange={(id) => {
          setN8nSelectedKeyId(id);
          setN8nPastedKey('');
          void loadN8nKeySecret(id);
        }}
        placeholder={selectPlaceholder}
        pickerPresentation="inline"
      />

      <PasswordField
        label={t('configuration.n8n.pasteKeyLabel')}
        value={n8nPastedKey}
        onChangeText={setN8nPastedKey}
        placeholder={t('configuration.n8n.pasteKeyPlaceholder')}
      />

      {n8nTemplateLoading ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('configuration.n8n.loadingTemplate')}
        </Text>
      ) : (
        <IntegrationCodeBlock
          code={requestPreview}
          accessibilityLabel={t('configuration.n8n.inboundHelp')}
          copied={copied}
          onCopy={() => void handleCopyCurl()}
          copyButtonLabel={t('configuration.n8n.copyCurl')}
        />
      )}

      <View
        style={[
          styles.footerActions,
          isActionsStacked ? styles.footerActionsStacked : null,
          { gap: spacing.sm },
        ]}>
        <ConfigurationOutlineButton
          label={testing ? t('configuration.n8n.testing') : t('configuration.n8n.testRetrieval')}
          loading={testing}
          disabled={testing}
          onPress={() => void handleTestRetrieval()}
          fullWidth={isActionsStacked}
        />

        <ConfigurationOutlineButton
          label={t('configuration.tabs.apiKeys')}
          icon={ActionIcons.externalLink}
          accent
          onPress={() => setPrimaryTab('api-keys')}
          fullWidth={isActionsStacked}
        />
      </View>
    </ConfigurationPanelCard>
  );
}

const styles = StyleSheet.create({
  footerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  footerActionsStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
});
