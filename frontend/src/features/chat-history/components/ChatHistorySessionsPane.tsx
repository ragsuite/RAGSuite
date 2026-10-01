import { MessageSquare } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ChatHistorySessionRow } from '@/features/chat-history/components/ChatHistorySessionRow';
import { SessionEmptyPanel } from '@/features/chat-history/components/SessionEmptyPanel';
import type { HistoryKind, HistorySessionSummaryItem } from '@/features/chat-history/types/chat-history.types';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  items: HistorySessionSummaryItem[];
  loading: boolean;
  emptyLabel: string;
  selectedSessionId: string | null;
  onSelect: (item: HistorySessionSummaryItem) => void;
  kind: HistoryKind;
  listTitleKey?: string;
  /** Kept for callers; description is not rendered in the compact header. */
  listDescriptionKey?: string;
  /** When true, pane fills parent height and list scrolls inside. */
  fillHeight?: boolean;
};

export function ChatHistorySessionsPane({
  items,
  loading,
  emptyLabel,
  selectedSessionId,
  onSelect,
  kind,
  listTitleKey = 'history.sessions.listTitle',
  fillHeight = false,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const showEmails = kind === 'chatbot';
  const count = items.length;

  const sectionHeader = (
    <View
      accessibilityRole="header"
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.xs,
        minHeight: 36,
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.sm,
        backgroundColor: colors.surfaceMuted,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderBottomColor: colors.border,
      }}>
      <Text style={[typography.caption, { color: colors.text, fontWeight: '700', flex: 1 }]}>
        {t(listTitleKey)}
      </Text>
      {count > 0 ? (
        <Text style={[typography.caption, { color: colors.textMuted }]}>{count}</Text>
      ) : null}
    </View>
  );

  if (loading && items.length === 0) {
    return (
      <View style={[fillHeight ? styles.fill : null]}>
        {sectionHeader}
        <View style={[styles.center, { padding: spacing.md }]}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </View>
    );
  }

  if (!loading && items.length === 0) {
    return (
      <View style={[fillHeight ? styles.fill : null]}>
        {sectionHeader}
        <SessionEmptyPanel title={emptyLabel} icon={MessageSquare} compact />
      </View>
    );
  }

  const list = items.map((item) => (
    <ChatHistorySessionRow
      key={item.sessionId}
      item={item}
      selected={selectedSessionId === item.sessionId}
      showTranscriptEmails={showEmails}
      onPress={onSelect}
    />
  ));

  if (!fillHeight) {
    return (
      <View>
        {sectionHeader}
        {list}
      </View>
    );
  }

  return (
    <View style={styles.fill}>
      {sectionHeader}
      <AppScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        nestedScrollEnabled
        scrollbarVariant="overlay">
        {list}
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    minHeight: 0,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  scrollContent: {
    flexGrow: 1,
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
