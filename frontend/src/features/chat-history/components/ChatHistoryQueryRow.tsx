import { ChevronRight, Clock, MessageSquare, Timer } from 'lucide-react-native';
import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ChatHistoryQueryTag } from '@/features/chat-history/components/ChatHistoryQueryTag';
import type { ChatQueryListItem } from '@/features/chat-history/types/chat-history.types';
import {
  formatLatencyMs,
  formatQueryTimestamp,
} from '@/features/chat-history/utils/chat-history-display';
import { useChatHistoryLayout } from '@/features/chat-history/utils/chat-history-layout';
import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  item: ChatQueryListItem;
  variant?: 'list' | 'card';
  selected?: boolean;
  onPress: (item: ChatQueryListItem) => void;
};

export function ChatHistoryQueryRow({ item, variant = 'list', selected = false, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const { isRowCompact } = useChatHistoryLayout();
  const isCard = variant === 'card';
  const isReferenceList = !isCard;
  const stackTrailing = isCard || isRowCompact;
  const answerPreview = item.answerPreview || t('history.noResponse');

  if (isReferenceList) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.question}, ${formatQueryTimestamp(item.createdAt)}`}
        onPress={() => onPress(item)}
        style={({ pressed, hovered }) => [
          styles.listRow,
          {
            backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            borderBottomColor: colors.border,
            ...(selected
              ? { borderLeftWidth: 3, borderLeftColor: colors.primary }
              : { borderLeftWidth: 0 }),
          },
        ]}>
        <Text
          style={[
            typography.body,
            styles.questionText,
            { color: colors.text, fontWeight: '500', fontSize: 15, lineHeight: 20, marginBottom: 2 },
          ]}
          numberOfLines={2}>
          {item.question}
        </Text>
        <Text
          style={[
            typography.caption,
            { color: colors.textMuted, lineHeight: 18, marginBottom: 2, fontSize: 13 },
          ]}
          numberOfLines={1}>
          {answerPreview}
        </Text>
        <Text style={[typography.caption, { color: colors.textMuted, fontSize: 12 }]}>
          {formatQueryTimestamp(item.createdAt)} — {formatLatencyMs(item.latencyMs)}
        </Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${item.question}, ${formatQueryTimestamp(item.createdAt)}`}
      onPress={() => onPress(item)}
      style={({ pressed, hovered }) => [
        styles.card,
        elevation.card,
        {
          minHeight: CRAWL_MOBILE_TOUCH_MIN,
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: panelRadius,
          backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
      ]}>
      <View
        style={[
          styles.topRow,
          {
            gap: spacing.sm,
            marginBottom: spacing.xs,
            flexDirection: stackTrailing ? 'column' : 'row',
            alignItems: stackTrailing ? 'stretch' : 'flex-start',
          },
        ]}>
        <View style={[styles.questionRow, { gap: spacing.xs }]}>
          <MessageSquare size={16} color={colors.primary} style={styles.questionIcon} />
          <Text
            style={[
              typography.body,
              styles.questionText,
              { color: colors.text, fontWeight: '500', fontSize: 15, lineHeight: 20 },
            ]}
            numberOfLines={2}>
            {item.question}
          </Text>
        </View>
        <View
          style={[
            styles.trailing,
            { gap: spacing.xs },
            stackTrailing ? styles.trailingStacked : null,
          ]}>
          <ChatHistoryQueryTag label={item.tagLabel} tone={item.tagTone} />
          <ChevronRight size={18} color={colors.textMuted} />
        </View>
      </View>

      <View
        style={[
          styles.answerPreview,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: colors.surfaceMuted,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            marginBottom: spacing.xs,
          },
        ]}>
        <Text
          style={[typography.caption, { color: colors.textMuted, lineHeight: 18, fontSize: 13 }]}
          numberOfLines={isRowCompact ? 2 : 1}>
          {answerPreview}
        </Text>
      </View>

      <View style={[styles.metaRow, { gap: spacing.md }]}>
        <View style={[styles.metaItem, { gap: 4, flex: isRowCompact ? 1 : undefined, minWidth: 0 }]}>
          <Clock size={14} color={colors.textMuted} />
          <Text
            style={[typography.caption, { color: colors.textMuted, fontWeight: '500', flexShrink: 1 }]}
            numberOfLines={1}>
            {formatQueryTimestamp(item.createdAt)}
          </Text>
        </View>
        <View style={[styles.metaItem, { gap: 4 }]}>
          <Timer size={14} color={colors.textMuted} />
          <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500' }]}>
            {formatLatencyMs(item.latencyMs)}
          </Text>
        </View>
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
  topRow: {},
  questionRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  questionIcon: {
    marginTop: Platform.OS === 'web' ? 2 : 3,
    flexShrink: 0,
  },
  questionText: {
    flex: 1,
    minWidth: 0,
  },
  trailing: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  trailingStacked: {
    justifyContent: 'space-between',
    width: '100%',
  },
  answerPreview: {},
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
