import type { LucideIcon } from 'lucide-react-native';
import React from 'react';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: LucideIcon;
  size?: number;
};

export function AppIcon({ icon: Icon, size = 18 }: Props) {
  const { colors } = useAppTheme();
  return <Icon size={size} color={colors.textMuted} />;
}
