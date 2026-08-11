import { Power } from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, Switch, Text, TextInput, View } from 'react-native';

import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchConfigSaveButton } from '@/features/search-config/components/SearchConfigSaveButton';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';
import { ActionIcons } from '@/shared/constants/action-icons';

export function TrainingActiveConfigPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const inputRadius = surfaceRadius.input;
  const { isCompact } = useChatbotConfigLayout();
  const { bundle, saving, handleSaveActiveConfig, handleSaveSystemPrompt } = useChatbotConfig();
  const { syncFromBundle } = useAppChatWidget();
  const config = bundle?.activeConfig;
  const [active, setActive] = useState(false);
  const [prompt, setPrompt] = useState('');

  useEffect(() => {
    if (config) {
      setActive(config.chatbotActive);
      setPrompt(config.systemPrompt);
    }
  }, [config]);

  const promptDirty = useMemo(
    () => Boolean(config && prompt !== config.systemPrompt),
    [config, prompt],
  );
  const showDefaultBadge = config?.systemPromptIsDefault === true;
  const showUnsavedBadge = promptDirty && !showDefaultBadge;
  const canSavePrompt = Boolean(config) && (showDefaultBadge || promptDirty) && !saving;

  const onActiveChange = (chatbotActive: boolean) => {
    setActive(chatbotActive);
    if (bundle?.chatWidgetConfig && bundle?.chatWidgetCustomization) {
      syncFromBundle({
        config: bundle.chatWidgetConfig,
        customization: bundle.chatWidgetCustomization,
        collectFeedback: bundle.feedbackSettings.collectFeedback,
        chatbotActive,
        avatarOptions: bundle.avatarOptions,
      });
    }
    void handleSaveActiveConfig({ chatbotActive });
  };

  return (
    <StatePanel isEmpty={!config} emptyLabel={t('chatbot.training.activeConfig.unavailable')}>
      {config ? (
        <View style={{ gap: spacing.sm }}>
          <SearchConfigPanelCard
            icon={Power}
            title={t('chatbot.config.activeStatus.title')}
            subtitle={t('chatbot.config.activeStatus.description')}>
            <View style={styles.statusRow}>
              <View style={{ flex: 1, gap: spacing.xxs }}>
                <Text style={[typography.fieldLabel, { color: colors.text }]}>
                  {t('chatbot.config.activeStatus.label')}
                </Text>
                <Text style={[typography.body, { color: colors.textMuted }]}>
                  {active
                    ? t('chatbot.config.activeStatus.activeDescription')
                    : t('chatbot.config.activeStatus.inactiveDescription')}
                </Text>
                <StatusBadge
                  label={
                    active
                      ? t('chatbot.config.activeStatus.activeBadge')
                      : t('chatbot.training.activeStatus.inactive')
                  }
                  tone={active ? 'active' : 'inactive'}
                  preserveCase
                />
              </View>
              <Switch
                accessibilityLabel="Chatbot active"
                value={active}
                disabled={saving}
                onValueChange={onActiveChange}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor={colors.surface}
              />
            </View>
          </SearchConfigPanelCard>

          <SearchConfigPanelCard
            icon={ActionIcons.edit}
            title={t('chatbot.prompt.title')}
            subtitle={t('chatbot.prompt.description')}>
            <View style={{ gap: spacing.sm }}>
              {showDefaultBadge || showUnsavedBadge ? (
                <View style={[styles.promptLabelRow, { gap: spacing.xs }]}>
                  {showDefaultBadge ? (
                    <View
                      style={[
                        styles.promptBadge,
                        { borderRadius: controlRadius, borderColor: colors.border, backgroundColor: colors.surfaceMuted },
                      ]}>
                      <Text style={[typography.caption, { color: colors.textMuted }]}>
                        {t('chatbot.prompt.defaultBadge')}
                      </Text>
                    </View>
                  ) : null}
                  {showUnsavedBadge ? (
                    <View
                      style={[
                        styles.promptBadge,
                        { borderRadius: controlRadius, borderColor: colors.warning, backgroundColor: colors.ochreTint },
                      ]}>
                      <Text style={[typography.caption, { color: colors.warning, fontWeight: '500' }]}>
                        {t('chatbot.prompt.unsavedBadge')}
                      </Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
              <Text style={[typography.fieldLabel, { color: colors.text }]}>
                {t('chatbot.prompt.label')}
              </Text>
              <TextInput
                accessibilityLabel={t('chatbot.prompt.label')}
                value={prompt}
                multiline
                onChangeText={setPrompt}
                placeholder={t('chatbot.prompt.placeholder')}
                placeholderTextColor={colors.textMuted}
                textAlignVertical="top"
                style={[
                  getInputTextStyle(typography.fieldInput, { multiline: true }),
                  styles.promptInput,
                  {
                    minHeight: isCompact ? 140 : 180,
                    color: colors.text,
                    borderColor: colors.border,
                    borderRadius: inputRadius,
                    backgroundColor: colors.surface,
                  },
                ]}
              />
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t('chatbot.prompt.helper')}
              </Text>
              <SearchConfigSaveButton
                label={t('chatbot.prompt.save')}
                disabled={!canSavePrompt}
                loading={saving}
                onPress={() => void handleSaveSystemPrompt(prompt)}
              />
            </View>
          </SearchConfigPanelCard>
        </View>
      ) : null}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  promptLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  promptBadge: { borderWidth: 1, paddingHorizontal: 8, paddingVertical: 2 },
  promptInput: {
    borderWidth: 1,
    width: '100%',
  },
});
