import { KeyRound } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  ConfigurationOutlineButton,
} from '@/features/configuration/components/configuration-actions';
import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import type { ApiKeyEnvironment, ApiKeyExpiration, CreateApiKeyPayload } from '@/features/configuration/types/configuration.types';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  visible: boolean;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: CreateApiKeyPayload) => void;
};

const ENVIRONMENT_OPTIONS = (t: (key: string) => string): { key: ApiKeyEnvironment; label: string }[] => [
  { key: 'production', label: t('api-keys.environment.production') },
  { key: 'staging', label: t('api-keys.environment.staging') },
  { key: 'development', label: t('api-keys.environment.development') },
];

const EXPIRATION_OPTIONS = (t: (key: string) => string): { key: ApiKeyExpiration; label: string }[] => [
  { key: 'never', label: t('api-keys.expiration.never') },
  { key: '30d', label: t('api-keys.expiration.30d') },
  { key: '90d', label: t('api-keys.expiration.90d') },
  { key: '1y', label: t('api-keys.expiration.1y') },
];

const DEFAULT_FORM: CreateApiKeyPayload = {
  name: '',
  description: '',
  environment: 'production',
  expiration: 'never',
};

export function CreateApiKeySheet({ visible, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, componentRadius } = useAppTheme();
  const [form, setForm] = useState<CreateApiKeyPayload>(DEFAULT_FORM);

  useEffect(() => {
    if (!visible) return;
    setForm(DEFAULT_FORM);
  }, [visible]);

  const canSubmit = Boolean(form.name.trim());

  return (
    <ConfigurationSheet
      visible={visible}
      title={t('api-keys.create')}
      subtitle={t('api-keys.description')}
      size="form"
      onClose={onClose}
      footer={
        <View style={[styles.footer, { gap: spacing.sm }]}>
          <ConfigurationOutlineButton label={t('common.cancel')} onPress={onClose} disabled={saving} />
          <AppButton
            variant="cta"
            size="compact"
            label={t('api-keys.create')}
            icon={KeyRound}
            loading={saving}
            disabled={!canSubmit || saving}
            onPress={() => onSubmit(form)}
          />
        </View>
      }>
      <AppTextField
        label={t('api-keys.name')}
        value={form.name}
        onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        placeholder={t('api-keys.form.namePlaceholder')}
      />

      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('api-keys.form.descriptionOptional')}</Text>
        <View
          style={[
            styles.textareaWrap,
            {
              borderColor: colors.border,
              borderRadius: componentRadius.input,
              backgroundColor: colors.surface,
            },
          ]}>
          <TextInput
            accessibilityLabel={t('api-keys.form.descriptionA11y')}
            value={form.description}
            onChangeText={(description) => setForm((current) => ({ ...current, description }))}
            placeholder={t('api-keys.form.descriptionPlaceholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={[getInputTextStyle(typography.fieldInput, { multiline: true }), styles.textarea, { color: colors.text }]}
          />
        </View>
      </View>

      <AppSelectField
        label={t('api-keys.environment')}
        value={form.environment}
        options={ENVIRONMENT_OPTIONS(t)}
        onChange={(environment) => setForm((current) => ({ ...current, environment }))}
        pickerPresentation="inline"
      />

      <AppSelectField
        label={t('api-keys.form.expiration')}
        value={form.expiration}
        options={EXPIRATION_OPTIONS(t)}
        onChange={(expiration) => setForm((current) => ({ ...current, expiration }))}
        pickerPresentation="inline"
      />
    </ConfigurationSheet>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  textareaWrap: {
    borderWidth: 1,
    minHeight: 96,
  },
  textarea: {
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
