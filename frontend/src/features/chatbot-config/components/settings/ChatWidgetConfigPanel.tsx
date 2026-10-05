import { MessageSquare } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type {
  ChatWidgetConfig,
  ChatWidgetCustomization,
} from '@/features/chatbot-config/types/chatbot-config.types';
import {
  applyEffectiveChatbotBrandToConfig,
  applyEffectiveChatbotBrandToCustomization,
  CE_CHATBOT_BRAND_TITLE,
  canCustomizeChatbotBrand,
} from '@/features/chatbot-config/utils/chatbot-brand-gate';
import { CHATBOT_LANGUAGE_OPTIONS } from '@/features/chatbot-config/utils/chatbot-language-options';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { LocaleFlag } from '@/i18n/locale-flag';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedAdornment, EnterpriseLockedHint } from '@/platform/ee-locked';
import { useWidgetCapabilities } from '@/platform/widget-capabilities';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const LANGUAGE_OPTIONS = CHATBOT_LANGUAGE_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
  leading: <LocaleFlag code={option.key} size={18} />,
}));

export function ChatWidgetConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const brandEditable = canCustomizeChatbotBrand(enterpriseModulesAvailable);
  const { hasVoicePilot } = useWidgetCapabilities();
  const {
    bundle,
    loading,
    saving,
    handleSaveChatWidgetConfig,
    handleSaveChatWidgetCustomization,
  } = useChatbotConfig();
  const [draft, setDraft] = useState<ChatWidgetConfig | null>(null);
  const [voicePilotEnabled, setVoicePilotEnabled] = useState(false);

  const layoutOptions = [
    { key: 'direct', label: t('chatbot.config.layout.option.direct') },
    { key: 'tabbed', label: t('chatbot.config.layout.option.tabbed') },
  ];

  useEffect(() => {
    if (bundle?.chatWidgetConfig) {
      const next = {
        ...bundle.chatWidgetConfig,
        heroTitle: bundle.chatWidgetConfig.heroTitle ?? '',
        heroSubtitle: bundle.chatWidgetConfig.heroSubtitle ?? '',
        widgetLayout: bundle.chatWidgetConfig.widgetLayout === 'tabbed' ? 'tabbed' : 'direct',
        homeDisplayName: bundle.chatWidgetConfig.homeDisplayName ?? '',
        homeStatusText: bundle.chatWidgetConfig.homeStatusText ?? '',
        homeCtaLabel: bundle.chatWidgetConfig.homeCtaLabel ?? '',
      } as ChatWidgetConfig;
      setDraft(brandEditable ? next : applyEffectiveChatbotBrandToConfig(next, false));
    }
  }, [bundle?.chatWidgetConfig, brandEditable]);

  useEffect(() => {
    setVoicePilotEnabled(Boolean(bundle?.chatWidgetCustomization?.voicePilotEnabled));
  }, [bundle?.chatWidgetCustomization?.voicePilotEnabled]);

  const customization = bundle?.chatWidgetCustomization;
  const formDisabled = loading || saving;
  const previewCustomization = customization
    ? applyEffectiveChatbotBrandToCustomization(
        {
          ...customization,
          voicePilotEnabled:
            (draft?.widgetLayout ?? 'direct') === 'tabbed' ? voicePilotEnabled : false,
        } as ChatWidgetCustomization,
        brandEditable,
      )
    : null;
  const previewConfig = draft ? applyEffectiveChatbotBrandToConfig(draft, brandEditable) : null;
  const showVoicePilotToggle = hasVoicePilot && (draft?.widgetLayout ?? 'direct') === 'tabbed';

  if (loading && !bundle?.chatWidgetConfig) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.config.loading')}</Text>
      </View>
    );
  }

  const onSave = async () => {
    if (!draft || !customization) return;
    const configToSave = applyEffectiveChatbotBrandToConfig(draft, brandEditable);
    const nextEnabled =
      hasVoicePilot && draft.widgetLayout === 'tabbed'
        ? voicePilotEnabled
        : customization.voicePilotEnabled;
    const voiceChanged = hasVoicePilot && nextEnabled !== customization.voicePilotEnabled;

    // Config + Voice Pilot are two API writes; toast only once for the combined save.
    await handleSaveChatWidgetConfig(configToSave, { silent: voiceChanged });
    if (voiceChanged) {
      const nextCustomization: ChatWidgetCustomization = {
        ...customization,
        voicePilotEnabled: nextEnabled,
      };
      await handleSaveChatWidgetCustomization(nextCustomization, configToSave);
    }
  };

  return (
    <StatePanel isEmpty={!draft || !customization} emptyLabel={t('chatbot.config.unavailable')}>
      {draft && customization && previewConfig && previewCustomization ? (
        <ChatbotConfigPreviewLayout
          preview={
            <ChatWidgetPreview
              config={previewConfig}
              customization={previewCustomization}
              avatarOptions={bundle?.avatarOptions}
              faqSettings={bundle?.faqSettings}
            />
          }
          form={
            <SearchConfigPanelCard
              icon={MessageSquare}
              title={t('chatbot.config.title')}
              subtitle={t('chatbot.config.description')}>
              <View style={{ gap: spacing.lg }}>
                <AppSelectField
                  label={t('chatbot.config.layoutLabel')}
                  value={draft.widgetLayout ?? 'direct'}
                  options={layoutOptions}
                  onChange={(widgetLayout) =>
                    setDraft((prev) =>
                      prev
                        ? {
                            ...prev,
                            widgetLayout: widgetLayout === 'tabbed' ? 'tabbed' : 'direct',
                          }
                        : prev,
                    )
                  }
                />
                {showVoicePilotToggle ? (
                  <AppSwitchRow
                    label={t('chatbot.widget.voicePilot.title')}
                    bordered
                    value={voicePilotEnabled}
                    disabled={formDisabled}
                    onChange={setVoicePilotEnabled}
                  />
                ) : null}
                <View style={{ gap: spacing.xs }}>
                  <AppTextField
                    label={t('chatbot.config.titleLabel')}
                    placeholder={t('chatbot.config.titlePlaceholder')}
                    value={brandEditable ? draft.title : CE_CHATBOT_BRAND_TITLE}
                    editable={!formDisabled && brandEditable}
                    rightAdornment={brandEditable ? undefined : <EnterpriseLockedAdornment />}
                    onChangeText={(title) => setDraft((prev) => (prev ? { ...prev, title } : prev))}
                  />
                  {!brandEditable ? (
                    <EnterpriseLockedHint>
                      {t('chatbot.config.title.enterpriseLocked', {
                        defaultValue: 'Chatbot title branding is available in RAGSuite Enterprise.',
                      })}
                    </EnterpriseLockedHint>
                  ) : null}
                </View>
                <AppTextField
                  label={t('chatbot.config.heroTitleLabel')}
                  placeholder={t('chatbot.config.heroTitlePlaceholder')}
                  value={draft.heroTitle ?? ''}
                  editable={!formDisabled}
                  onChangeText={(heroTitle) =>
                    setDraft((prev) => (prev ? { ...prev, heroTitle } : prev))
                  }
                />
                <AppTextField
                  label={t('chatbot.config.heroSubtitleLabel')}
                  placeholder={t('chatbot.config.heroSubtitlePlaceholder')}
                  value={draft.heroSubtitle ?? ''}
                  editable={!formDisabled}
                  onChangeText={(heroSubtitle) =>
                    setDraft((prev) => (prev ? { ...prev, heroSubtitle } : prev))
                  }
                />
                {draft.widgetLayout === 'tabbed' ? (
                  <>
                    <AppTextField
                      label={t('chatbot.config.homeStatusTextLabel')}
                      placeholder={t('chatbot.config.homeStatusTextPlaceholder')}
                      value={draft.homeStatusText ?? ''}
                      editable={!formDisabled}
                      onChangeText={(homeStatusText) =>
                        setDraft((prev) => (prev ? { ...prev, homeStatusText } : prev))
                      }
                    />
                    <AppTextField
                      label={t('chatbot.config.homeCtaLabelLabel')}
                      placeholder={t('chatbot.config.homeCtaLabelPlaceholder')}
                      value={draft.homeCtaLabel ?? ''}
                      editable={!formDisabled}
                      onChangeText={(homeCtaLabel) =>
                        setDraft((prev) => (prev ? { ...prev, homeCtaLabel } : prev))
                      }
                    />
                  </>
                ) : null}
                <AppTextField
                  label={t('chatbot.config.bubbleMessageLabel')}
                  placeholder={t('chatbot.config.bubbleMessagePlaceholder')}
                  value={draft.bubbleMessage}
                  editable={!formDisabled}
                  onChangeText={(bubbleMessage) =>
                    setDraft((prev) =>
                      prev ? { ...prev, bubbleMessage, launcherLabel: bubbleMessage } : prev,
                    )
                  }
                />
                <AppTextField
                  label={t('chatbot.config.welcomeMessageLabel')}
                  placeholder={t('chatbot.config.welcomeMessagePlaceholder')}
                  value={draft.welcomeMessage}
                  editable={!formDisabled}
                  onChangeText={(welcomeMessage) =>
                    setDraft((prev) =>
                      prev ? { ...prev, welcomeMessage, greeting: welcomeMessage } : prev,
                    )
                  }
                />
                <AppSelectField
                  label={t('chatbot.config.languageLabel')}
                  value={draft.language}
                  options={LANGUAGE_OPTIONS}
                  onChange={(language) => setDraft((prev) => (prev ? { ...prev, language } : prev))}
                />
                <SearchConfigSaveButton
                  label={saving ? t('chatbot.config.saving') : t('chatbot.config.save')}
                  disabled={formDisabled}
                  loading={saving}
                  onPress={() => void onSave()}
                />
              </View>
            </SearchConfigPanelCard>
          }
        />
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
