import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import type { ReadFilter, TypeFilter } from '@/features/notifications/types/notification.types';
import { useTranslation } from '@/i18n';
import { AppSelectField } from '@/shared/components/app-select-field';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

function getNotificationTypeFilterOptions(t: (key: string) => string) {
  return [
    { key: 'all' as const, label: t('notifications.filters.type.all') },
    { key: 'info' as const, label: t('notifications.filters.type.info') },
    { key: 'success' as const, label: t('notifications.filters.type.success') },
    { key: 'warning' as const, label: t('notifications.filters.type.warning') },
    { key: 'error' as const, label: t('notifications.filters.type.error') },
  ];
}

function getNotificationReadFilterOptions(t: (key: string) => string) {
  return [
    { key: 'all' as const, label: t('notifications.filters.status.all') },
    { key: 'unread' as const, label: t('notifications.filters.status.unread') },
    { key: 'read' as const, label: t('notifications.filters.status.read') },
  ];
}

type Props = {
  readFilter: ReadFilter;
  onReadFilterChange: (v: ReadFilter) => void;
  typeFilter: TypeFilter;
  onTypeFilterChange: (v: TypeFilter) => void;
};

export function NotificationFilter({ readFilter, onReadFilterChange, typeFilter, onTypeFilterChange }: Props) {
  const { surfaceRadius, isWebParitySurfaces, elevation } = useAppTheme();
  const filterRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const typeChoices = useMemo(() => getNotificationTypeFilterOptions(t), [t]);
  const readChoices = useMemo(() => getNotificationReadFilterOptions(t), [t]);

  return (
    <View
      style={[
        styles.block,
        elevation.card,
        {
          borderRadius: filterRadius,
        },
      ]}>
      <View style={styles.pickers}>
        <View style={styles.pickerSlot}>
          <AppSelectField
            label=""
            variant="inline"
            value={typeFilter}
            options={typeChoices}
            onChange={onTypeFilterChange}
            accessibilityLabel={t('notifications.filters.type.placeholder')}
            pickerTitle={t('notifications.filters.type.placeholder')}
            controlHeight={APP_CHROME_CONTROL_HEIGHT}
          />
        </View>
        <View style={styles.pickerSlot}>
          <AppSelectField
            label=""
            variant="inline"
            value={readFilter}
            options={readChoices}
            onChange={onReadFilterChange}
            accessibilityLabel={t('notifications.filters.status.placeholder')}
            pickerTitle={t('notifications.filters.status.placeholder')}
            controlHeight={APP_CHROME_CONTROL_HEIGHT}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    width: '100%',
  },
  pickers: {
    flexDirection: 'row',
    gap: 8,
  },
  pickerSlot: {
    flex: 1,
    minWidth: 0,
  },
});
