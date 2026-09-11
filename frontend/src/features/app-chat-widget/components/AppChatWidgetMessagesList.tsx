import { Send } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppScrollView } from '@/shared/components/app-scroll-view';

export type AppChatWidgetRecentConversation = {
  title: string;
  preview: string;
  timeLabel: string;
};

type Props = {
  accentColor: string;
  panelBg: string;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  headerBg: string;
  recent: AppChatWidgetRecentConversation | null;
  showClose?: boolean;
  onNewConversation: () => void;
  onOpenRecent: () => void;
  onClose?: () => void;
  closeLabel?: string;
};

export function AppChatWidgetMessagesList({
  accentColor,
  panelBg,
  textColor,
  mutedColor,
  borderColor,
  headerBg,
  recent,
  showClose = false,
  onNewConversation,
  onOpenRecent,
  onClose,
  closeLabel,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: panelBg }]}>
      <View style={[styles.header, { backgroundColor: headerBg }]}>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {t('chatbot.widget.layout2.messages.title')}
        </Text>
        {showClose && onClose ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
            hitSlop={8}
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeBtn,
              { opacity: pressed ? 0.7 : 0.92 },
            ]}
          >
            <Text style={styles.closeGlyph}>×</Text>
          </Pressable>
        ) : null}
      </View>

      <AppScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        scrollbarVariant="overlay"
      >
        <Text style={[styles.sectionTitle, { color: textColor }]}>
          {t('chatbot.widget.layout2.messages.startNewHeading')}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            'chatbot.widget.layout2.messages.newConversation',
          )}
          onPress={onNewConversation}
          style={({ pressed }) => [
            styles.newCard,
            {
              borderColor: accentColor,
              backgroundColor: panelBg,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <View style={styles.newCardText}>
            <Text style={[styles.newTitle, { color: textColor }]}>
              {t('chatbot.widget.layout2.messages.newConversation')}
            </Text>
            <Text style={[styles.newSubtitle, { color: mutedColor }]}>
              {t('chatbot.widget.layout2.messages.replyHint')}
            </Text>
          </View>
          <Send size={18} color={accentColor} strokeWidth={2.25} />
        </Pressable>

        <Text
          style={[styles.sectionTitle, styles.recentHeading, { color: textColor }]}
        >
          {t('chatbot.widget.layout2.messages.recent')}
        </Text>

        {recent ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={recent.title}
            onPress={onOpenRecent}
            style={({ pressed }) => [
              styles.recentRow,
              {
                borderBottomColor: borderColor,
                opacity: pressed ? 0.85 : 1,
              },
            ]}
          >
            <View style={styles.recentTextCol}>
              <View style={styles.recentTopRow}>
                <Text
                  style={[styles.recentTitle, { color: textColor }]}
                  numberOfLines={1}
                >
                  {recent.title}
                </Text>
                <Text style={[styles.recentTime, { color: mutedColor }]}>
                  {recent.timeLabel}
                </Text>
              </View>
              <Text
                style={[styles.recentPreview, { color: mutedColor }]}
                numberOfLines={2}
              >
                {recent.preview}
              </Text>
            </View>
          </Pressable>
        ) : (
          <Text style={[styles.emptyRecent, { color: mutedColor }]}>
            {t('chatbot.widget.layout2.messages.emptyRecent')}
          </Text>
        )}
      </AppScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    minHeight: 56,
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    flex: 1,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginLeft: 8,
  },
  closeGlyph: {
    color: '#FFFFFF',
    fontSize: 22,
    lineHeight: 24,
    fontWeight: '400',
    marginTop: -2,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 18,
    paddingTop: 20,
    paddingBottom: 28,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 12,
  },
  recentHeading: {
    marginTop: 26,
  },
  newCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  newCardText: {
    flex: 1,
    gap: 3,
  },
  newTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  newSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  recentRow: {
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  recentTextCol: {
    gap: 4,
  },
  recentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  recentTitle: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  recentTime: {
    fontSize: 12,
  },
  recentPreview: {
    fontSize: 13,
    lineHeight: 18,
  },
  emptyRecent: {
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
  },
});
