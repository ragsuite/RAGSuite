import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Code2 } from 'lucide-react-native';

import {
  WebIntegrationInstructions,
} from '@/features/chatbot-config/components/settings/WebIntegrationInstructions';
import { EmbedReadinessCard } from '@/features/chatbot-config/components/settings/EmbedReadinessCard';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { resolveChatbotWidgetAssetBase, buildChatbotWebCspAllowlist } from '@/features/chatbot-config/utils/chatbot-integration-snippets';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { CrawlSegmentTabs } from '@/features/crawl/components/CrawlSegmentTabs';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { IntegrationCredentialsPanel } from '@/shared/components/integration-credentials-panel';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { copyText } from '@/shared/utils/copy-text';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';
import { env } from '@/config/env';

type ScriptKey = 'web' | 'mobile';

const SCRIPT_TABS = (t: (key: string) => string): { key: ScriptKey; label: string }[] => [
  { key: 'web', label: t('common.web') },
  { key: 'mobile', label: t('common.mobile') },
];

export function IntegrationsScriptsPanel() {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const { activeProjectId } = useActiveProject();
  const {
    bundle,
    notify,
    saving,
    handleRegenerateScript,
    primaryTab,
    setPrimaryTab,
    setSettingsSection,
  } = useChatbotConfig();
  const [activeTab, setActiveTab] = useState<ScriptKey>('web');
  const [copiedKey, setCopiedKey] = useState<ScriptKey | null>(null);
  const scripts = bundle?.integrationScripts;
  const credentials = bundle?.integrationCredentials;
  const copiedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    };
  }, []);

  const goToAllowedDomains = () => {
    if (primaryTab !== 'settings') setPrimaryTab('settings');
    setSettingsSection('domains');
  };

  const copy = async (key: ScriptKey, value: string) => {
    const ok = await copyText(value);
    if (!ok) {
      notify(t('chatbot.integrations.copyFailed'), 'error');
      return;
    }
    setCopiedKey(key);
    if (key === 'web') {
      notify(t('chatbot.integrations.web.copy.description'), 'success');
    } else {
      notify(t('chatbot.integrations.mobile.copy.description'), 'success');
    }
    if (copiedTimeoutRef.current) clearTimeout(copiedTimeoutRef.current);
    copiedTimeoutRef.current = setTimeout(() => setCopiedKey(null), 1500);
  };

  const regenerate = (key: ScriptKey) => {
    void handleRegenerateScript(key);
  };

  const renderWebSection = (snippet: string) => {
    const assetBase = resolveChatbotWidgetAssetBase();
    return (
      <View style={{ gap: spacing.md }}>
        {credentials ? (
          <IntegrationCredentialsPanel
            variant="web"
            credentials={credentials}
            onManageDomains={goToAllowedDomains}
          />
        ) : null}

        <Text style={[typography.fieldLabel, styles.scriptLabel, { color: colors.text }]}>
          {t('chatbot.integrations.web.scriptLabel')}
        </Text>

        <IntegrationCodeBlock
          code={snippet}
          accessibilityLabel={t('chatbot.integrations.web.scriptLabel')}
          copied={copiedKey === 'web'}
          onCopy={() => void copy('web', snippet)}
        />

        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
          Widget script host: <Text style={{ fontFamily: fonts.mono }}>{assetBase}</Text>
          {env.widgetAssetBase
            ? ' (from WIDGET_ASSET_BASE)'
            : ' (page origin — same as reference frontend)'}
        </Text>

        {!activeProjectId ? (
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            Select a project to embed your project ID in the script. Until then,{' '}
            <Text style={{ fontFamily: fonts.mono }}>your-project-id-here</Text> is used as a placeholder.
          </Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.integrations.web.regenerate.button')}
          disabled={saving}
          onPress={() => regenerate('web')}
          style={({ pressed }) => [
            styles.regenerateBtn,
            {
              minHeight: CHATBOT_CONFIG_TOUCH_MIN,
              borderRadius: surfaceRadius.button,
              borderColor: colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
              opacity: saving ? 0.58 : 1,
              paddingHorizontal: spacing.md,
              gap: spacing.xs,
            },
          ]}>
          <ActionIcons.refresh size={16} color={colors.textMuted} />
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
            {t('chatbot.integrations.web.regenerate.button')}
          </Text>
        </Pressable>

        <EmbedReadinessCard />

        <WebIntegrationInstructions
          cspAllowlist={buildChatbotWebCspAllowlist()}
          onCspCopied={() => notify(t('integrations.web.csp.copied'), 'success')}
          onCspCopyFailed={() => notify(t('chatbot.integrations.copyFailed'), 'error')}
        />
      </View>
    );
  };

  const renderMobileSection = (snippet: string) => (
    <View style={{ gap: spacing.md }}>
      {credentials ? (
        <IntegrationCredentialsPanel
          variant="mobile"
          credentials={credentials}
          onManageDomains={goToAllowedDomains}
        />
      ) : null}

      <IntegrationCodeBlock
        code={snippet}
        accessibilityLabel={t('chatbot.integrations.mobile.scriptLabel')}
        copied={copiedKey === 'mobile'}
        onCopy={() => void copy('mobile', snippet)}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.integrations.mobile.regenerate')}
        disabled={saving}
        onPress={() => regenerate('mobile')}
        style={({ pressed }) => [
          styles.regenerateBtn,
          {
            minHeight: CHATBOT_CONFIG_TOUCH_MIN,
            borderRadius: surfaceRadius.button,
            borderColor: colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            opacity: saving ? 0.58 : 1,
            paddingHorizontal: spacing.md,
            gap: spacing.xs,
          },
        ]}>
        <ActionIcons.refresh size={16} color={colors.textMuted} />
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('chatbot.integrations.mobile.regenerate')}</Text>
      </Pressable>

      <View
        style={[
          styles.callout,
          {
            borderColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            borderRadius: surfaceRadius.card,
            padding: spacing.md,
            gap: spacing.sm,
          },
        ]}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('chatbot.integrations.mobile.instructions.title')}</Text>
        {[
          t('chatbot.integrations.mobile.instructions.step1'),
          t('chatbot.integrations.mobile.instructions.step2'),
          t('chatbot.integrations.mobile.instructions.step3'),
          t('chatbot.integrations.mobile.instructions.step4'),
          t('chatbot.integrations.mobile.instructions.step5'),
        ].map((step) => (
          <Text key={step} style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
            • {step}
          </Text>
        ))}
      </View>
    </View>
  );

  return (
    <StatePanel isEmpty={!scripts?.webSnippet} emptyLabel={t('chatbot.integrations.snippetUnavailable')}>
      {scripts?.webSnippet ? (
        <SearchConfigPanelCard
          icon={Code2}
          title={t('integrations.section.title')}
          subtitle={t('integrations.section.subtitle')}>
          <View style={{ gap: spacing.md }}>
            <CrawlSegmentTabs tabs={SCRIPT_TABS(t)} activeTab={activeTab} onChange={setActiveTab} variant="secondary" />
            {activeTab === 'web' ? renderWebSection(scripts.webSnippet) : renderMobileSection(scripts.mobileSnippet)}
          </View>
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  scriptLabel: { marginBottom: 4 },
  regenerateBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
  },
  callout: { borderWidth: 1 },
});
