import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatHistoryKeyValueTable } from '@/features/chat-history/components/ChatHistoryKeyValueTable';
import { ChatHistoryMarkdownBody } from '@/features/chat-history/components/ChatHistoryMarkdownBody';
import { ChatHistorySourceTraceCard } from '@/features/chat-history/components/ChatHistorySourceTraceCard';
import { ChatHistoryTimingSpans } from '@/features/chat-history/components/ChatHistoryTimingSpans';
import type { ChatQueryDetail } from '@/features/chat-history/types/chat-history.types';
import { formatQueryTimestamp } from '@/features/chat-history/utils/chat-history-display';
import { exportChatQueryMarkdown, buildChatAnswerMarkdownContent } from '@/features/chat-history/utils/chat-history-markdown-export';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import {
  EnterpriseLockedPreview,
  QueryTracingMock,
} from '@/platform/ee-locked';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { copyText } from '@/shared/utils/copy-text';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  detail: ChatQueryDetail;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
};

function DetailSection({
  title,
  subtitle,
  headerRight,
  children,
}: {
  title: string;
  subtitle?: string;
  headerRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, spacing, typography, fonts } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      {headerRight ? (
        <View style={styles.sectionHeaderRow}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
          {headerRight}
        </View>
      ) : (
        <View style={{ gap: subtitle ? spacing.xxs : 0 }}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
          {subtitle ? (
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{subtitle}</Text>
          ) : null}
        </View>
      )}
      {children}
    </View>
  );
}

