import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { DOCUMENT_LANGUAGE_OPTIONS } from '@/features/crawl/utils/document-form';
import { TEXTUAL_SOURCE_LIMITS } from '@/features/crawl/utils/textual-sources';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type NameProps = {
  value: string;
  placeholder: string;
  onChange: (value: string) => void;
};

export function TextualNameField({ value, placeholder, onChange }: NameProps) {
  const { t } = useTranslation();
  return (
    <AppTextField
      label={t('crawl.textual.field.name')}
      value={value}
      onChangeText={onChange}
      placeholder={placeholder}
      maxLength={TEXTUAL_SOURCE_LIMITS.title}
    />
  );
}

type DescriptionProps = {
  value: string;
  onChange: (value: string) => void;
};

export function TextualDescriptionField({ value, onChange }: DescriptionProps) {
  const { t } = useTranslation();
  return (
    <AppTextField
      label={t('crawl.textual.field.description')}
      value={value}
      onChangeText={onChange}
      placeholder={t('crawl.textual.field.descriptionPlaceholder')}
      maxLength={TEXTUAL_SOURCE_LIMITS.description}
      multiline
      numberOfLines={3}
      style={styles.description}
    />
  );
}

/** Plain field label for custom inputs that are not an `AppTextField` (e.g. the Q&A pair list). */
export function TextualFieldLabel({ label }: { label: string }) {
  const { colors, typography } = useAppTheme();
  return <Text style={[typography.fieldLabel, { color: colors.text }]}>{label}</Text>;
}

type LanguageProps = {
  value: string;
  onChange: (value: string) => void;
};

export function TextualLanguageField({ value, onChange }: LanguageProps) {
  const { t } = useTranslation();
  return (
    <AppSelectField
      label={t('documents.fields.language')}
      value={value}
      pickerPresentation="inline"
      options={DOCUMENT_LANGUAGE_OPTIONS.map((option) => ({ key: option.key, label: option.label }))}
      onChange={onChange}
    />
  );
}

export function TextualFormError({ message }: { message: string | null }) {
  const { colors, typography } = useAppTheme();
  if (!message) return null;
  return (
    <Text accessibilityRole="alert" style={[typography.caption, { color: colors.danger }]}>
      {message}
    </Text>
  );
}

const styles = StyleSheet.create({
  description: { minHeight: 80, textAlignVertical: 'top' },
});
