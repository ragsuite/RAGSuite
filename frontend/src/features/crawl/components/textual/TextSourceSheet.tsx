import { Type } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
import { TrainingModelField } from '@/features/crawl/components/TrainingModelField';
import { useEmbeddingProviderSelection } from '@/features/crawl/hooks/use-embedding-provider-selection';
import {
  TextualDescriptionField,
  TextualFormError,
  TextualLanguageField,
  TextualNameField,
} from '@/features/crawl/components/textual/TextualFormFields';
import type { TextSourceForm, TextualSourceEditor } from '@/features/crawl/types/textual-source.types';
import { emptyTextSourceForm, TEXTUAL_SOURCE_LIMITS } from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import { RichTextEditor } from '@/shared/components/rich-text-editor';
import { isRichTextEmpty } from '@/shared/utils/rich-text';

const CONTENT_MIN_HEIGHT = 220;

type Props = {
  editor: TextualSourceEditor<TextSourceForm>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: TextSourceForm) => void;
};

export function TextSourceSheet({ editor, saving, error, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const [form, setForm] = useState<TextSourceForm>(emptyTextSourceForm);
  const isEdit = editor?.mode === 'edit';
  const trainingModel = useEmbeddingProviderSelection({
    visible: editor !== null,
    stored: editor?.initial.ingestEmbeddingTarget,
    preselectDefault: !isEdit,
  });
  const canSubmit = Boolean(form.title.trim()) && !isRichTextEmpty(form.content) && !trainingModel.loading;

  useEffect(() => {
    if (editor) setForm(editor.initial);
  }, [editor]);

  const patch = (next: Partial<TextSourceForm>) => setForm((current) => ({ ...current, ...next }));

  return (
    <CrawlSheet
      visible={editor !== null}
      size="sideSheetMd"
      titleIcon={Type}
      title={isEdit ? t('crawl.text.sheet.editTitle') : t('crawl.text.sheet.createTitle')}
      subtitle={t('crawl.text.sheet.subtitle')}
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
        placeholder={t('crawl.text.field.namePlaceholder')}
        onChange={(title) => patch({ title })}
      />
      <RichTextEditor
        label={t('crawl.text.field.content')}
        value={form.content}
        onChange={(content) => patch({ content })}
        placeholder={t('crawl.text.field.contentPlaceholder')}
        maxTextLength={TEXTUAL_SOURCE_LIMITS.content}
        minHeight={CONTENT_MIN_HEIGHT}
        disabled={saving}
        helperText={t('crawl.text.field.contentHint')}
      />
      <TextualDescriptionField value={form.description} onChange={(description) => patch({ description })} />
      <TextualLanguageField value={form.language} onChange={(language) => patch({ language })} />
      <TrainingModelField selection={trainingModel} onOpenModelConfiguration={onClose} />
      <TextualFormError message={error} />
    </CrawlSheet>
  );
}