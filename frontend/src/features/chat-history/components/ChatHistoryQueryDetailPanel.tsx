import { X } from 'lucide-react-native';
import React, { useCallback } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { ChatHistoryQueryDetailContent } from '@/features/chat-history/components/ChatHistoryQueryDetailContent';
import { useChatQueryDetail } from '@/features/chat-history/hooks/useChatQueryDetail';
import { useChatHistoryLayout } from '@/features/chat-history/utils/chat-history-layout';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useStableToast } from '@/shared/toast/use-toast-ref';

type Props = {
  messageId: string | null;
  onClose: () => void;
};

export function ChatHistoryQueryDetailPanel({ messageId, onClose }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const toast = useStableToast();
  const { isDetailFullScreen } = useChatHistoryLayout();
  const { detail, loading, error, reload } = useChatQueryDetail(messageId ?? undefined);

  const onNotify = useCallback(
    (message: string, type: 'success' | 'error' = 'success') => {
      toast({ description: message, variant: type });
    },
    [toast],
  );

  if (!messageId) return null;

  return (
    <View style={[styles.panel, { backgroundColor: colors.surface }]}>
      <View
        style={[
          styles.header,
          {
            paddingHorizontal: isDetailFullScreen ? spacing.md : spacing.lg,
            paddingTop: spacing.lg,
            paddingBottom: spacing.md,
            borderBottomColor: colors.border,
          },
        ]}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1, gap: spacing.xxs }}>
            <Text
              style={[
                typography.subtitle,
                { color: colors.text, fontSize: isDetailFullScreen ? 17 : 18 },
              ]}
              numberOfLines={2}>
              {t('history.detail.title')}
            </Text>
            <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
              {t('history.detail.subtitle')}
            </Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => [styles.closeBtn, { opacity: pressed ? 0.7 : 1 }]}>
            <X size={22} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>

      <AppScrollView
        style={styles.scroll}
        scrollbarVariant="overlay"
        contentContainerStyle={{
          paddingHorizontal: isDetailFullScreen ? spacing.md : spacing.lg,
          paddingTop: spacing.md,
          paddingBottom: spacing.xl,
        }}
        keyboardShouldPersistTaps="handled">
        <StatePanel loading={loading && !detail} error={error} onRetry={() => void reload()}>
          {detail ? <ChatHistoryQueryDetailContent detail={detail} onNotify={onNotify} /> : null}
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
  headerTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
});
