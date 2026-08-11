import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { ChatHistoryMarkdownBody } from '@/features/chat-history/components/ChatHistoryMarkdownBody';
import { FeedbackModerationForm } from '@/features/feedback-moderation/components/FeedbackModerationForm';
import { FeedbackReasonTags } from '@/features/feedback-moderation/components/FeedbackReasonTags';
import { FeedbackSavedModerationTimeline } from '@/features/feedback-moderation/components/FeedbackSavedModerationTimeline';
import { FeedbackVoteBadge } from '@/features/feedback-moderation/components/FeedbackVoteBadge';
import type { FeedbackDetail } from '@/features/feedback-moderation/types/feedback-moderation.types';
import {
  formatFeedbackLatencyMs,
  formatFeedbackTimestamp,
} from '@/features/feedback-moderation/utils/feedback-display';
import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { saveFeedbackModeration } from '@/features/feedback-moderation/services/feedback-moderation.service';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

type Props = {
  detail: FeedbackDetail;
  onDetailChange?: (detail: FeedbackDetail) => void;
  onNotify?: (message: string, type?: 'success' | 'error') => void;
};

function DetailSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const { isNativeMobile } = useFeedbackLayout();
  const { typography, colors, spacing, surfaceRadius } = useAppTheme();
  if (isNativeMobile) {
    return <SectionCard title={title}>{children}</SectionCard>;
  }
  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.cardTitle, { color: colors.text }]}>{title}</Text>
      {children}
    </View>
  );
}

function FieldBlock({ label, children }: { label: string; children: React.ReactNode }) {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { isNativeMobile } = useFeedbackLayout();
  return (
    <View style={{ gap: spacing.xxs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={{
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surfaceMuted,
          padding: isNativeMobile ? spacing.sm : spacing.sm,
        }}>
        {children}
      </View>
    </View>
  );
}

function MetaCell({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  const { colors, typography, spacing, surfaceRadius } = useAppTheme();
  const { isNativeMobile } = useFeedbackLayout();

  return (
    <View
      style={[
        styles.metaCell,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.button,
          backgroundColor: colors.surfaceMuted,
          padding: isNativeMobile ? spacing.sm : spacing.sm,
          minWidth: isNativeMobile ? undefined : 120,
          flex: isNativeMobile ? undefined : 1,
        },
      ]}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          typography.caption,
          {
            color: highlight ? colors.primary : colors.text,
            fontWeight: '500',
          },
        ]}
        numberOfLines={3}>
        {value}
      </Text>
    </View>
  );
}