export function ChatHistoryQueryDetailContent({ detail, onNotify }: Props) {
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces, fonts } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const { t } = useTranslation();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const retrievalMetadata = detail.retrievalMetadata ?? {};
  const parameters = detail.parameters ?? {};
  const sourcesTrace = detail.sourcesTrace ?? [];
  const timingSpans = detail.timingSpans ?? [];

  const showDeepQueryTracing = enterpriseModulesAvailable;
  const hasDeepQueryPayload =
    timingSpans.length > 0 ||
    Object.keys(parameters).length > 0 ||
    Boolean(detail.tokenUsage) ||
    Object.keys(retrievalMetadata).length > 0 ||
    sourcesTrace.length > 0;

  const metadataJson = useMemo(
    () => JSON.stringify(retrievalMetadata, null, 2),
    [retrievalMetadata],
  );

  const parameterRows = useMemo(
    () =>
      Object.entries(parameters).map(([key, value]) => ({
        key,
        value: String(value),
      })),
    [parameters],
  );

  const tokenRows = useMemo(() => {
    if (!detail.tokenUsage) return [];
    return [
      { key: 'prompt_tokens', value: String(detail.tokenUsage.promptTokens ?? '—') },
      { key: 'completion_tokens', value: String(detail.tokenUsage.completionTokens ?? '—') },
      { key: 'total_tokens', value: String(detail.tokenUsage.totalTokens ?? '—') },
    ];
  }, [detail.tokenUsage]);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    onNotify?.(message, type);
  };

  const onCopyAnswer = async () => {
    const ok = await copyText(buildChatAnswerMarkdownContent(detail));
    notify(ok ? t('history.toast.copied') : t('history.toast.copyFailed'), ok ? 'success' : 'error');
  };

  const onExportMarkdown = async () => {
    const ok = await exportChatQueryMarkdown(detail);
    notify(
      ok ? t('history.toast.exportListDone') : t('history.toast.exportListFailed'),
      ok ? 'success' : 'error',
    );
  };

  return (
    <View style={{ gap: spacing.xl }}>
      <DetailSection title={t('history.detail.section.query')}>
        <Text style={[typography.body, { color: colors.text, fontWeight: '500', lineHeight: 22 }]}>
          {detail.question}
        </Text>
      </DetailSection>

      {!showDeepQueryTracing && hasDeepQueryPayload ? (
        <EnterpriseLockedPreview
          featureName={t('enterprise.locked.features.queryTracing', {
            defaultValue: 'Deep query tracing',
          })}
          message={t('enterprise.locked.messages.queryTracing', {
            defaultValue:
              'Deep query tracing and CSV/JSON exports are available in RAGSuite Enterprise.',
          })}
          style={{ minHeight: 340 }}>
          <QueryTracingMock />
        </EnterpriseLockedPreview>
      ) : null}

      {showDeepQueryTracing && timingSpans.length > 0 ? (
        <DetailSection
          title={t('history.detail.section.timings')}
          headerRight={
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
              {t('history.detail.timing.spansTitle', { count: timingSpans.length })}
            </Text>
          }>
          <ChatHistoryTimingSpans spans={timingSpans} />
        </DetailSection>
      ) : null}

      {showDeepQueryTracing && parameterRows.length > 0 ? (
        <DetailSection title={t('history.detail.section.runtime')}>
          <ChatHistoryKeyValueTable rows={parameterRows} />
        </DetailSection>
      ) : null}

      {showDeepQueryTracing && tokenRows.length > 0 ? (
        <DetailSection title={t('history.detail.section.tokens')}>
          <ChatHistoryKeyValueTable rows={tokenRows} />
        </DetailSection>
      ) : null}

      {showDeepQueryTracing && Object.keys(retrievalMetadata).length > 0 ? (
        <DetailSection title={t('history.detail.section.retrievalMeta')}>
          <IntegrationCodeBlock
            code={metadataJson}
            accessibilityLabel={t('history.detail.section.retrievalMeta')}
            onCopy={() =>
              void copyText(metadataJson).then((ok) =>
                notify(ok ? t('history.toast.copied') : t('history.toast.copyFailed'), ok ? 'success' : 'error'),
              )
            }
          />
        </DetailSection>
      ) : null}

      {showDeepQueryTracing && sourcesTrace.length > 0 ? (
        <DetailSection
          title={t('history.detail.section.sources')}
          subtitle={t('history.detail.sourcesRelevanceHint')}>
          <View style={{ gap: spacing.sm }}>
            {sourcesTrace.map((source) => (
              <ChatHistorySourceTraceCard
                key={`${source.index}-${source.document_id}`}
                source={source}
                onNotify={notify}
              />
            ))}
          </View>
        </DetailSection>
      ) : null}

      <View style={{ gap: spacing.sm }}>
        <View style={styles.sectionHeaderRow}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{t('history.detail.section.answer')}</Text>
          <View style={[styles.answerActions, { gap: spacing.xs }]}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('history.detail.copy')}
              onPress={() => void onCopyAnswer()}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  borderColor: colors.border,
                  borderRadius: controlRadius,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <ActionIcons.copy size={14} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{t('history.detail.copy')}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('history.detail.export')}
              onPress={() => void onExportMarkdown()}
              style={({ pressed }) => [
                styles.actionBtn,
                {
                  borderColor: colors.border,
                  borderRadius: controlRadius,
                  backgroundColor: colors.surface,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}>
              <ActionIcons.download size={14} color={colors.textMuted} />
              <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{t('history.detail.export')}</Text>
            </Pressable>
          </View>
        </View>

        <View
          style={[
            styles.answerBox,
            {
              borderColor: colors.border,
              borderRadius: panelRadius,
              backgroundColor: colors.surface,
              padding: spacing.md,
            },
          ]}>
          <ChatHistoryMarkdownBody content={detail.assistantAnswer || t('history.detail.na')} />
        </View>

        <View
          style={[
            styles.metaBox,
            {
              borderColor: colors.border,
              borderRadius: panelRadius,
              backgroundColor: colors.surfaceMuted,
              padding: spacing.md,
              gap: spacing.xs,
            },
          ]}>
          <Text
            style={[
              typography.caption,
              { color: colors.textMuted, fontFamily: fonts.mono, lineHeight: 18 },
            ]}>
            message_id: {detail.messageId}
          </Text>
          <Text
            style={[
              typography.caption,
              { color: colors.textMuted, fontFamily: fonts.mono, lineHeight: 18 },
            ]}>
            session_id: {detail.sessionId}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            {formatQueryTimestamp(detail.createdAt)}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
            {t('history.detail.language')}: {detail.language ?? t('history.detail.na')}
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  answerActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flexShrink: 0,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  answerBox: {
    borderWidth: 1,
    alignSelf: 'stretch',
    width: '100%',
    minWidth: 0,
  },
  metaBox: {
    borderWidth: 1,
  },
});
