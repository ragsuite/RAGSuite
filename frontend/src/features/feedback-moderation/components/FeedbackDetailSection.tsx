import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  title: string;
  /** Control placed right after the title (e.g. an InfoHintButton). */
  titleAccessory?: React.ReactNode;
  /** Control aligned to the right end of the title row (e.g. a status chip). */
  titleRight?: React.ReactNode;
  children: React.ReactNode;
};

export function FeedbackDetailSection({ title, titleAccessory, titleRight, children }: Props) {
  const { isNativeMobile } = useFeedbackLayout();
  const { typography, colors, spacing } = useAppTheme();

  if (isNativeMobile) {
    const right =
      titleAccessory || titleRight ? (
        <View style={[styles.row, { gap: spacing.xs }]}>
          {titleAccessory}
          {titleRight}
        </View>
      ) : undefined;
    return (
      <SectionCard title={title} titleRight={right}>
        {children}
      </SectionCard>
    );
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <View style={[styles.row, { gap: spacing.sm }]}>
        <View style={[styles.row, styles.titleGroup, { gap: spacing.xxs }]}>
          <Text accessibilityRole="header" style={[typography.cardTitle, { color: colors.text }]}>
            {title}
          </Text>
          {titleAccessory}
        </View>
        {titleRight}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  titleGroup: {
    flex: 1,
    minWidth: 0,
  },
});
