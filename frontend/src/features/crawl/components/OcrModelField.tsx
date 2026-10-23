import React from 'react';
import { Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { DocumentOcrOption } from '@/network/actions/document.actions';

type Props = {
  options: DocumentOcrOption[];
  value: string;
  onChange: (value: string) => void;
};

export function OcrModelField({ options, value, onChange }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  if (options.length === 0) return null;

  return (
    <View style={{ gap: spacing.xs }}>
      <AppSelectField
        label={t('documents.form.ocrModel.label')}
        value={value}
        options={[
          { key: '', label: t('documents.form.ocrModel.none') },
          ...options.map((option) => ({
            key: option.value,
            label: `${option.provider} · ${option.model}`,
          })),
        ]}
        onChange={onChange}
      />
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>
        {t('documents.form.ocrModel.helper')}
      </Text>
    </View>
  );
}
