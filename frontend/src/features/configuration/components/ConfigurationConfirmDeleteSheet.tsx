import React from 'react';

import type { ApiKey } from '@/features/configuration/types/configuration.types';
import { useTranslation } from '@/i18n';
import { ConfirmOverlay } from '@/shared/components/adaptive/confirm-overlay';

type Props = {
  visible: boolean;
  apiKey: ApiKey | null;
  saving: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ConfigurationConfirmDeleteSheet({ visible, apiKey, saving, onClose, onConfirm }: Props) {
  const { t } = useTranslation();

  return (
    <ConfirmOverlay
      visible={visible}
      title={t('api-keys.delete.title')}
      subtitle={
        apiKey
          ? t('api-keys.delete.descriptionWithName', { name: apiKey.name })
          : t('api-keys.delete.fallbackDescription')
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
