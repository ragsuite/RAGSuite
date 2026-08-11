import React from 'react';
import { Platform } from 'react-native';

import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  onRefresh: () => void;
  refreshing: boolean;
};

export function HealthHeader({ onRefresh, refreshing }: Props) {
  const { t } = useTranslation();
  const isWeb = Platform.OS === 'web';

  const refreshAction = isWeb ? (
    <AppButton
      label={t('common.refresh')}
      iconOnly
      icon={ActionIcons.refresh}
      variant="outline"
      size="compact"
      loading={refreshing}
      onPress={onRefresh}
    />
  ) : null;

  return (
    <PageSectionHeader
      title={t('system-health.title')}
      subtitle={t('system-health.description')}
      action={refreshAction}
      style={{ marginBottom: 0 }}
    />
  );
}
