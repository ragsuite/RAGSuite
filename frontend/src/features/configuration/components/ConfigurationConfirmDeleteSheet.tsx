import React from 'react';
import { View } from 'react-native';

import { ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import type { ApiKey } from '@/features/configuration/types/configuration.types';
import { useTranslation } from '@/i18n';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';

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
    <ConfigurationSheet
      visible={visible}
      title={t('api-keys.delete.title')}
      subtitle={
        apiKey
          ? t('api-keys.delete.descriptionWithName', { name: apiKey.name })
          : t('api-keys.delete.fallbackDescription')
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
    </ConfigurationSheet>
  );
}
