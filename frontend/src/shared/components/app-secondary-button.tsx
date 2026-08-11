import type { LucideIcon } from 'lucide-react-native';
import React from 'react';

import { AppButton } from '@/shared/components/app-button';

type Props = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  size?: 'default' | 'compact';
  icon?: LucideIcon;
  /** @deprecated Spacing should come from parent `gap`. Kept for API compatibility. */
  noTopMargin?: boolean;
};

/** Secondary/outline control — same height box as AppButton for row alignment. */
export function AppSecondaryButton({
  label,
  onPress,
  disabled,
  loading,
  fullWidth,
  size = 'compact',
  icon,
  noTopMargin,
}: Props) {
  return (
    <AppButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      fullWidth={fullWidth}
      size={size}
      icon={icon}
      noTopMargin={noTopMargin}
      variant="outline"
    />
  );
}
