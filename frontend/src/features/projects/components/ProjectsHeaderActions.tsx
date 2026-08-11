import React from 'react';
import { View } from 'react-native';

import { useProjectsLayout } from '@/features/projects/utils/projects-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  refreshing?: boolean;
  onRefresh: () => void;
  onCreate: () => void;
  canCreate?: boolean;
};

export function ProjectsHeaderActions({ refreshing, onRefresh, onCreate, canCreate = true }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const { isNativeMobile, isHeaderStacked } = useProjectsLayout();

  return (
    <View
      style={[
        { alignItems: 'center', gap: spacing.sm },
        isHeaderStacked
          ? { width: '100%', flexDirection: 'row', justifyContent: 'flex-end' }
          : { flexDirection: 'row', flexShrink: 0 },
      ]}>
      {!isNativeMobile ? (
        <AppButton
          label={t('common.retry')}
          iconOnly
          icon={ActionIcons.refresh}
          variant="outline"
          size="compact"
          loading={refreshing}
          onPress={onRefresh}
        />
      ) : null}
      {canCreate ? (
        <AppButton
          label={t('projects.actions.create')}
          icon={ActionIcons.add}
          variant="cta"
          size="compact"
          fullWidth={isHeaderStacked}
          onPress={onCreate}
        />
      ) : null}
    </View>
  );
}
