import React, { useEffect, useRef } from 'react';
import { StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { AppScrollView } from '@/shared/components/app-scroll-view';
import {
  createPaginatedPanelFooterWrapStyle,
  createPaginatedPanelShellStyle,
} from '@/shared/utils/paginated-panel-chrome';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { spacing } from '@/theme/spacing';

const TABLE_MAX_HEIGHT_RATIO = 0.65;

type Props = {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  /** When set, wraps header/body in a horizontal scroll region (wide audit tables). */
  horizontalScroll?: boolean;
  horizontalMinWidth?: number;
  frameStyle?: StyleProp<ViewStyle>;
  bodyStyle?: StyleProp<ViewStyle>;
  footerStyle?: StyleProp<ViewStyle>;
  /** Card corner radius for the outer panel shell (typically surfaceRadius.card). */
  panelRadius?: number;
  /** Skeleton/empty — panel renders as a closed box without a pagination footer. */
  closed?: boolean;
  /** Gap between page chrome (toolbar card) and this panel. */
  topSpacing?: number;
  /** Scroll body back to top when this key changes (page number). */
  scrollResetKey?: string | number;
};

export function PaginatedTablePanel({
  header,
  footer,
  children,
  horizontalScroll = false,
  horizontalMinWidth,
  frameStyle,
  bodyStyle,
  footerStyle,
  panelRadius,
  closed: _closed,
  topSpacing = spacing.lg,
  scrollResetKey,
}: Props) {
  const { colors } = useAppTheme();
  const { height: windowHeight } = useWindowDimensions();
  const bodyScrollRef = useRef<React.ComponentRef<typeof AppScrollView> | null>(null);
  const maxBodyHeight = Math.max(240, Math.round(windowHeight * TABLE_MAX_HEIGHT_RATIO));

  useEffect(() => {
    bodyScrollRef.current?.scrollTo?.({ y: 0, animated: false });
  }, [scrollResetKey]);

  const usesChromeShell = panelRadius != null;
  const shellStyle = usesChromeShell
    ? createPaginatedPanelShellStyle({
        panelRadius,
        borderColor: colors.border,
        surfaceColor: colors.surface,
        topSpacing,
      })
    : [styles.frame, { marginTop: topSpacing }, frameStyle];

  const footerWrapStyle =
    usesChromeShell && footer
      ? createPaginatedPanelFooterWrapStyle({ borderColor: colors.border })
      : undefined;

  const tableBlock = (
    <>
      {header}
      <AppScrollView
        ref={bodyScrollRef}
        nestedScrollEnabled
        keyboardShouldPersistTaps="handled"
        style={[styles.body, { maxHeight: maxBodyHeight }, bodyStyle]}
        contentContainerStyle={styles.bodyContent}>
        {children}
      </AppScrollView>
    </>
  );

  return (
    <View style={usesChromeShell ? shellStyle : [styles.frame, { marginTop: topSpacing }, frameStyle]}>
      {horizontalScroll ? (
        <AppScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ minWidth: horizontalMinWidth, flexGrow: 1 }}>
          <View style={{ width: horizontalMinWidth, minWidth: horizontalMinWidth }}>{tableBlock}</View>
        </AppScrollView>
      ) : (
        tableBlock
      )}
      {footer ? <View style={[footerWrapStyle, footerStyle]}>{footer}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    width: '100%',
    overflow: 'hidden',
  },
  body: {
    width: '100%',
  },
  bodyContent: {
    flexGrow: 1,
  },
});
