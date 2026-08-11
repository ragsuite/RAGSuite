import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { SearchHistoryMessageCard } from '@/features/search-config/components/training/SearchHistoryMessageCard';
import { sortSearchHistoryMessages } from '@/features/search-config/utils/search-history-display';
import type { SearchHistoryEntry } from '@/features/search-config/types/search-config.types';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  messages: SearchHistoryEntry[];
  showHeader?: boolean;
  fullHeight?: boolean;
  onDelete?: () => void;
  onCopy: (text: string) => void;
};

export function SearchHistorySessionDetail({
  messages,
  showHeader = true,
  fullHeight = false,
  onDelete,
  onCopy,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const orderedMessages = sortSearchHistoryMessages(messages);

  return (
    <View
      style={[
        styles.shell,
        fullHeight ? styles.shellFull : null,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: panelRadius,
        },
      ]}>
      {showHeader ? (
        <View
          style={[
            styles.detailHeader,
            {
              borderBottomColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              paddingHorizontal: spacing.sm,
            },
          ]}>
          <View
            style={[
              styles.detailUserAvatar,
              { borderRadius: surfaceRadius.card, backgroundColor: colors.primary },
            ]}>
            <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '500', fontSize: 11 }]}>U</Text>
          </View>
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500', flex: 1, lineHeight: 18 }]}>
            {t('chatbot.history.user')}
          </Text>
          {onDelete ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('search.history.deleteSession.a11y')}
              onPress={onDelete}
              hitSlop={8}>
              <ActionIcons.delete size={15} color={colors.danger} />
            </Pressable>
          ) : null}
        </View>
      ) : null}

      <AppScrollView
        nestedScrollEnabled
        style={[
          styles.detailScroll,
          fullHeight ? styles.detailScrollFull : styles.detailScrollBounded,
          Platform.OS === 'web' ? styles.detailScrollWeb : null,
        ]}
        contentContainerStyle={[
          styles.detailScrollContent,
          { gap: spacing.xxs, padding: spacing.xs, paddingBottom: spacing.xs },
        ]}
        persistentScrollbar={Platform.OS === 'web'}
        keyboardShouldPersistTaps="handled">
        {orderedMessages.map((message) => (
          <SearchHistoryMessageCard
            key={message.id}
            message={message}
            onCopy={onCopy}
          />
        ))}
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: 0,
    flexDirection: 'column',
  },
  shellFull: {
    flex: 1,
    minHeight: 0,
    height: '100%',
  },
  detailHeader: {
    minHeight: 36,
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },
  detailUserAvatar: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScroll: {
    flex: 1,
    minHeight: 0,
  },
  detailScrollFull: {
    flex: 1,
    minHeight: 0,
  },
  detailScrollBounded: {
    maxHeight: 400,
  },
  detailScrollWeb: {
    overflowY: 'auto',
    WebkitOverflowScrolling: 'touch',
  },
  detailScrollContent: {
    flexGrow: 0,
  },
});
