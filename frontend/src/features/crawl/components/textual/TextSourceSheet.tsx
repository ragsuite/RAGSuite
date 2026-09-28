import { Type } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { CrawlSheet } from '@/features/crawl/components/CrawlSheet';
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
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  editor: TextualSourceEditor<TextSourceForm>;
  saving: boolean;
  error: string | null;
  onClose: () => void;
  onSubmit: (form: TextSourceForm) => void;
};

export function TextSourceSheet({ editor, saving, error, onClose, onSubmit }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const [form, setForm] = useState<TextSourceForm>(emptyTextSourceForm);
  const isEdit = editor?.mode === 'edit';
  const canSubmit = Boolean(form.title.trim() && form.content.trim());

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
          onPrimary={() => onSubmit(form)}
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
      <View style={{ gap: spacing.xxs }}>
        <AppTextField
          label={t('crawl.text.field.content')}
          value={form.content}
          onChangeText={(content) => patch({ content })}
          placeholder={t('crawl.text.field.contentPlaceholder')}
          maxLength={TEXTUAL_SOURCE_LIMITS.content}
          multiline
          numberOfLines={10}
          style={styles.content}
        />
        <View style={styles.contentFooter}>
          <Text style={[typography.caption, styles.hint, { color: colors.textMuted }]}>
            {t('crawl.text.field.contentHint')}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t('crawl.text.field.counter', {
              count: form.content.length.toLocaleString(),
              max: TEXTUAL_SOURCE_LIMITS.content.toLocaleString(),
            })}
          </Text>
        </View>
      </View>
      <TextualDescriptionField value={form.description} onChange={(description) => patch({ description })} />
      <TextualLanguageField value={form.language} onChange={(language) => patch({ language })} />
      <TextualFormError message={error} />
    </CrawlSheet>
  );
}

const styles = StyleSheet.create({
  content: { minHeight: 220, textAlignVertical: 'top' },
  contentFooter: { flexDirection: 'row', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' },
  hint: { flex: 1, minWidth: 160 },
});
