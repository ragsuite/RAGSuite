import React from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

import type { FaqEditorItem, FaqEditorItemPatch, FaqEditorLengths } from './faq-editor.types';
import { createFaqItemId, reorderFaqItems } from './faq-editor.utils';
import { FaqQuestionComposer } from './faq-question-composer';
import { FaqQuestionRow } from './faq-question-row';

type Props = FaqEditorLengths & {
  items: FaqEditorItem[];
  limit: number;
  disabled: boolean;
  /** Show the "answer every question" hint (parent also blocks its Save button). */
  saveBlocked: boolean;
  /** Prefix for ids of newly added items (e.g. `faq`, `pq`). */
  idPrefix: string;
  onItemsChange: (items: FaqEditorItem[]) => void;
};

/** Composer + editable rows for admin-configured FAQ question/answer pairs. */
export function FaqEditorList({
  items,
  limit,
  disabled,
  saveBlocked,
  idPrefix,
  questionMaxLength,
  answerMaxLength,
  onItemsChange,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const atLimit = items.length >= limit;

  const commit = (next: FaqEditorItem[]) => onItemsChange(reorderFaqItems(next));

  const addItem = (text: string, answer: string) => {
    if (atLimit) return;
    commit([...items, { id: createFaqItemId(idPrefix), text, answer, order: items.length + 1 }]);
  };

  const changeItem = (id: string, patch: FaqEditorItemPatch) => {
    commit(items.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removeItem = (id: string) => {
    commit(items.filter((item) => item.id !== id));
  };

  return (
    <View style={{ gap: spacing.md }}>
      <FaqQuestionComposer
        disabled={disabled}
        atLimit={atLimit}
        limit={limit}
        questionMaxLength={questionMaxLength}
        answerMaxLength={answerMaxLength}
        onAdd={addItem}
      />

      {items.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {items.map((item) => (
            <FaqQuestionRow
              key={item.id}
              item={item}
              disabled={disabled}
              questionMaxLength={questionMaxLength}
              answerMaxLength={answerMaxLength}
              onChange={changeItem}
              onRemove={removeItem}
            />
          ))}
        </View>
      ) : null}

      {saveBlocked ? (
        <Text style={[typography.caption, { color: colors.danger }]}>{t('faq.editor.saveBlocked')}</Text>
      ) : null}
    </View>
  );
}
