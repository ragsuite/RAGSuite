import React, { useMemo } from 'react';
import { Info, TriangleAlert } from 'lucide-react-native';

import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { OverlayDialogFooter } from '@/shared/components/adaptive/overlay-dialog-footer';
import {
  confirmVariantButton,
  resolveConfirmVariant,
  type ConfirmVariant,
} from '@/shared/confirm/confirm-variant';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export type { ConfirmVariant };

type Props = {
  visible: boolean;
  title: string;
  /** Primary body copy (shown as AdaptiveOverlay subtitle). */
  message?: string;
  subtitle?: string;
  cancelLabel: string;
  confirmLabel: string;
  onClose: () => void;
  onConfirm: () => void;
  loading?: boolean;
  /** Prefer `variant`. Kept for callers that still pass destructive. */
  destructive?: boolean;
  variant?: ConfirmVariant;
  children?: React.ReactNode;
  showCloseButton?: boolean;
};

/** Shared confirm shell — AdaptiveOverlay confirm size + blur + variants. */
export function AppConfirmDialog({
  visible,
  title,
  message,
  subtitle,
  cancelLabel,
  confirmLabel,
  onClose,
  onConfirm,
  loading,
  destructive = false,
  variant: variantProp,
  children,
  showCloseButton = true,
}: Props) {
  const { colors } = useAppTheme();
  const variant = resolveConfirmVariant({ variant: variantProp, destructive });
  const TitleIcon = variant === 'confirm' ? Info : TriangleAlert;
  const primaryVariant = confirmVariantButton(variant);

  const { iconColor, iconBackground } = useMemo(() => {
    switch (variant) {
      case 'danger':
        return { iconColor: colors.danger, iconBackground: colors.dangerBackground };
      case 'warning':
        return { iconColor: colors.warning, iconBackground: colors.ochreTint };
      default:
        return { iconColor: colors.primary, iconBackground: colors.primaryTint };
    }
  }, [colors.danger, colors.dangerBackground, colors.ochreTint, colors.primary, colors.primaryTint, colors.warning, variant]);

  return (
    <AdaptiveOverlay
      visible={visible}
      title={title}
      subtitle={message ?? subtitle}
      size="confirm"
      presentation="dialog"
      blurBackdrop
      scrollable={false}
      titleIcon={TitleIcon}
      titleIconColor={iconColor}
      titleIconBackground={iconBackground}
      showCloseButton={showCloseButton}
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
          primaryVariant={primaryVariant}
        />
      }>
      {children ?? null}
    </AdaptiveOverlay>
  );
}
