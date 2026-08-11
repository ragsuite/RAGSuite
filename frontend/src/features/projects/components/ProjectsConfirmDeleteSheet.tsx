import React from 'react';
import { View } from 'react-native';

import { ProjectsSheet } from '@/features/projects/components/ProjectsSheet';
import type { Project } from '@/features/projects/types/projects.types';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';

type Props = {
  visible: boolean;
  project: Project | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ProjectsConfirmDeleteSheet({ visible, project, saving, onClose, onConfirm }: Props) {
  const { t } = useTranslation();

  return (
    <ProjectsSheet
      visible={visible}
      title={t('projects.dialog.delete.title')}
      subtitle={
        project
          ? t('projects.dialog.delete.description', { name: project.name })
          : t('projects.dialog.delete.description', { name: '' })
      }
      size="confirm"
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={t('common.cancel')}
          primaryLabel={t('common.delete')}
          onCancel={onClose}
          onPrimary={onConfirm}
          primaryLoading={saving}
          primaryDisabled={saving}
          cancelDisabled={saving}
          primaryVariant="danger"
        />
      }>
      <View />
    </ProjectsSheet>
  );
}
