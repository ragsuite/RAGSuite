import type { LucideIcon } from 'lucide-react-native';
import React from 'react';

import { AppButton } from '@/shared/components/app-button';
import { ActionIcons } from '@/shared/constants/action-icons';

type CreateButtonProps = {
  label?: string;
  onPress: () => void;
  fullWidth?: boolean;
};

/** CTA create action — shared height with outline controls via AppButton. */
export function ConfigurationCreateButton({ label = 'Create API Key', onPress, fullWidth }: CreateButtonProps) {
  return (
    <AppButton
      label={label}
      onPress={onPress}
      fullWidth={fullWidth}
      size="compact"
      variant="cta"
      icon={ActionIcons.add}
      noTopMargin
    />
  );
}

type OutlineButtonProps = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  loading?: boolean;
  disabled?: boolean;
  accent?: boolean;
  fullWidth?: boolean;
};

/** Outline action — same compact height as AppButton primary for row alignment. */
export function ConfigurationOutlineButton({
  label,
  onPress,
  icon,
  loading,
  disabled,
  accent,
  fullWidth,
}: OutlineButtonProps) {
  return (
    <AppButton
      label={label}
      onPress={onPress}
      icon={icon}
      loading={loading}
      disabled={disabled}
      accent={accent}
      fullWidth={fullWidth}
      size="compact"
      variant="outline"
      noTopMargin
    />
  );
}
