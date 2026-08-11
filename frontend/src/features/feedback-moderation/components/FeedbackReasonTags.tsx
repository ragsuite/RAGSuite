import React from 'react';
import { StyleSheet, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import { formatFeedbackReasonKey } from '@/features/feedback-moderation/utils/feedback-reason-labels';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  tags: string[];
  wrap?: boolean;
};

export function FeedbackReasonTags({ tags, wrap = true }: Props) {
  const { spacing } = useAppTheme();
  if (tags.length === 0) return null;

  return (
    <View style={[styles.row, wrap ? styles.wrap : null, { gap: spacing.xs }]}>
      {tags.map((tag) => (
        <CrawlStatusBadge key={tag} label={formatFeedbackReasonKey(tag)} tone="muted" preserveCase />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wrap: {
    flexWrap: 'wrap',
  },
});
