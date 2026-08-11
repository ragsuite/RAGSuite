import React from 'react';
import { type StyleProp, type ViewStyle } from 'react-native';

import { AppCard, AppCardContent } from '@/shared/components/surfaces/app-card';

/** Form container — brand card radius via AppCard / surfaceRadius. */
export function FormCard({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return (
    <AppCard style={style}>
      <AppCardContent compact>{children}</AppCardContent>
    </AppCard>
  );
}
