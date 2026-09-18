import { Mail } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { AppChatWidgetTheme } from '@/features/app-chat-widget/utils/app-chat-widget-theme';
import { createTranslatorForLanguage } from '@/i18n';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidEmailAddress(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

type Props = {
  theme: AppChatWidgetTheme;
  language?: string | null;
  previewMode?: boolean;
  submitting?: boolean;
  errorMessage?: string | null;
  successMessage?: string | null;
  onCancel: () => void;
  onSubmit: (email: string) => void | Promise<void>;
};

export function AppChatWidgetEmailConversation({
  theme,
  language,
  previewMode = false,
  submitting = false,
  errorMessage = null,
  successMessage = null,
  onCancel,
  onSubmit,
}: Props) {
  const t = createTranslatorForLanguage(language);
  const { surfaceRadius } = useAppTheme();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);

  const trimmed = email.trim();
  const isValid = isValidEmailAddress(trimmed);
  const showInvalid = touched && trimmed.length > 0 && !isValid;
  const canSend = isValid && !submitting && !successMessage;

  const statusText = useMemo(() => {
    if (successMessage) return successMessage;
    if (errorMessage) return errorMessage;
    if (showInvalid) return t('chatbot.widget.app.emailConversation.invalidEmail');
    return null;
  }, [errorMessage, showInvalid, successMessage, t]);

  const handleSend = () => {
    setTouched(true);
    if (!isValid || submitting || successMessage) return;
    if (previewMode) {
      onCancel();
      return;
    }
    void onSubmit(trimmed);
  };

  return (
    <View style={styles.overlay} accessibilityViewIsModal>
      <Pressable
        accessibilityLabel={t('chatbot.widget.app.emailConversation.dismiss.a11y')}
        style={[styles.backdrop, { backgroundColor: overlayTokens.backdrop }]}
        onPress={onCancel}
      />
      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.panelBg,
            borderColor: theme.panelBorderColor,
            borderRadius: surfaceRadius.modal,
          },
        ]}>
        <View style={styles.titleRow}>
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: theme.accentColor,
                borderRadius: Math.max(6, surfaceRadius.button - 2),
              },
            ]}>
            <Mail size={16} color={theme.accentForegroundColor} strokeWidth={2} />
          </View>
          <Text style={[styles.title, { color: theme.heroTitleColor }]}>
            {t('chatbot.widget.app.emailConversation.title')}
          </Text>
        </View>

        <View
          style={[
            styles.fieldWrap,
            {
              borderColor: showInvalid ? theme.errorAccent : theme.panelBorderColor,
              borderRadius: surfaceRadius.button,
              backgroundColor: theme.panelBg,
            },
          ]}>
          <Text style={[styles.fieldLabel, { color: theme.heroTitleColor }]}>
            * {t('chatbot.widget.app.emailConversation.emailLabel')}
          </Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            onBlur={() => setTouched(true)}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            textContentType="emailAddress"
            editable={!submitting && !successMessage}
            accessibilityLabel={t('chatbot.widget.app.emailConversation.emailLabel')}
            placeholder="name@example.com"
            placeholderTextColor={theme.metaColor}
            style={[styles.input, { color: theme.heroTitleColor }]}
          />
        </View>

        {statusText ? (
          <Text
            style={[
              styles.status,
              {
                color: successMessage
                  ? theme.accentColor
                  : theme.errorAccent,
              },
            ]}>
            {statusText}
          </Text>
        ) : null}

        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
            onPress={onCancel}
            disabled={submitting}
            style={({ pressed, hovered }) => {
              const isActive = !submitting && (pressed || Boolean(hovered));
              return [
                styles.btn,
                {
                  backgroundColor: isActive
                    ? 'rgba(127,127,127,0.16)'
                    : theme.inputSectionBg,
                  borderColor: theme.panelBorderColor,
                  borderRadius: surfaceRadius.button,
                  borderWidth: 1,
                  opacity: submitting ? 0.6 : pressed ? 0.92 : 1,
                  ...(Platform.OS === 'web'
                    ? ({ cursor: submitting ? 'default' : 'pointer' } as object)
                    : null),
                },
              ];
            }}>
            <Text style={[styles.btnLabel, { color: theme.heroTitleColor }]}>
              {t('common.cancel')}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('chatbot.widget.app.emailConversation.send')}
            onPress={handleSend}
            disabled={!canSend}
            style={({ pressed, hovered }) => [
              styles.btn,
              {
                backgroundColor: theme.accentColor,
                borderRadius: surfaceRadius.button,
                opacity: !canSend ? 0.5 : pressed ? 0.85 : hovered ? 0.92 : 1,
                ...(Platform.OS === 'web'
                  ? ({ cursor: canSend ? 'pointer' : 'default' } as object)
                  : null),
              },
            ]}>
            {submitting ? (
              <ActivityIndicator color={theme.accentForegroundColor} />
            ) : (
              <Text style={[styles.btnLabel, { color: theme.accentForegroundColor }]}>
                {t('chatbot.widget.app.emailConversation.send')}
              </Text>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 40,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  card: {
    width: '100%',
    maxWidth: 320,
    borderWidth: 1,
    padding: 16,
    gap: 12,
    zIndex: 1,
    ...Platform.select({
      web: {
        boxShadow: '0 12px 32px rgba(0,0,0,0.22)',
      },
      default: {
        elevation: 10,
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 6 },
      },
    }),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  iconBadge: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 22,
  },
  fieldWrap: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 10,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    fontSize: 14,
    minHeight: 28,
    padding: 0,
    ...(Platform.OS === 'web'
      ? ({ outlineStyle: 'none', outlineWidth: 0 } as object)
      : null),
  },
  status: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  btn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  btnLabel: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