export function FeedbackDetailContent({ detail, onDetailChange, onNotify }: Props) {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const { isNativeMobile } = useFeedbackLayout();
  const [saving, setSaving] = useState(false);

  const notify = (message: string, type: 'success' | 'error' = 'success') => {
    onNotify?.(message, type);
  };

  const onSaveModeration = async (input: {
    internalNotes: string;
    reviewed: boolean;
    flagged: boolean;
    flagReason?: string;
  }) => {
    setSaving(true);
    try {
      const saved = await saveFeedbackModeration(detail.messageId, input);
      const next: FeedbackDetail = {
        ...detail,
        moderation: saved,
        reviewed: saved.reviewed,
        flagged: saved.flagged,
      };
      onDetailChange?.(next);
      notify(t('feedbackModeration.toast.saved'));
    } catch {
      notify(t('feedbackModeration.toast.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const comment = detail.feedbackText?.trim() ? detail.feedbackText : t('feedbackModeration.detail.noComment');
  const reasonTags = detail.contextTags ?? [];

  const mobileHero = isNativeMobile ? (
    <View
      style={[
        styles.hero,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.sm,
        },
      ]}>
      <FeedbackVoteBadge vote={detail.vote} />
      <Text style={[typography.body, { color: colors.text, fontWeight: '500', lineHeight: 22 }]}>
        {detail.userMessage}
      </Text>
      <View style={[styles.heroMeta, { gap: spacing.xs }]}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {formatFeedbackTimestamp(detail.createdAt)}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {formatFeedbackLatencyMs(detail.totalMs)}
        </Text>
        {detail.confidenceLabel ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
              {detail.confidenceLabel}
            </Text>
          </>
        ) : null}
      </View>
    </View>
  ) : null;

  return (
    <View style={{ gap: isNativeMobile ? spacing.md : spacing.md }}>
      {mobileHero}

      <DetailSection title={t('feedbackModeration.detail.section.conversation')}>
        <View style={{ gap: spacing.sm }}>
          <FieldBlock label={t('feedbackModeration.detail.query')}>
            <Text style={[typography.caption, { color: colors.text, lineHeight: 20 }]}>
              {detail.userMessage}
            </Text>
          </FieldBlock>
          <FieldBlock label={t('feedbackModeration.detail.answer')}>
            <AppScrollView
              nestedScrollEnabled
              style={isNativeMobile ? styles.answerScroll : undefined}
              contentContainerStyle={{ paddingBottom: spacing.xxs }}>
              <ChatHistoryMarkdownBody
                content={detail.assistantResponse || t('history.detail.na')}
                fontSize={13}
                headingFontWeight="600"
                strongFontWeight="600"
              />
            </AppScrollView>
          </FieldBlock>
        </View>
      </DetailSection>

      {detail.sources.length > 0 ? (
        <DetailSection title={t('feedbackModeration.detail.sources')}>
          <View style={{ gap: spacing.xs }}>
            {detail.sources.map((source) => (
              <Pressable
                key={source.url}
                accessibilityRole="link"
                onPress={() => {
                  void openCitationUrl(source.url).catch(() => {});
                }}
                style={({ pressed }) => [
                  styles.sourceRow,
                  {
                    borderColor: colors.border,
                    borderRadius: surfaceRadius.button,
                    backgroundColor: pressed ? colors.surfaceMuted : colors.surfaceMuted,
                    padding: spacing.sm,
                  },
                ]}>
                <Text style={[typography.caption, { color: colors.text }]} numberOfLines={2}>
                  {source.title}
                </Text>
              </Pressable>
            ))}
          </View>
        </DetailSection>
      ) : null}

      <DetailSection title={t('feedbackModeration.detail.ids')}>
        <View style={{ gap: spacing.sm }}>
          <FieldBlock label={t('feedbackModeration.detail.sessionId')}>
            <Text style={[typography.caption, styles.mono, { color: colors.text, fontFamily: fonts.mono }]} selectable>
              {detail.sessionId}
            </Text>
          </FieldBlock>
          <FieldBlock label={t('feedbackModeration.detail.messageId')}>
            <Text style={[typography.caption, styles.mono, { color: colors.text, fontFamily: fonts.mono }]} selectable>
              {detail.messageId}
            </Text>
          </FieldBlock>
        </View>
      </DetailSection>

      <DetailSection title={t('feedbackModeration.detail.userFeedback')}>
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.feedbackRow, { gap: spacing.md }]}>
            <View style={{ gap: spacing.xs }}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t('feedbackModeration.detail.vote')}</Text>
              <FeedbackVoteBadge vote={detail.vote} />
            </View>
            <View
              style={[
                styles.ratingBox,
                {
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.card,
                  backgroundColor: colors.surface,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.textMuted }]}>{t('feedbackModeration.detail.rating')}</Text>
              <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                {detail.feedbackRating}
              </Text>
            </View>
          </View>
          {reasonTags.length > 0 ? <FeedbackReasonTags tags={reasonTags} /> : null}
          <FieldBlock label={t('feedbackModeration.detail.comment')}>
            <Text style={[typography.caption, { color: colors.text, lineHeight: 20 }]}>{comment}</Text>
          </FieldBlock>
          <View style={[styles.metaGrid, isNativeMobile ? styles.metaGridMobile : null, { gap: spacing.sm }]}>
            <MetaCell label={t('feedbackModeration.detail.submittedAt')} value={formatFeedbackTimestamp(detail.createdAt)} />
            <MetaCell label={t('feedbackModeration.detail.responseTime')} value={formatFeedbackLatencyMs(detail.totalMs)} />
            {detail.confidenceLabel ? (
              <MetaCell label={t('feedbackModeration.detail.confidence')} value={detail.confidenceLabel} highlight />
            ) : null}
          </View>
        </View>
      </DetailSection>

      <DetailSection title={t('feedbackModeration.detail.models')}>
        <View style={{ gap: spacing.sm }}>
          <FieldBlock label={t('feedbackModeration.detail.modelLlm')}>
            <Text style={[typography.caption, { color: colors.text }]}>
              {detail.llmModel ?? '—'}
            </Text>
          </FieldBlock>
          <FieldBlock label={t('feedbackModeration.detail.modelEmbedding')}>
            <Text style={[typography.caption, { color: colors.text }]}>
              {detail.embeddingModel ?? '—'}
            </Text>
          </FieldBlock>
        </View>
      </DetailSection>

      <DetailSection title={t('feedbackModeration.detail.section.moderation')}>
        <View style={{ gap: spacing.lg }}>
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{t('feedbackModeration.moderation.savedTitle')}</Text>
            <FeedbackSavedModerationTimeline moderation={detail.moderation} />
          </View>
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{t('feedbackModeration.moderation.updateTitle')}</Text>
            <FeedbackModerationForm
              moderation={detail.moderation}
              saving={saving}
              hideTitle
              onSave={onSaveModeration}
            />
          </View>
        </View>
      </DetailSection>
    </View>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderWidth: 1,
  },
  heroMeta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  answerScroll: {
    maxHeight: 280,
  },
  mono: {
    lineHeight: 18,
  },
  sourceRow: {
    borderWidth: 1,
  },
  feedbackRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flexWrap: 'wrap',
  },
  ratingBox: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minWidth: 72,
    gap: 2,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  metaGridMobile: {
    flexDirection: 'column',
  },
  metaCell: {
    borderWidth: 1,
    gap: 4,
  },
});
