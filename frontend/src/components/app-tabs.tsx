import { NativeTabs } from 'expo-router/unstable-native-tabs';
import React from 'react';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

export default function AppTabs() {
  const { colors } = useAppTheme();

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.surfaceMuted}
      labelStyle={{ selected: { color: colors.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
