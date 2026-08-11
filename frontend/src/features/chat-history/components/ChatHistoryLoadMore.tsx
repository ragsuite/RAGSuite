import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { CRAWL_MOBILE_TOUCH_MIN } from '@/features/crawl/utils/crawl-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  loadedCount: number;
  total: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
};

export function ChatHistoryLoadMore({ loadedCount, total, hasMore, loadingMore, onLoadMore }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  if (total === 0) return null;

  return (
    <View style={[styles.wrap, { marginTop: spacing.md, gap: spacing.sm, paddingBottom: spacing.xs }]}>
      <Text style={[typography.caption, { color: colors.textMuted, textAlign: 'center', fontWeight: '500' }]}>
        Showing {loadedCount} of {total} queries
      </Text>
      {hasMore ? (
        <Pressable
          onPress={onLoadMore}
          disabled={loadingMore}
          accessibilityRole="button"
          accessibilityLabel={t('history.loadMore')}
          accessibilityState={{ busy: loadingMore }}
          style={({ pressed }) => [
            styles.button,
            {
              minHeight: CRAWL_MOBILE_TOUCH_MIN,
              borderColor: colors.border,
              borderRadius: surfaceRadius.button,
              backgroundColor: pressed || loadingMore ? colors.surfaceMuted : colors.surface,
              opacity: loadingMore ? 0.85 : 1,
            },
          ]}>
          {loadingMore ? (
            <ActivityIndicator color={colors.primary} />
          ) : (
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('history.loadMore')}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: '100%',
    alignItems: 'center',
  },
  button: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
});
