import React from 'react';
import { Platform, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { StatusBadge } from '@/shared/components/status-badge';

/** Pill beside the page title when the member can view but not change the module. */
export function ViewOnlyBadge({ visible }: { visible: boolean }) {
  const { t } = useTranslation();
  if (!visible) return null;
  const hint = t('org.permissions.readOnlyBanner');
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={t('org.permissions.viewOnlyChip')}
      accessibilityHint={hint}
      {...(Platform.OS === 'web' ? { title: hint } : null)}>
      <StatusBadge size="compact" tone="muted" preserveCase label={t('org.permissions.viewOnlyChip')} />
    </View>
  );
}

/** @deprecated Use ViewOnlyBadge as a PageSectionHeader titleAddon. */
export function ReadOnlyPermissionBanner({ visible }: { visible: boolean }) {
  return <ViewOnlyBadge visible={visible} />;
}
