import type { ViewStyle } from 'react-native';

type PanelChromeOptions = {
  panelRadius: number;
  borderColor: string;
  backgroundColor: string;
  /** When true, empty/loading — single closed panel with bottom border on frame. */
  tableClosed: boolean;
};

/** Top frame for paginated list/table panels (header + scroll body). */
export function createPaginatedPanelFrameStyle({
  panelRadius,
  borderColor,
  backgroundColor,
  tableClosed,
}: PanelChromeOptions): ViewStyle {
  return {
    borderWidth: 1,
    borderColor,
    borderTopLeftRadius: panelRadius,
    borderTopRightRadius: panelRadius,
    borderBottomWidth: tableClosed ? 1 : 0,
    // Keep bottom radius on the outer frame so overflow clipping matches the footer shell.
    borderBottomLeftRadius: panelRadius,
    borderBottomRightRadius: panelRadius,
    overflow: 'hidden',
    backgroundColor,
  };
}

type FooterShellOptions = {
  panelRadius: number;
  borderColor: string;
  backgroundColor: string;
};

/** Footer shell attached below the scroll body — rounded bottom corners. */
export function createPaginatedPanelFooterShellStyle({
  panelRadius,
  borderColor,
  backgroundColor,
}: FooterShellOptions): ViewStyle {
  return {
    borderColor,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderBottomLeftRadius: panelRadius,
    borderBottomRightRadius: panelRadius,
    backgroundColor,
    overflow: 'hidden',
  };
}
