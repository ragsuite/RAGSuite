import React from 'react';
import { View } from 'react-native';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  destructive?: boolean;
  children?: React.ReactNode;
};

/** Confirm dialog — `size="confirm"` + bordered footer. */
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
  children,
}: Props) {
  return (
    <AdaptiveOverlay
      visible={visible}
      title={title}
      subtitle={subtitle}
      size="confirm"
      presentation="dialog"
      onClose={onClose}
      footerBordered
      footer={
        <OverlayDialogFooter
          cancelLabel={cancelLabel}
          primaryLabel={confirmLabel}
          onCancel={onClose}
          onPrimary={onConfirm}
          primaryLoading={loading}
          primaryDisabled={loading}
          cancelDisabled={loading}
          primaryVariant={destructive ? 'danger' : 'primary'}
        />
      }>
      {children ?? <View />}
    </AdaptiveOverlay>
  );
}
