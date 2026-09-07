import React from 'react';
import { View } from 'react-native';

import { AppConfirmDialog, type ConfirmVariant } from '@/shared/confirm/app-confirm-dialog';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  /** Prefer `variant`. Maps to danger when variant is omitted. */
  destructive?: boolean;
  variant?: ConfirmVariant;
  children?: React.ReactNode;
};

/** Confirm dialog — shared AppConfirmDialog shell (blur + variants). */
export function ConfirmOverlay({
  visible,
  title,
  subtitle,
  cancelLabel,
  confirmLabel,
  onClose,
  onConfirm,
  loading,
  destructive = false,
  variant,
  children,
}: Props) {
  return (
    <AppConfirmDialog
      visible={visible}
      title={title}
      message={subtitle}
      cancelLabel={cancelLabel}
      confirmLabel={confirmLabel}
      onClose={onClose}
      onConfirm={onConfirm}
      loading={loading}
      destructive={destructive}
      variant={variant}
    >
      {children ?? <View />}
    </AppConfirmDialog>
  );
}
