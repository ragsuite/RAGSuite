import { Platform, type TextStyle, type ViewStyle } from 'react-native';

/**
 * Web bordered controls use border-color shift only — no outline ring (avoids double borders).
 * Non-web: 2px pine-bright focus ring with offset (AGENTS.md §7).
 */
export function focusRingStyle(focused: boolean | undefined, ringColor: string): ViewStyle {
  if (!focused || Platform.OS === 'web') {
    return {};
  }

  return {
    outlineStyle: 'solid',
    outlineWidth: 2,
    outlineColor: ringColor,
    outlineOffset: 2,
  } as ViewStyle;
}

/** Web-only border highlight for focused bordered shells (inputs, selects, buttons). */
export function webFocusBorderStyle(
  focused: boolean | undefined,
  ringColor: string,
  defaultBorderColor: string,
): ViewStyle {
  if (Platform.OS !== 'web') {
    return {};
  }

  return {
    borderColor: focused ? ringColor : defaultBorderColor,
  };
}

/** Hide the browser default outline on native text inputs. */
export function webSuppressInputOutline(): TextStyle {
  if (Platform.OS !== 'web') {
    return {};
  }

  return {
    outlineStyle: 'none',
    outlineWidth: 0,
  } as TextStyle;
}

/** Hide the browser default outline on pressable controls (buttons, triggers). */
export function webSuppressFocusOutline(): ViewStyle {
  if (Platform.OS !== 'web') {
    return {};
  }

  return {
    outlineStyle: 'none',
    outlineWidth: 0,
  } as unknown as ViewStyle;
}

/** Search/filter field shell — pine border on focus; single border on web. */
export function focusFieldShellStyle(
  focused: boolean | undefined,
  ringColor: string,
  defaultBorderColor: string,
): ViewStyle {
  if (Platform.OS === 'web') {
    return webFocusBorderStyle(focused, ringColor, defaultBorderColor);
  }

  return {
    borderColor: focused ? ringColor : defaultBorderColor,
    ...focusRingStyle(focused, ringColor),
  };
}
