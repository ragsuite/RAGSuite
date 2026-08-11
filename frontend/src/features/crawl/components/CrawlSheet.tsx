import React from 'react';
import { type LucideIcon } from 'lucide-react-native';

import { AdaptiveOverlay, type OverlaySize } from '@/shared/components/adaptive/adaptive-overlay';
import { isSideSheetSize } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  size?: OverlaySize | number;
  maxWidth?: number;
  presentation?: 'auto' | 'sideSheet' | 'dialog';
  titleIcon?: LucideIcon;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  footerBordered?: boolean;
  showCloseButton?: boolean;
};

export function CrawlSheet({
  visible,
  title,
  subtitle,
  size = 'sideSheetSm',
  maxWidth,
  presentation: presentationProp,
  titleIcon,
  onClose,
  children,
  footer,
  footerBordered,
  showCloseButton,
}: Props) {
  const { spacing } = useAppTheme();
  const presentation =
    presentationProp ?? (isSideSheetSize(size) || typeof size === 'number' || maxWidth != null ? 'sideSheet' : 'dialog');

  return (
    <AdaptiveOverlay
      visible={visible}
      title={title}
      subtitle={subtitle}
      titleIcon={titleIcon}
      size={size}
      maxWidth={maxWidth}
      presentation={size === 'confirm' || size === 'form' ? 'dialog' : presentation}
      onClose={onClose}
      footer={footer}
      footerBordered={footerBordered}
      showCloseButton={showCloseButton}
      scrollable
      contentStyle={{ gap: spacing.md }}>
      {children}
    </AdaptiveOverlay>
  );
}
