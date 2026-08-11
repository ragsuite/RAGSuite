import React from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

type KeyboardSurface = 'screen' | 'modal';

type Props = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  /**
   * `screen` — iOS padding only (Android uses activity `adjustResize`).
   * `modal` — iOS + Android padding (Modal often ignores activity resize).
   */
  surface?: KeyboardSurface;
  enabled?: boolean;
  keyboardVerticalOffset?: number;
  pointerEvents?: 'box-none' | 'none' | 'box-only' | 'auto';
};

/**
 * Single keyboard-avoidance owner for a surface.
 *
 * Contract:
 * - Screens: use this (or FeatureScreenScroll / AppKeyboardScreenScroll).
 * - Modals/sheets: AdaptiveOverlay already wraps with `surface="modal"`.
 * - Do not nest another KeyboardAvoidingView inside.
 * - Child AppScrollView must set `automaticallyAdjustKeyboardInsets={false}`
 *   when this wrapper is enabled (avoids double padding on iOS).
 */
export function AppKeyboardAvoiding({
  children,
  style,
  surface = 'screen',
  enabled = true,
  keyboardVerticalOffset = 0,
  pointerEvents,
}: Props) {
  const isWeb = Platform.OS === 'web';
  const useAvoidance =
    enabled &&
    !isWeb &&
    (surface === 'modal' || Platform.OS === 'ios');

  if (!useAvoidance) {
    return (
      <View style={style} pointerEvents={pointerEvents}>
        {children}
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={style}
      behavior="padding"
      keyboardVerticalOffset={keyboardVerticalOffset}
      pointerEvents={pointerEvents}>
      {children}
    </KeyboardAvoidingView>
  );
}
