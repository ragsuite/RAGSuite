import { useRouter } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppChatWidget } from '@/features/app-chat-widget/providers/app-chat-widget-provider';
import { useTranslation } from '@/i18n';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { AppButton } from '@/shared/components/app-button';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

type TourStep = {
  id: string;
  titleKey: string;
  contentKey: string;
  actionKey?: string;
  onAction?: () => void;
};

type Props = {
  visible: boolean;
  onComplete: () => void;
  onSkip: () => void;
};

export function OnboardingTourModal({ visible, onComplete, onSkip }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const { colors, spacing, typography } = useAppTheme();
  const { openCommandPalette, openNotificationsPanel } = useAppShell();
  const { open: openChatWidget } = useAppChatWidget();
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo<TourStep[]>(
    () => [
      {
        id: 'welcome',
        titleKey: 'tour.steps.welcome.title',
        contentKey: 'tour.steps.welcome.content',
      },
      {
        id: 'sidebar',
        titleKey: 'tour.steps.sidebar.title',
        contentKey: 'tour.steps.sidebar.content',
      },
      {
        id: 'search',
        titleKey: 'tour.steps.search.title',
        contentKey: 'tour.steps.search.content',
        actionKey: 'tour.steps.search.action',
        onAction: openCommandPalette,
      },
      {
        id: 'notifications',
        titleKey: 'tour.steps.notifications.title',
        contentKey: 'tour.steps.notifications.content',
        actionKey: 'tour.steps.notifications.action',
        onAction: openNotificationsPanel,
      },
      {
        id: 'crawl',
        titleKey: 'tour.steps.crawlSources.title',
        contentKey: 'tour.steps.crawlSources.content',
        actionKey: 'tour.completeAction',
        onAction: () => router.push('/(app)/(tabs)/crawl-management?segment=domain'),
      },
      {
        id: 'documents',
        titleKey: 'tour.steps.documents.title',
        contentKey: 'tour.steps.documents.content',
        actionKey: 'tour.completeAction',
        onAction: () => router.push('/(app)/(tabs)/crawl-management?segment=document'),
      },
      {
        id: 'widget',
        titleKey: 'tour.steps.widget.title',
        contentKey: 'tour.steps.widget.content',
        actionKey: 'tour.steps.widget.action',
        onAction: () => {
          setStepIndex(0);
          onComplete();
          openChatWidget();
        },
      },
    ],
    [onComplete, openChatWidget, openCommandPalette, openNotificationsPanel, router],
  );

  if (!visible) return null;

  const step = steps[stepIndex];
  const isLast = stepIndex >= steps.length - 1;
  const shortcut = t('tour.shortcut');

  const goNext = () => {
    if (isLast) {
      onComplete();
      setStepIndex(0);
      return;
    }
    setStepIndex((prev) => prev + 1);
  };

  const handleSkip = () => {
    setStepIndex(0);
    onSkip();
  };

  return (
    <AdaptiveOverlay
      visible={visible}
      title={t(step.titleKey, { brand: BRANDING_DEFAULTS.orgName })}
      size="default"
      presentation="dialog"
      showCloseButton={false}
      onClose={handleSkip}
      scrollable={false}
      footer={
        <View style={styles.primaryActions}>
          <AppButton label={t('tour.skip')} size="compact" variant="ghost" onPress={handleSkip} />
          <AppButton label={isLast ? t('tour.finish') : t('common.next')} size="compact" onPress={goNext} />
        </View>
      }>
      <View style={{ gap: spacing.md }}>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('tour.stepLabel', { current: stepIndex + 1, total: steps.length })}
        </Text>
        <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>
          {t(step.contentKey, { shortcut, brand: BRANDING_DEFAULTS.orgName })}
        </Text>
        {step.onAction && step.actionKey ? (
          <AppButton
            label={t(step.actionKey)}
            size="compact"
            variant="outline"
            onPress={() => {
              step.onAction?.();
            }}
          />
        ) : null}
      </View>
    </AdaptiveOverlay>
  );
}

const styles = StyleSheet.create({
  primaryActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
});
