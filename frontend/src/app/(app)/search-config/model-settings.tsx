import { Redirect, Stack, type Href } from 'expo-router';
import React from 'react';

import { hrefForAppRoute } from '@/config/navigation';
import { useShowWidgetModelSettings } from '@/features/model-configuration/hooks/useShowWidgetModelSettings';
import { SearchConfigDetailScreen } from '@/features/search-config/screens/SearchConfigDetailScreen';

export default function ModelSettingsRoute() {
  const showModelSettings = useShowWidgetModelSettings();
  if (!showModelSettings) {
    return <Redirect href={hrefForAppRoute('search-config') as Href} />;
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Model settings' }} />
      <SearchConfigDetailScreen section="model" />
    </>
  );
}
