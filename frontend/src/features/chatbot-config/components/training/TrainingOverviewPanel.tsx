import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Bot } from 'lucide-react-native';

import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { countPromptWords } from '@/features/chatbot-config/utils/training-overview-display';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function TrainingOverviewPanel() {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const { isCompact } = useChatbotConfigLayout();
  const { bundle } = useChatbotConfig();
  const stats = bundle?.trainingStats;
  const promptText = bundle?.activeConfig?.systemPrompt ?? '';
  const promptChars = stats?.systemPromptCharCount ?? promptText.length;
  const promptWords = stats?.systemPromptWordCount ?? countPromptWords(promptText);
  const chatbotActive = stats?.chatbotActive ?? false;
  const conversationCount = stats?.conversationCount ?? 0;
  const messageCount = stats?.totalMessageCount ?? 0;
  const promptLines = isCompact ? 4 : 2;

  return (
    <StatePanel isEmpty={!stats} emptyLabel={t('chatbot.training.overview.unavailable')}>
      {stats ? (
        <SearchConfigPanelCard
          icon={Bot}
          title={t('chatbot.training.preview.title')}
          subtitle={t('chatbot.training.preview.description')}>
          {isCompact ? (
            <View style={{ gap: spacing.sm }}>
              <ActiveStatusCard
                chatbotActive={chatbotActive}
                colors={colors}
                spacing={spacing}
                typography={typography}
                t={t}
              />
              <PromptCard
                promptText={promptText}
                promptChars={promptChars}
                promptWords={promptWords}
                promptLines={promptLines}
                colors={colors}
                spacing={spacing}
                typography={typography}
                t={t}
              />
              <HistoryCard
                conversationCount={conversationCount}
                messageCount={messageCount}
                colors={colors}
                spacing={spacing}
                typography={typography}
                t={t}
              />
            </View>
          ) : (
            <View style={[styles.desktopRow, { gap: spacing.sm }]}>
              <ActiveStatusCard
                chatbotActive={chatbotActive}
                colors={colors}
                spacing={spacing}
                typography={typography}
                desktop
                t={t}
              />
              <PromptCard
                promptText={promptText}
                promptChars={promptChars}
                promptWords={promptWords}
                promptLines={promptLines}
                colors={colors}
                spacing={spacing}
                typography={typography}
                desktop
                t={t}
              />
              <HistoryCard
                conversationCount={conversationCount}
                messageCount={messageCount}
                colors={colors}
                spacing={spacing}
                typography={typography}
                desktop
                t={t}
              />
            </View>
          )}
        </SearchConfigPanelCard>
      ) : null}
    </StatePanel>
  );
}

type CardCommonProps = {
  desktop?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
  typography: ReturnType<typeof useAppTheme>['typography'];
  t: ReturnType<typeof useTranslation>['t'];
};

function TileContainer({
  children,
  desktop,
  colors,
  spacing,
}: {
  children: React.ReactNode;
  desktop?: boolean;
  colors: ReturnType<typeof useAppTheme>['colors'];
  spacing: ReturnType<typeof useAppTheme>['spacing'];
}) {
  const { surfaceRadius } = useAppTheme();

  return (
    <View
      style={[
        styles.previewTile,
        desktop ? styles.desktopGridItem : null,
        {
          borderColor: colors.border,
          backgroundColor: colors.surfaceMuted,
          borderRadius: surfaceRadius.card,
          padding: spacing.sm,
        },
      ]}>
      {children}
    </View>
  );
}

function ActiveStatusCard({
  chatbotActive,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & { chatbotActive: boolean }) {
  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>
        {t('chatbot.training.activeStatus.title')}
      </Text>
      <View style={styles.rowBetween}>
        <Text style={[typography.body, styles.primaryValue, { color: colors.text }]}>
          {chatbotActive ? t('chatbot.training.activeStatus.active') : t('chatbot.training.activeStatus.inactive')}
        </Text>
        <StatusBadge
          label={
            chatbotActive
              ? t('chatbot.training.activeStatus.enabled')
              : t('chatbot.training.activeStatus.disabled')
          }
          tone={chatbotActive ? 'active' : 'inactive'}
          preserveCase
        />
      </View>
      <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, lineHeight: 18 }]}>
        {t('chatbot.training.activeStatus.statusLabel')}{' '}
        {chatbotActive ? t('chatbot.training.activeStatus.live') : t('chatbot.training.activeStatus.offline')}
      </Text>
    </TileContainer>
  );
}

function PromptCard({
  promptText,
  promptChars,
  promptWords,
  promptLines,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & {
  promptText: string;
  promptChars: number;
  promptWords: number;
  promptLines: number;
}) {
  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>{t('chatbot.training.prompt.title')}</Text>
      <Text
        style={[
          typography.caption,
          styles.promptBody,
          {
            color: colors.text,
            marginTop: 2,
            lineHeight: 20,
            fontWeight: '400',
          },
        ]}
        numberOfLines={promptLines}>
        {promptText.trim() || t('chatbot.training.prompt.emptyConfigured')}
      </Text>
      <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('chatbot.training.prompt.length')}</Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
          {t('chatbot.training.prompt.chars', { count: promptChars })}
        </Text>
      </View>
      <View style={[styles.rowBetween, { marginTop: 2 }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>{t('chatbot.training.prompt.words')}</Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{promptWords}</Text>
      </View>
    </TileContainer>
  );
}

function HistoryCard({
  conversationCount,
  messageCount,
  desktop,
  colors,
  spacing,
  typography,
  t,
}: CardCommonProps & { conversationCount: number; messageCount: number }) {
  const { surfaceRadius } = useAppTheme();

  return (
    <TileContainer desktop={desktop} colors={colors} spacing={spacing}>
      <Text style={[typography.panelTileLabel, styles.tileTitle, { color: colors.textSoft }]}>
        {t('chatbot.training.chatHistory.title')}
      </Text>
      <View style={styles.rowBetween}>
        <Text style={[typography.body, styles.primaryValue, { color: colors.text }]}>
          {t('chatbot.training.chatHistory.conversations', { count: conversationCount })}
        </Text>
        <View style={[styles.styleBadge, { borderRadius: surfaceRadius.button, backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
            {t('chatbot.training.chatHistory.total', { count: conversationCount })}
          </Text>
        </View>
      </View>
      <View style={[styles.rowBetween, { marginTop: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('chatbot.training.chatHistory.totalMessages')}
        </Text>
        <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{messageCount}</Text>
      </View>
    </TileContainer>
  );
}

const styles = StyleSheet.create({
  desktopRow: { flexDirection: 'row', alignItems: 'stretch', width: '100%' },
  desktopGridItem: { flex: 1, minWidth: 0 },
  previewTile: {
    minHeight: 98,
    borderWidth: 1,
    gap: 4,
  },
  rowBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    gap: 8,
  },
  styleBadge: { paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1, flexShrink: 0 },
  primaryValue: { fontWeight: '500', lineHeight: 24, flexShrink: 1 },
  tileTitle: { marginBottom: 2 },
  promptBody: { flexShrink: 1 },
});
