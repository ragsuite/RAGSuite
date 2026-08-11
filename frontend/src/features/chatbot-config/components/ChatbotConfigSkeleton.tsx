import React from 'react';
import { StyleSheet, View } from 'react-native';

import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Variant = 'main' | 'detail' | 'history-list';

type Props = {
  variant?: Variant;
};

function SkeletonBlock({ height, width, radius: blockRadius }: { height: number; width: number | `${number}%`; radius: number }) {
  const { colors } = useAppTheme();
  return (
    <View
      style={[styles.block, { height, width, borderRadius: blockRadius, backgroundColor: colors.surfaceMuted }]}
    />
  );
}

export function ChatbotConfigSkeleton({ variant = 'main' }: Props) {
  const { t } = useTranslation();
  const { spacing, radius, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const controlRadius = surfaceRadius.button;
  const { isCompact } = useChatbotConfigLayout();

  if (variant === 'detail') {
    return (
      <View style={{ gap: spacing.md }}>
        <SkeletonBlock height={28} width="55%" radius={controlRadius} />
        <SkeletonBlock height={16} width="80%" radius={controlRadius} />
        <SkeletonBlock height={220} width="100%" radius={panelRadius} />
        <SkeletonBlock height={140} width="100%" radius={panelRadius} />
      </View>
    );
  }

  if (variant === 'history-list') {
    return (
      <View style={{ gap: spacing.md }} accessibilityLabel={t('common.a11y.loadingChatHistory')}>
        <SkeletonBlock height={44} width="100%" radius={controlRadius} />
        <SkeletonBlock height={44} width="100%" radius={controlRadius} />
        <View style={{ gap: spacing.xs }}>
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonBlock key={i} height={72} width="100%" radius={panelRadius} />
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }} accessibilityLabel={t('common.a11y.loadingChatbotConfig')} accessibilityRole="progressbar">
      <SkeletonBlock height={44} width="100%" radius={panelRadius} />
      <SkeletonBlock height={42} width="100%" radius={controlRadius} />
      <View style={{ gap: spacing.sm }}>
        <SkeletonBlock height={20} width="40%" radius={controlRadius} />
        <SkeletonBlock height={14} width="72%" radius={controlRadius} />
      </View>
      {isCompact ? (
        <View style={{ gap: spacing.xs }}>
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
          <SkeletonBlock height={52} width="100%" radius={controlRadius} />
        </View>
      ) : (
        <View style={[styles.split, { gap: spacing.lg }]}>
          <SkeletonBlock height={280} width="100%" radius={panelRadius} />
          <View style={{ flex: 1, gap: spacing.xs }}>
            <SkeletonBlock height={120} width="100%" radius={panelRadius} />
            <SkeletonBlock height={120} width="100%" radius={panelRadius} />
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { opacity: 0.65 },
  split: { flexDirection: 'row', alignItems: 'flex-start' },
});
