import React, { useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import {
  buildPrivacyNoticeBodySegments,
} from '@/features/app-chat-widget/utils/app-chat-widget-privacy-notice';
import type { PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { createTranslatorForLanguage } from '@/i18n';

type Props = {
  notice: PrivacyNoticeSettings;
  theme: AppChatWidgetTheme;
  language: string;
  onAccept: () => void;
  onCancel: () => void;
  /** Admin live preview — Start chat only dismisses overlay in parent (no persistence). */
  previewMode?: boolean;
};

function PrivacyNoticeLink({
  label,
  accentColor,
  underline,
  onPress,
}: {
  label: string;
  accentColor: string;
  underline: boolean;
  onPress: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pressed, setPressed] = useState(false);
  const showUnderline = underline || hovered || pressed;

  return (
    <Text
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      {...(Platform.OS === 'web'
        ? ({
            onMouseEnter: () => setHovered(true),
            onMouseLeave: () => setHovered(false),
            // RN web
            onHoverIn: () => setHovered(true),
            onHoverOut: () => setHovered(false),
          } as object)
        : null)}
      style={{
        color: accentColor,
        textDecorationLine: showUnderline ? 'underline' : 'none',
        opacity: pressed ? 0.75 : hovered ? 0.85 : 1,
        ...(Platform.OS === 'web' ? ({ cursor: 'pointer' } as object) : null),
      }}
      accessibilityRole="link"
      accessibilityLabel={label}
    >
      {label}
    </Text>
  );
}

export function AppChatWidgetPrivacyNoticeModal({
  notice,
  theme,
  language,
  onAccept,
  onCancel,
}: Props) {
  const t = createTranslatorForLanguage(language);
  const segments = useMemo(
    () => buildPrivacyNoticeBodySegments(notice.content, notice.linkPhrases),
    [notice.content, notice.linkPhrases],
  );
  const underline = notice.underlineLinks === true;
  const url = (notice.url || '').trim();

  const openPolicy = () => {
    if (!url) return;
    void Linking.openURL(url);
  };

  return (
    <View
      style={[styles.backdrop, { backgroundColor: 'rgba(0,0,0,0.45)' }]}
      accessibilityViewIsModal
      accessibilityLabel={t('chatbot.widget.app.privacyNotice.title')}
    >
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.panelBg,
            borderColor: theme.panelBorderColor,
          },
        ]}
      >
        <Text style={[styles.title, { color: theme.heroTitleColor }]}>
          {t('chatbot.widget.app.privacyNotice.title')}
        </Text>
        <Text style={[styles.body, { color: theme.assistantTextColor }]}>
          {segments.map((segment, index) => {
            if (segment.type === 'text') {
              return <Text key={`t-${index}`}>{segment.value}</Text>;
            }
            return (
              <PrivacyNoticeLink
                key={`l-${index}`}
                label={segment.value}
                accentColor={theme.accentColor}
                underline={underline}
                onPress={openPolicy}
              />
            );
          })}
        </Text>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.privacyNotice.cancel')}
            onPress={onCancel}
            style={({ pressed, hovered }) => [
              styles.btn,
              styles.btnGhost,
              {
                borderColor: theme.panelBorderColor,
                backgroundColor:
                  pressed || hovered ? 'rgba(127,127,127,0.12)' : 'transparent',
                opacity: pressed ? 0.9 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.assistantTextColor, fontWeight: '600' }}>
              {t('chatbot.widget.app.privacyNotice.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.privacyNotice.start')}
            onPress={onAccept}
            style={({ pressed, hovered }) => [
              styles.btn,
              {
                backgroundColor: theme.accentColor,
                opacity: pressed ? 0.88 : hovered ? 0.94 : 1,
              },
            ]}
          >
            <Text style={{ color: theme.accentForegroundColor, fontWeight: '700' }}>
              {t('chatbot.widget.app.privacyNotice.start')}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    paddingVertical: 16,
    gap: 12,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    minHeight: 40,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  btnGhost: {
    borderWidth: StyleSheet.hairlineWidth,
    backgroundColor: 'transparent',
  },
});
