import { CheckCircle2, ChevronRight, Flag, ThumbsDown, ThumbsUp } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FeedbackReasonTags } from '@/features/feedback-moderation/components/FeedbackReasonTags';
import type { FeedbackListItem } from '@/features/feedback-moderation/types/feedback-moderation.types';
import {
  feedbackMessageTypeLabel,
  formatFeedbackLatencyMs,
  formatFeedbackTimestamp,
} from '@/features/feedback-moderation/utils/feedback-display';
import { formatAssistantPreviewForList } from '@/features/feedback-moderation/utils/feedback-text';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  item: FeedbackListItem;
  selected?: boolean;
  variant?: 'list' | 'card';
  onPress: (item: FeedbackListItem) => void;
};

export function FeedbackEntryRow({ item, selected = false, variant = 'card', onPress }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const isCard = variant === 'card';
  const positive = item.vote === 'positive';
  const VoteIcon = positive ? ThumbsUp : ThumbsDown;
  const voteBg = positive ? colors.success : colors.danger;
  const preview = formatAssistantPreviewForList(item.assistantPreview);

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.userMessage}, ${item.vote} feedback`}
      onPress={() => onPress(item)}
      style={({ pressed, hovered }) => [
        isCard ? styles.card : styles.listRow,
        isCard ? elevation.card : null,
        {
          minHeight: CRAWL_MOBILE_TOUCH_MIN,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: isCard ? panelRadius : 0,
            backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.md,
        },
      ]}>
      <View style={[styles.topRow, { gap: spacing.sm }]}>
        <View style={[styles.voteIconWrap, { backgroundColor: voteBg, borderRadius: surfaceRadius.button }]}>
          <VoteIcon size={18} color={colors.textOnPrimary} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]} numberOfLines={2}>
            {item.userMessage}
          </Text>
        </View>
        <ChevronRight size={18} color={colors.textMuted} />
      </View>

      {preview ? (
        <Text
          style={[
            typography.body,
            styles.preview,
            { color: colors.textMuted, lineHeight: 20, marginTop: spacing.sm },
          ]}
          numberOfLines={2}>
          {preview}
        </Text>
      ) : null}

      {item.contextTags.length > 0 ? (
        <View style={{ marginTop: spacing.sm }}>
          <FeedbackReasonTags tags={item.contextTags} />
        </View>
      ) : null}

      <View style={[styles.metaRow, { gap: spacing.xs, marginTop: spacing.sm }]}>
        <Text style={[typography.caption, styles.metaText, { color: colors.textMuted }]}>
          {formatFeedbackTimestamp(item.createdAt)}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <View
          style={[
            styles.messageTypeChip,
            {
              borderRadius: surfaceRadius.card,
              backgroundColor: colors.surfaceMuted,
            },
          ]}>
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {feedbackMessageTypeLabel(item.messageType)}
          </Text>
        </View>
        <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
        <Text style={[typography.caption, styles.metaText, { color: colors.textMuted }]}>
          {formatFeedbackLatencyMs(item.totalMs)}
        </Text>
        {item.confidenceLabel ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
            <View
              style={[
                styles.confidenceChip,
                {
                  borderRadius: surfaceRadius.card,
                  backgroundColor: colors.surfaceMuted,
                },
              ]}>
              <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
                {item.confidenceLabel}
              </Text>
            </View>
          </>
        ) : null}
        {item.llmModel ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
            <Text style={[typography.caption, styles.metaText, { color: colors.textMuted }]} numberOfLines={1}>
              {item.llmModel}
            </Text>
          </>
        ) : null}
        {item.flagged ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
            <View style={[styles.statusChip, { gap: 4 }]}>
              <Flag size={12} color={colors.danger} />
              <Text style={[typography.caption, { color: colors.danger, fontWeight: '500' }]}>
                {t('feedbackModeration.flagged')}
              </Text>
            </View>
          </>
        ) : null}
        {item.reviewed ? (
          <>
            <Text style={[typography.caption, { color: colors.textMuted }]}>·</Text>
            <View style={[styles.statusChip, { gap: 4 }]}>
              <CheckCircle2 size={12} color={colors.success} />
              <Text style={[typography.caption, { color: colors.success, fontWeight: '500' }]}>
                {t('feedbackModeration.reviewed')}
              </Text>
            </View>
          </>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  listRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  card: {
    borderWidth: 1,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  voteIconWrap: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  preview: {},
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  metaText: {
    fontWeight: '500',
    fontSize: 11,
  },
  confidenceChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  messageTypeChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
