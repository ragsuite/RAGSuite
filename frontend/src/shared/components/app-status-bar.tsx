import { StatusBar, type StatusBarStyle } from 'expo-status-bar';
import React from 'react';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  style?: StatusBarStyle | 'auto';
  backgroundColor?: string;
  translucent?: boolean;
  hidden?: boolean;
  animated?: boolean;
};

export function AppStatusBar({
  style = 'auto',
  backgroundColor,
  translucent = true,
  hidden = false,
  animated = true,
}: Props) {
  const { mode } = useAppTheme();
  const resolvedStyle: StatusBarStyle = style === 'auto' ? (mode === 'dark' ? 'light' : 'dark') : style;

  return (
    <StatusBar
      style={resolvedStyle}
      backgroundColor={backgroundColor}
      translucent={translucent}
      hidden={hidden}
      animated={animated}
    />
  );
}
