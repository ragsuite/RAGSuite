import { ThumbsDown, ThumbsUp } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FeedbackVoteTone } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  vote: FeedbackVoteTone;
  compact?: boolean;
};

export function FeedbackVoteBadge({ vote, compact }: Props) {
  const { t } = useTranslation();
  const { colors, typography, surfaceRadius } = useAppTheme();
  const positive = vote === 'positive';
  const Icon = positive ? ThumbsUp : ThumbsDown;
  const voteColor = positive ? colors.success : colors.danger;
  const voteBg = positive ? colors.primaryTint : colors.dangerBackground;

  return (
    <View
      style={[
        styles.badge,
        compact ? styles.badgeCompact : null,
        {
          borderRadius: surfaceRadius.button,
          backgroundColor: voteBg,
        },
      ]}>
      <Icon size={compact ? 14 : 16} color={voteColor} />
      <Text
        style={[
          typography.caption,
          {
            color: voteColor,
          },
        ]}>
        {positive ? t('feedbackModeration.detail.votePositive') : t('feedbackModeration.detail.voteNegative')}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  badgeCompact: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
});
