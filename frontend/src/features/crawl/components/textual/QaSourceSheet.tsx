import { MessagesSquare } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { TrainingModelField } from '@/features/crawl/components/TrainingModelField';
import { QaPairCard } from '@/features/crawl/components/textual/QaPairCard';
import { useEmbeddingProviderSelection } from '@/features/crawl/hooks/use-embedding-provider-selection';
import {
  TextualDescriptionField,
  TextualFieldLabel,
  TextualFormError,
  TextualLanguageField,
  TextualNameField,
} from '@/features/crawl/components/textual/TextualFormFields';
import type { QaPairDraft, QaSourceForm, TextualSourceEditor } from '@/features/crawl/types/textual-source.types';
import {
  createQaPairDraft,
  emptyQaSourceForm,
  isQaPairBlank,
  TEXTUAL_SOURCE_LIMITS,
} from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { AppButton } from '@/shared/components/app-button';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  editor: TextualSourceEditor<QaSourceForm>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: QaSourceForm) => void;
};

export function QaSourceSheet({ editor, saving, error, onClose, onSubmit }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const [form, setForm] = useState<QaSourceForm>(emptyQaSourceForm);
  const isEdit = editor?.mode === 'edit';
  const filledPairs = form.pairs.filter((pair) => !isQaPairBlank(pair)).length;
  const atLimit = form.pairs.length >= TEXTUAL_SOURCE_LIMITS.pairs;
  const trainingModel = useEmbeddingProviderSelection({
    visible: editor !== null,
    stored: editor?.initial.ingestEmbeddingTarget,
    preselectDefault: !isEdit,
  });
  const canSubmit = Boolean(form.title.trim()) && filledPairs > 0 && !trainingModel.loading;

  useEffect(() => {
    if (editor) setForm(editor.initial);
  }, [editor]);

  const patch = (next: Partial<QaSourceForm>) => setForm((current) => ({ ...current, ...next }));

  const updatePair = (id: string, next: Partial<Pick<QaPairDraft, 'question' | 'answer'>>) =>
    setForm((current) => ({
      ...current,
      pairs: current.pairs.map((pair) => (pair.id === id ? { ...pair, ...next } : pair)),
    }));

  const removePair = (id: string) =>
    setForm((current) => ({ ...current, pairs: current.pairs.filter((pair) => pair.id !== id) }));

  const addPair = () =>
    setForm((current) =>
      current.pairs.length >= TEXTUAL_SOURCE_LIMITS.pairs
        ? current
        : { ...current, pairs: [...current.pairs, createQaPairDraft()] },
    );

  return (
    <CrawlSheet
      visible={editor !== null}
      size="sideSheetMd"
      titleIcon={MessagesSquare}
      title={isEdit ? t('crawl.qa.sheet.editTitle') : t('crawl.qa.sheet.createTitle')}
      subtitle={t('crawl.qa.sheet.subtitle')}
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={t('common.cancel')}
          primaryLabel={t('common.save')}
          onCancel={onClose}
          onPrimary={() => onSubmit({ ...form, ingestEmbeddingTarget: trainingModel.selected })}
          primaryLoading={saving}
          primaryDisabled={saving || !canSubmit}
          cancelDisabled={saving}
        />
      }>
      <TextualNameField
        value={form.title}
        placeholder={t('crawl.qa.field.namePlaceholder')}
        onChange={(title) => patch({ title })}
      />
      <View style={{ gap: spacing.xs }}>
        <View style={styles.pairsHeader}>
          <TextualFieldLabel label={t('crawl.qa.field.pairs')} />
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('crawl.qa.field.pairsCount', { count: filledPairs, max: TEXTUAL_SOURCE_LIMITS.pairs })}
          </Text>
        </View>
        {form.pairs.map((pair, index) => (
          <QaPairCard
            key={pair.id}
            pair={pair}
            index={index}
            canRemove={form.pairs.length > 1}
            disabled={saving}
            onChange={updatePair}
            onRemove={removePair}
          />
        ))}
        <View style={styles.addRow}>
          <AppButton
            label={t('crawl.qa.pair.add')}
            icon={ActionIcons.add}
            variant="outline"
            size="compact"
            disabled={saving || atLimit}
            onPress={addPair}
          />
        </View>
      </View>
      <TextualDescriptionField value={form.description} onChange={(description) => patch({ description })} />
      <TextualLanguageField value={form.language} onChange={(language) => patch({ language })} />
      <TrainingModelField selection={trainingModel} onOpenModelConfiguration={onClose} />
      <TextualFormError message={error} />
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  pairsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' },
  addRow: { flexDirection: 'row' },
});
