import { Send } from 'lucide-react-native';
import React from 'react';
import { ActivityIndicator, Platform, Pressable, Text, TextInput, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import {
  searchInputAutofillProps,
  useSearchFilterInputProps,
} from '@/shared/utils/search-input-autofill';

const COMPOSER_RADIUS = 24;

/** Shared ChatGPT-like content width for empty + docked composer and message column. */
export const AI_ASSISTANT_CONTENT_MAX = 720;

type Props = {
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  sending: boolean;
  needsSettings: boolean;
  maxWidth?: number;
};

export function AiAssistantComposerInput({
  draft,
  onDraftChange,
  onSend,
  sending,
  needsSettings,
  maxWidth = AI_ASSISTANT_CONTENT_MAX,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const disabled = sending || !draft.trim() || needsSettings;
  const autofillProps = useSearchFilterInputProps();

  return (
    <View
      style={{
        width: '100%',
        maxWidth,
        alignSelf: 'center',
        gap: spacing.xs,
      }}
    >
      <View
        style={{
          width: '100%',
          flexDirection: 'row',
          alignItems: 'center',
          gap: spacing.sm,
          borderWidth: 1,
          borderColor: colors.borderStrong,
          borderRadius: COMPOSER_RADIUS,
          paddingHorizontal: spacing.md,
          paddingVertical: 6,
          backgroundColor: colors.background,
        }}
      >
        <TextInput
          value={draft}
          onChangeText={onDraftChange}
          placeholder={t('aiAssistant.askAnything')}
          placeholderTextColor={colors.textMuted}
          multiline
          // RN Web multiline only routes Enter→onSubmitEditing when blurOnSubmit is true
          blurOnSubmit={Platform.OS === 'web'}
          returnKeyType="send"
          editable={!sending && !needsSettings}
          {...autofillProps}
          {...searchInputAutofillProps}
          style={[
            typography.body,
            webSuppressInputOutline(),
            {
              flex: 1,
              minHeight: 32,
              maxHeight: 96,
              color: colors.text,
              textAlign: 'left',
              paddingTop: 6,
              paddingBottom: 6,
            },
          ]}
          accessibilityLabel={t('aiAssistant.askAnything')}
          onSubmitEditing={() => {
            if (!disabled) onSend();
          }}
        />
        <Pressable
          onPress={onSend}
          disabled={disabled}
          accessibilityLabel={t('aiAssistant.send')}
          style={({ pressed, hovered }) => ({
            height: 32,
            width: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: disabled
              ? colors.border
              : pressed
                ? colors.primaryPressed
                : hovered
                  ? colors.primaryPressed
                  : colors.primary,
          })}
        >
          {sending ? (
            <ActivityIndicator color={colors.textOnPrimary} />
          ) : (
            <Send size={14} color={colors.textOnPrimary} />
          )}
        </Pressable>
      </View>
      <Text
        style={[
          typography.caption,
          {
            color: colors.textMuted,
            textAlign: 'center',
            fontSize: 11,
            fontWeight: '400',
          },
        ]}
      >
        {t('aiAssistant.disclaimer')}
      </Text>
    </View>
  );
}
