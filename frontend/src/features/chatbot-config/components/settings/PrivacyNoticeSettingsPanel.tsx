import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { ScrollText, X } from 'lucide-react-native';

import { ChatWidgetPreview } from '@/features/chatbot-config/components/ChatWidgetPreview';
import { ChatbotConfigPreviewLayout } from '@/features/chatbot-config/components/ChatbotConfigPreviewLayout';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  PRIVACY_NOTICE_CONTENT_MAX,
  PRIVACY_NOTICE_LINK_PHRASES_MAX,
  PRIVACY_NOTICE_URL_MAX,
  validatePrivacyNoticeForEnable,
} from '@/features/chatbot-config/utils/privacy-notice-settings';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { AppSwitchRow } from '@/shared/components/app-switch-row';
import { AppTextField } from '@/shared/components/app-text-field';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

export function PrivacyNoticeSettingsPanel() {
  const { colors, spacing, typography, surfaceRadius, radius } = useAppTheme();
  const { bundle, loading, saving, handleSavePrivacyNoticeSettings, notify } = useChatbotConfig();
  const { t } = useTranslation();
  const [draft, setDraft] = useState<PrivacyNoticeSettings | null>(null);
  const [phraseDraft, setPhraseDraft] = useState('');

  useEffect(() => {
    if (bundle?.privacyNoticeSettings) {
      setDraft({
        ...bundle.privacyNoticeSettings,
        linkPhrases: [...bundle.privacyNoticeSettings.linkPhrases],
      });
      setPhraseDraft('');
    }
  }, [bundle?.privacyNoticeSettings]);

  const dirty =
    draft && bundle
      ? JSON.stringify(draft) !== JSON.stringify(bundle.privacyNoticeSettings)
      : false;

  const config = bundle?.chatWidgetConfig;
  const customization = bundle?.chatWidgetCustomization;
  const formDisabled = loading || saving;
  const atPhraseLimit = (draft?.linkPhrases.length ?? 0) >= PRIVACY_NOTICE_LINK_PHRASES_MAX;

  const validationError = useMemo(() => {
    if (!draft) return null;
    const kind = validatePrivacyNoticeForEnable(draft);
    if (kind === 'content') return t('chatbot.privacyNotice.validation.content');
    if (kind === 'url') return t('chatbot.privacyNotice.validation.url');
    return null;
  }, [draft, t]);

  const addPhrase = () => {
    const phrase = phraseDraft.trim();
    if (!draft || !phrase || atPhraseLimit) return;
    if (!draft.content.includes(phrase)) {
      notify(t('chatbot.privacyNotice.linkPhrases.notInContent'), 'error');
      return;
    }
    if (draft.linkPhrases.includes(phrase)) {
      setPhraseDraft('');
      return;
    }
    setDraft({
      ...draft,
      linkPhrases: [...draft.linkPhrases, phrase],
    });
    setPhraseDraft('');
  };

  const removePhrase = (phrase: string) => {
    setDraft((prev) =>
      prev ? { ...prev, linkPhrases: prev.linkPhrases.filter((p) => p !== phrase) } : prev,
    );
  };

  const onSave = async () => {
    if (!draft) return;
    if (validationError) {
      notify(validationError, 'error');
      return;
    }
    await handleSavePrivacyNoticeSettings(draft);
  };

  if (loading && !bundle?.privacyNoticeSettings) {
    return (
      <View style={[styles.loadingWrap, { gap: spacing.sm }]}>
        <Text style={[typography.body, { color: colors.textMuted }]}>
          {t('chatbot.privacyNotice.loading')}
        </Text>
      </View>
    );
  }

  return (
    <StatePanel
      isEmpty={!draft || !config || !customization}
      emptyLabel={t('chatbot.privacyNotice.unavailable')}
    >
      {draft && config && customization ? (
        <ChatbotConfigPreviewLayout
          preview={
            <ChatWidgetPreview
              config={config}
              customization={customization}
              avatarOptions={bundle?.avatarOptions}
              faqSettings={bundle?.faqSettings}
              privacyNoticeSettings={draft}
            />
          }
          form={
            <SearchConfigPanelCard
              icon={ScrollText}
              title={t('chatbot.privacyNotice.title')}
              subtitle={t('chatbot.privacyNotice.description')}
            >
              <View style={{ gap: spacing.md }}>
                <AppSwitchRow
                  bordered={false}
                  label={t('chatbot.privacyNotice.enable.label')}
                  description={t('chatbot.privacyNotice.enable.helper')}
                  value={draft.enabled}
                  disabled={formDisabled}
                  onChange={(enabled) => setDraft((prev) => (prev ? { ...prev, enabled } : prev))}
                />

                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.fieldLabel, { color: colors.text }]}>
                    {t('chatbot.privacyNotice.content.label')}
                  </Text>
                  <TextInput
                    value={draft.content}
                    editable={!formDisabled}
                    maxLength={PRIVACY_NOTICE_CONTENT_MAX}
                    multiline
                    numberOfLines={4}
                    onChangeText={(content) =>
                      setDraft((prev) => (prev ? { ...prev, content } : prev))
                    }
                    placeholder={t('chatbot.privacyNotice.content.placeholder')}
                    placeholderTextColor={colors.textMuted}
                    style={[
                      styles.textarea,
                      getInputTextStyle(typography.fieldInput, {
                        multiline: true,
                      }),
                      {
                        color: colors.text,
                        borderColor: colors.border,
                        backgroundColor: colors.surface,
                        borderRadius: surfaceRadius.input ?? radius.sm,
                        minHeight: 96,
                      },
                    ]}
                  />
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {t('chatbot.privacyNotice.content.counter', {
                      count: draft.content.length,
                      max: PRIVACY_NOTICE_CONTENT_MAX,
                    })}
                  </Text>
                </View>

                <AppTextField
                  label={t('chatbot.privacyNotice.url.label')}
                  value={draft.url}
                  editable={!formDisabled}
                  maxLength={PRIVACY_NOTICE_URL_MAX}
                  onChangeText={(url) => setDraft((prev) => (prev ? { ...prev, url } : prev))}
                  placeholder={t('chatbot.privacyNotice.url.placeholder')}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="url"
                />

                <View style={{ gap: spacing.xs }}>
                  <Text style={[typography.fieldLabel, { color: colors.text }]}>
                    {t('chatbot.privacyNotice.linkPhrases.label')}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {t('chatbot.privacyNotice.linkPhrases.helper', {
                      max: PRIVACY_NOTICE_LINK_PHRASES_MAX,
                    })}
                  </Text>
                  <View style={[styles.phraseRow, { gap: spacing.sm }]}>
                    <TextInput
                      value={phraseDraft}
                      editable={!formDisabled && !atPhraseLimit}
                      onChangeText={setPhraseDraft}
                      onSubmitEditing={addPhrase}
                      placeholder={t('chatbot.privacyNotice.linkPhrases.placeholder')}
                      placeholderTextColor={colors.textMuted}
                      style={[
                        styles.phraseInput,
                        getInputTextStyle(typography.fieldInput),
                        {
                          color: colors.text,
                          borderColor: colors.border,
                          backgroundColor: colors.surface,
                          borderRadius: surfaceRadius.input ?? radius.sm,
                          minHeight: SEARCH_CONFIG_TOUCH_MIN,
                        },
                      ]}
                    />
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('chatbot.privacyNotice.linkPhrases.add')}
                      disabled={formDisabled || atPhraseLimit || !phraseDraft.trim()}
                      onPress={addPhrase}
                      style={({ pressed, hovered }) => [
                        styles.addBtn,
                        {
                          backgroundColor: colors.primary,
                          opacity:
                            formDisabled || atPhraseLimit || !phraseDraft.trim()
                              ? 0.5
                              : pressed
                                ? 0.88
                                : hovered
                                  ? 0.94
                                  : 1,
                          borderRadius: surfaceRadius.button ?? radius.sm,
                          minHeight: SEARCH_CONFIG_TOUCH_MIN,
                        },
                      ]}
                    >
                      <Text style={{ color: colors.textOnPrimary, fontWeight: '600' }}>
                        {t('chatbot.privacyNotice.linkPhrases.add')}
                      </Text>
                    </Pressable>
                  </View>
                  {draft.linkPhrases.length ? (
                    <View style={[styles.chips, { gap: spacing.xs }]}>
                      {draft.linkPhrases.map((phrase) => (
                        <Pressable
                          key={phrase}
                          accessibilityRole="button"
                          accessibilityLabel={t('chatbot.privacyNotice.linkPhrases.removeA11y', {
                            phrase,
                          })}
                          disabled={formDisabled}
                          onPress={() => removePhrase(phrase)}
                          style={({ pressed, hovered }) => [
                            styles.chip,
                            {
                              borderColor: colors.border,
                              backgroundColor: colors.surfaceMuted,
                              borderRadius: 999,
                              opacity: pressed ? 0.85 : hovered ? 0.92 : 1,
                            },
                          ]}
                        >
                          <Text style={{ color: colors.text, fontSize: 13 }}>{phrase}</Text>
                          <X size={14} color={colors.textMuted} />
                        </Pressable>
                      ))}
                    </View>
                  ) : null}
                  {atPhraseLimit ? (
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {t('chatbot.privacyNotice.linkPhrases.limitReached', {
                        max: PRIVACY_NOTICE_LINK_PHRASES_MAX,
                      })}
                    </Text>
                  ) : null}
                </View>

                <AppSwitchRow
                  bordered={false}
                  label={t('chatbot.privacyNotice.underline.label')}
                  description={t('chatbot.privacyNotice.underline.helper')}
                  value={draft.underlineLinks}
                  disabled={formDisabled}
                  onChange={(underlineLinks) =>
                    setDraft((prev) => (prev ? { ...prev, underlineLinks } : prev))
                  }
                />

                <SearchConfigSaveButton
                  label={t('chatbot.privacyNotice.save')}
                  disabled={!dirty || formDisabled || Boolean(validationError)}
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
    paddingVertical: 24,
  },
  textarea: {
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
    textAlignVertical: 'top',
  },
  phraseRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  phraseInput: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
  },
  addBtn: {
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
});
