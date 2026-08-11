import React from 'react';
import { Stack } from 'expo-router';

import { HelpSettingsScreen } from '@/features/settings/screens/HelpSettingsScreen';
import { useTranslation } from '@/i18n';

export default function HelpRoute() {
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('help.title') }} />
      <HelpSettingsScreen />
    </>
  );
}
