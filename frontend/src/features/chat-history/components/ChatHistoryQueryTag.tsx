import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { ChatQueryTagTone } from '@/features/chat-history/types/chat-history.types';
import { tagToneColors } from '@/features/chat-history/utils/chat-history-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  label: string;
  tone: ChatQueryTagTone;
};

const TAG_LABEL_KEYS: Record<ChatQueryTagTone, string> = {
  greeting: 'history.status.greeting_default',
  failed: 'history.tag.failed',
  high: 'history.confidence.short.high',
  medium: 'history.confidence.short.medium',
  low: 'history.confidence.short.low',
};

export function ChatHistoryQueryTag({ label, tone }: Props) {
  const { t } = useTranslation();
  const { mode, typography, radius } = useAppTheme();
  const colors = tagToneColors(tone, mode);
  const displayLabel = TAG_LABEL_KEYS[tone] ? t(TAG_LABEL_KEYS[tone]) : label;

  return (
    <View style={[styles.tag, { backgroundColor: colors.background, borderRadius: radius.pill }]}>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{displayLabel}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
});
