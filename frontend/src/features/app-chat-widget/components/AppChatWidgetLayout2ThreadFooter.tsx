import { MessageCircle, Send } from 'lucide-react-native';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';

type Props = {
  accentColor: string;
  panelBg: string;
  textColor: string;
  mutedColor: string;
  endedLabel: string | null;
  showReturnToLive: boolean;
  onNewConversation: () => void;
  onReturnToLive: () => void;
};

export function AppChatWidgetLayout2ThreadFooter({
  accentColor,
  panelBg,
  textColor,
  mutedColor,
  endedLabel,
  showReturnToLive,
  onNewConversation,
  onReturnToLive,
}: Props) {
  const { t } = useTranslation();

  return (
    <View style={[styles.root, { backgroundColor: panelBg }]}>
      {endedLabel ? (
        <Text style={[styles.endedLabel, { color: mutedColor }]}>{endedLabel}</Text>
      ) : null}

      {showReturnToLive ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.widget.layout2.thread.returnToLiveChat')}
          onPress={onReturnToLive}
          style={({ pressed }) => [
            styles.cta,
            {
              borderColor: accentColor,
              backgroundColor: panelBg,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <MessageCircle size={18} color={accentColor} strokeWidth={2.25} />
          <Text style={[styles.ctaTitle, { color: textColor }]}>
            {t('chatbot.widget.layout2.thread.returnToLiveChat')}
          </Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.widget.layout2.messages.newConversation')}
          onPress={onNewConversation}
          style={({ pressed }) => [
            styles.cta,
            {
              borderColor: accentColor,
              backgroundColor: panelBg,
              opacity: pressed ? 0.92 : 1,
            },
          ]}
        >
          <Send size={18} color={accentColor} strokeWidth={2.25} />
          <Text style={[styles.ctaTitle, { color: textColor }]}>
            {t('chatbot.widget.layout2.messages.newConversation')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 16,
    gap: 12,
  },
  endedLabel: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: 'center',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    borderWidth: 1.5,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  ctaTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
});
