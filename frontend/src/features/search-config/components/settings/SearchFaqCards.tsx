import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import type { SearchFaqSelection } from '@/features/search-config/utils/search-faq-cards';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const IS_WEB = Platform.OS === 'web';

const WEB_INTERACTIVE_STYLE = IS_WEB
  ? ({
      cursor: 'pointer',
      transitionProperty: 'background-color, border-color',
      transitionDuration: '120ms',
    } as object)
  : null;

type Props = {
  questions: SearchFaqSelection[];
  /** Omit for a static preview (cards render without press handling). */
  onSelect?: (question: SearchFaqSelection) => void;
  disabled?: boolean;
};

type CardState = { interactive: boolean; hovered: boolean; pressed: boolean };

/** Search FAQ question cards; a click streams the configured answer (no RAG). */
export function SearchFaqCards({ questions, onSelect, disabled = false }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  if (questions.length === 0) return null;

  const cardStyle = ({ interactive, hovered, pressed }: CardState) => [
    styles.card,
    {
      minHeight: TOUCH_TARGET_MIN,
      borderColor: hovered ? colors.borderStrong : colors.border,
      borderRadius: surfaceRadius.button,
      backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      opacity: disabled ? 0.6 : 1,
    },
    interactive && !disabled ? WEB_INTERACTIVE_STYLE : null,
  ];

  const renderContent = (text: string) => (
    <>
      <Text style={[typography.body, styles.cardText, { color: colors.text }]} numberOfLines={2}>
        {text}
      </Text>
      <ActionIcons.help size={16} color={colors.textMuted} />
    </>
  );

  return (
    <View style={{ gap: spacing.xs }} accessibilityRole="list">
      <Text style={[typography.eyebrow, { color: colors.textMuted }]}>{t('search.faq.cards.title')}</Text>
      {questions.map((question) =>
        onSelect ? (
          <Pressable
            key={question.id}
            accessibilityRole="button"
            accessibilityLabel={t('search.faq.cards.a11y', { question: question.text })}
            accessibilityState={{ disabled }}
            disabled={disabled}
            onPress={() => onSelect({ id: question.id, text: question.text })}
            style={({ pressed, hovered }) =>
              cardStyle({
                interactive: true,
                hovered: Boolean(hovered) && !disabled,
                pressed: pressed && !disabled,
              })
            }>
            {renderContent(question.text)}
          </Pressable>
        ) : (
          <View key={question.id} style={cardStyle({ interactive: false, hovered: false, pressed: false })}>
            {renderContent(question.text)}
          </View>
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    maxWidth: '100%',
    borderWidth: 1,
  },
  cardText: { flexShrink: 1, fontSize: 14 },
});
