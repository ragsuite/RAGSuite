import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ProjectsSheet } from '@/features/projects/components/ProjectsSheet';
import type { Project, ProjectFormPayload } from '@/features/projects/types/projects.types';
import { PROJECT_DESCRIPTION_MAX } from '@/features/projects/utils/projects-display';
import { AppButton } from '@/shared/components/app-button';
import { AppTextField } from '@/shared/components/app-text-field';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getInputTextStyle } from '@/shared/utils/input-text-style';

type Props = {
  visible: boolean;
  mode: 'create' | 'edit';
  project?: Project | null;
  saving: boolean;
  onClose: () => void;
  onSubmit: (payload: ProjectFormPayload) => void;
};

const DEFAULT_FORM: ProjectFormPayload = {
  name: '',
  description: '',
};

export function ProjectFormSheet({ visible, mode, project, saving, onClose, onSubmit }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, componentRadius } = useAppTheme();
  const [form, setForm] = useState<ProjectFormPayload>(DEFAULT_FORM);

  useEffect(() => {
    if (!visible) return;
    if (mode === 'edit' && project) {
      setForm({
        name: project.name,
        description: project.description,
      });
      return;
    }
    setForm(DEFAULT_FORM);
  }, [visible, mode, project]);

  const descriptionLength = form.description.length;
  const canSubmit = Boolean(form.name.trim()) && descriptionLength <= PROJECT_DESCRIPTION_MAX;

  return (
    <ProjectsSheet
      visible={visible}
      title={mode === 'create' ? t('projects.dialog.create.title') : t('projects.dialog.edit.title')}
      subtitle={
        mode === 'create'
          ? t('projects.dialog.create.description')
          : t('projects.dialog.edit.description')
      }
      size="form"
      onClose={onClose}
      footer={
        <View style={[styles.footer, { gap: spacing.xs }]}>
          <AppButton label={t('common.cancel')} variant="outline" size="compact" disabled={saving} onPress={onClose} />
          <AppButton
            label={mode === 'create' ? t('projects.actions.create') : t('projects.actions.update')}
            variant="cta"
            size="compact"
            loading={saving}
            disabled={!canSubmit}
            onPress={() => onSubmit(form)}
          />
        </View>
      }>
      <AppTextField
        label={t('projects.form.name.label')}
        value={form.name}
        onChangeText={(name) => setForm((current) => ({ ...current, name }))}
        placeholder={t('projects.form.name.placeholder')}
      />

      <View style={{ gap: spacing.xxs }}>
        <Text style={[typography.fieldLabel, { color: colors.text }]}>{t('projects.form.description.label')}</Text>
        <View
          style={[
            styles.textareaWrap,
            {
              borderColor: colors.border,
              borderRadius: componentRadius.input,
              backgroundColor: colors.surfaceMuted,
            },
          ]}>
          <TextInput
            accessibilityLabel={t('projects.form.description.label')}
            value={form.description}
            onChangeText={(description) =>
              setForm((current) => ({
                ...current,
                description: description.slice(0, PROJECT_DESCRIPTION_MAX),
              }))
            }
            placeholder={t('projects.form.description.placeholder')}
            placeholderTextColor={colors.textMuted}
            multiline
            textAlignVertical="top"
            style={[getInputTextStyle(typography.fieldInput, { multiline: true }), styles.textarea, { color: colors.text }]}
          />
        </View>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {t('projects.form.description.count', { count: descriptionLength, max: PROJECT_DESCRIPTION_MAX })}
        </Text>
      </View>
    </ProjectsSheet>
  );
}

const styles = StyleSheet.create({
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  textareaWrap: {
    borderWidth: 1,
    minHeight: 120,
  },
  textarea: {
    minHeight: 120,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
});
