import React from 'react';

import type { Project } from '@/features/projects/types/projects.types';
import { useTranslation } from '@/i18n';
import { ConfirmOverlay } from '@/shared/components/adaptive/confirm-overlay';

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
    <ConfirmOverlay
      visible={visible}
      title={t('projects.dialog.delete.title')}
      subtitle={
        project
          ? t('projects.dialog.delete.description', { name: project.name })
          : t('projects.dialog.delete.description', { name: '' })
      }
      cancelLabel={t('common.cancel')}
      confirmLabel={t('common.delete')}
      loading={saving}
      variant="danger"
      onClose={onClose}
      onConfirm={onConfirm}
    />
  );
}
