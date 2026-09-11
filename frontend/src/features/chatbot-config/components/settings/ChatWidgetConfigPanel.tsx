import { Lock, MessageSquare } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { ChatWidgetConfig } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  applyEffectiveChatbotBrandToConfig,
  applyEffectiveChatbotBrandToCustomization,
  CE_CHATBOT_BRAND_TITLE,
  canCustomizeChatbotBrand,
} from '@/features/chatbot-config/utils/chatbot-brand-gate';
import { CHATBOT_LANGUAGE_OPTIONS } from '@/features/chatbot-config/utils/chatbot-language-options';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { ENTERPRISE_PRICING_URL } from '@/platform/ee-locked';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const LANGUAGE_OPTIONS = CHATBOT_LANGUAGE_OPTIONS.map((option) => ({
  key: option.key,
  label: option.label,
}));

export function ChatWidgetConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const brandEditable = canCustomizeChatbotBrand(enterpriseModulesAvailable);
  const { bundle, loading, saving, handleSaveChatWidgetConfig } = useChatbotConfig();
  const [draft, setDraft] = useState<ChatWidgetConfig | null>(null);

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
      setDraft(
        brandEditable ? next : applyEffectiveChatbotBrandToConfig(next, false),
      );
    }
  }, [bundle?.chatWidgetConfig, brandEditable]);

  const customization = bundle?.chatWidgetCustomization;
  const formDisabled = loading || saving;
  const previewCustomization = customization
    ? applyEffectiveChatbotBrandToCustomization(customization, brandEditable)
    : null;
  const previewConfig = draft
    ? applyEffectiveChatbotBrandToConfig(draft, brandEditable)
    : null;

  if (loading && !bundle?.chatWidgetConfig) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <ActivityIndicator color={colors.primary} />
        <Text style={[typography.body, { color: colors.textMuted }]}>{t('chatbot.config.loading')}</Text>
      </View>
    );
  }

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
                {draft.widgetLayout === 'tabbed' ? (
                  <View style={{ gap: spacing.md }}>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('chatbot.config.layout.homeFieldsHint')}
                    </Text>
                    <AppTextField
                      label={t('chatbot.config.homeDisplayNameLabel')}
                      placeholder={t('chatbot.config.homeDisplayNamePlaceholder')}
                      value={draft.homeDisplayName ?? ''}
                      editable={!formDisabled}
                      onChangeText={(homeDisplayName) =>
                        setDraft((prev) => (prev ? { ...prev, homeDisplayName } : prev))
                      }
                    />
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
                  </View>
                ) : null}
                <View style={{ gap: spacing.xs }}>
                  <AppTextField
                    label={t('chatbot.config.titleLabel')}
                    placeholder={t('chatbot.config.titlePlaceholder')}
                    value={brandEditable ? draft.title : CE_CHATBOT_BRAND_TITLE}
                    editable={!formDisabled && brandEditable}
                    rightAdornment={
                      brandEditable ? undefined : (
                        <Pressable
                          accessibilityRole="link"
                          accessibilityLabel={t('enterprise.locked.openPricing.a11y', {
                            defaultValue: 'Open RAGSuite Enterprise pricing comparison',
                          })}
                          hitSlop={8}
                          onPress={() => {
                            void Linking.openURL(ENTERPRISE_PRICING_URL);
                          }}>
                          <Lock size={14} color={colors.primary} />
                        </Pressable>
                      )
                    }
                    onChangeText={(title) => setDraft((prev) => (prev ? { ...prev, title } : prev))}
                  />
                  {!brandEditable ? (
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('chatbot.config.title.enterpriseLocked', {
                        defaultValue: 'Chatbot title branding is available in RAGSuite Enterprise.',
                      })}
                    </Text>
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
                <AppTextField
                  label={t('chatbot.config.bubbleMessageLabel')}
                  placeholder={t('chatbot.config.bubbleMessagePlaceholder')}
                  value={draft.bubbleMessage}
                  editable={!formDisabled}
                  onChangeText={(bubbleMessage) =>
                    setDraft((prev) => (prev ? { ...prev, bubbleMessage, launcherLabel: bubbleMessage } : prev))
                  }
                />
                <AppTextField
                  label={t('chatbot.config.welcomeMessageLabel')}
                  placeholder={t('chatbot.config.welcomeMessagePlaceholder')}
                  value={draft.welcomeMessage}
                  editable={!formDisabled}
                  onChangeText={(welcomeMessage) =>
                    setDraft((prev) => (prev ? { ...prev, welcomeMessage, greeting: welcomeMessage } : prev))
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
                  onPress={() =>
                    void handleSaveChatWidgetConfig(
                      applyEffectiveChatbotBrandToConfig(draft, brandEditable),
                    )
                  }
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
