import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';

import { AdaptiveOverlay, type OverlaySize } from '@/shared/components/adaptive/adaptive-overlay';
import { isSideSheetSize } from '@/shared/constants/overlay-tokens';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  visible: boolean;
  title: string;
  subtitle?: string;
  titleIcon?: LucideIcon;
  size?: OverlaySize | number;
  maxWidth?: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  headerBordered?: boolean;
  footerBordered?: boolean;
  scrollable?: boolean;
  contentStyle?: StyleProp<ViewStyle>;
};

export function ConfigurationSheet({
  visible,
  title,
  subtitle,
  titleIcon,
  size = 'sideSheetForm',
  maxWidth,
  onClose,
  children,
  footer,
  headerBordered,
  footerBordered,
  scrollable = true,
  contentStyle,
}: Props) {
  const { spacing } = useAppTheme();
  const presentation = isSideSheetSize(size) ? 'sideSheet' : 'dialog';

  return (
    <AdaptiveOverlay
      visible={visible}
      title={title}
      subtitle={subtitle}
      titleIcon={titleIcon}
      size={size}
      maxWidth={maxWidth}
      presentation={presentation}
      onClose={onClose}
      footer={footer}
      headerBordered={headerBordered}
      footerBordered={footerBordered}
      scrollable={scrollable}
      contentStyle={[{ gap: spacing.md }, contentStyle]}>
      {children}
    </AdaptiveOverlay>
  );
}
