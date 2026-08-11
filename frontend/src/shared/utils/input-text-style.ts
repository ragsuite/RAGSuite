import { Platform, type TextStyle } from "react-native";

import { typography } from "@/theme/typography";

export const INPUT_FIELD_HEIGHT = 44;
export const INPUT_FIELD_FONT_SIZE = typography.fieldInput.fontSize;
export const INPUT_FIELD_LINE_HEIGHT = typography.fieldInput.lineHeight;

type BodyTypography = {
  fontSize?: number;
  fontWeight?: TextStyle["fontWeight"];
  lineHeight?: number;
  fontFamily?: string;
};

export type InputTextStyleOptions = {
  multiline?: boolean;
  textAlign?: TextStyle["textAlign"];
  height?: number;
  maxHeight?: number;
  /** When false, the parent shell already applies horizontal inset (search bars, etc.). */
  includeHorizontalPadding?: boolean;
  /**
   * Parent shell owns the 44px touch target and border — TextInput should flex inside it
   * instead of using a fixed height (avoids clipping under bordered wrappers).
   */
  fillContainer?: boolean;
};

/** Vertically centers single-line field text on iOS, Android, and web. */
export function getInputTextStyle(
  typography: BodyTypography = {},
  options: InputTextStyleOptions = {},
): TextStyle {
  const fontSize = typography.fontSize ?? INPUT_FIELD_FONT_SIZE;
  const fontWeight = typography.fontWeight ?? "400";
  const fontFamily = typography.fontFamily;
  const lineHeight = typography.lineHeight ?? Math.round(fontSize * 1.5);

  const includeHorizontalPadding = options.includeHorizontalPadding !== false;

  if (options.multiline) {
    return {
      fontSize,
      fontWeight,
      fontFamily,
      lineHeight,
      minWidth: 0,
      width: '100%',
      ...(options.fillContainer ? { flex: 1 } : {}),
      paddingHorizontal: includeHorizontalPadding ? 12 : 0,
      paddingTop: 12,
      paddingBottom: 12,
      textAlignVertical: 'top',
      ...(Platform.OS === 'android' ? { includeFontPadding: false } : {}),
      ...(Platform.OS === 'web'
        ? ({
            outlineStyle: 'none',
            resize: 'vertical',
          } as TextStyle)
        : {}),
    } as TextStyle;
  }

  const height = options.height ?? INPUT_FIELD_HEIGHT;
  const fillContainer = options.fillContainer === true;
  const maxHeight = options.maxHeight ?? height;
  const fixedHeight = fillContainer ? maxHeight : height;

  return {
    fontSize,
    fontWeight,
    fontFamily,
    minWidth: 0,
    width: "100%",
    height: fixedHeight,
    maxHeight: fixedHeight,
    paddingHorizontal: includeHorizontalPadding ? 12 : 0,
    paddingVertical: 0,
    marginVertical: 0,
    textAlign: options.textAlign,
    ...(Platform.OS === "android"
      ? {
          textAlignVertical: "center" as const,
          includeFontPadding: false,
          lineHeight: fontSize,
        }
      : Platform.OS === "web"
        ? {
            lineHeight: fixedHeight,
            whiteSpace: "nowrap" as const,
            overflow: "hidden" as const,
            textOverflow: "ellipsis" as const,
            outlineStyle: "none" as const,
          }
        : {}),
  } as TextStyle;
}

/** Search/toolbar inputs sit inside a padded shell — omit extra horizontal padding. */
export function getToolbarSearchInputStyle(
  typography: BodyTypography,
  height?: number,
): TextStyle {
  return getInputTextStyle(typography, {
    includeHorizontalPadding: false,
    height: height ?? INPUT_FIELD_HEIGHT,
    fillContainer: true,
  });
}
