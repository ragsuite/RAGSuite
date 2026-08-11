import { X } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { FeedbackDetailContent } from '@/features/feedback-moderation/components/FeedbackDetailContent';
import { useFeedbackDetail } from '@/features/feedback-moderation/hooks/useFeedbackDetail';
import type { FeedbackListItem } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { useFeedbackLayout } from '@/features/feedback-moderation/utils/feedback-layout';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  feedbackId: string | null;
  preview?: FeedbackListItem | null;
  onClose: () => void;
  onModerationSaved?: (id: string, patch: { reviewed: boolean; flagged: boolean }) => void;
};

export function FeedbackDetailPanel({ feedbackId, onClose, onModerationSaved }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const toast = useStableToast();
  const { isDetailFullScreen } = useFeedbackLayout();
  const { detail, loading, error, reload, setDetail } = useFeedbackDetail(feedbackId ?? undefined);

  const onNotify = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      toast({ description: message, variant: type });
    },
    [toast],
  );

  if (!feedbackId) return null;

  const panelPadding = isDetailFullScreen ? spacing.sm : spacing.md;

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: panelPadding,
            paddingVertical: spacing.sm,
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={styles.headerRow}>
          <View style={[styles.headerText, { gap: spacing.xxs }]}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text, fontSize: isDetailFullScreen ? 17 : 18 },
              ]}
              numberOfLines={1}>
              {t('feedbackModeration.detail.title')}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {t('feedbackModeration.detail.subtitle')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <X size={18} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <AppScrollView
        style={styles.scroll}
        scrollbarVariant="overlay"
        contentContainerStyle={{
          paddingHorizontal: panelPadding,
          paddingTop: spacing.sm,
          paddingBottom: spacing.lg,
        }}
        keyboardShouldPersistTaps="handled">
        <StatePanel loading={loading && !detail} error={error} onRetry={() => void reload()}>
          {detail ? (
            <FeedbackDetailContent
              detail={detail}
              onDetailChange={(next) => {
                setDetail(next);
                onModerationSaved?.(next.id, { reviewed: next.reviewed, flagged: next.flagged });
              }}
              onNotify={onNotify}
            />
          ) : null}
        </StatePanel>
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  header: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
});
