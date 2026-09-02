import { StyleSheet, type ViewStyle } from 'react-native';

type ShellStyleInput = {
  panelRadius: number;
  borderColor: string;
  surfaceColor: string;
  topSpacing?: number;
};

/** Single outer shell — owns all four rounded corners and clips footer content on web. */
export function createPaginatedPanelShellStyle({
  panelRadius,
  borderColor,
  surfaceColor,
  topSpacing = 0,
}: ShellStyleInput): ViewStyle {
  return {
    width: '100%',
    marginTop: topSpacing,
    borderWidth: 1,
    borderColor,
    borderRadius: panelRadius,
    overflow: 'hidden',
    backgroundColor: surfaceColor,
  };
}

/** Footer separator inside the shell — no side/bottom borders or corner radius. */
export function createPaginatedPanelFooterWrapStyle({
  borderColor,
}: {
  borderColor: string;
}): ViewStyle {
  return {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: borderColor,
  };
}
