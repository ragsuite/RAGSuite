import React from 'react';
import {
  StyleSheet,
  type StyleProp,
  type ViewStyle,
} from 'react-native';

import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { AppScrollView, type AppScrollViewProps } from '@/shared/components/app-scroll-view';

type Props = AppScrollViewProps & {
  /** Outer flex container style (keyboard avoiding root). */
  rootStyle?: StyleProp<ViewStyle>;
};

/**
 * Root scroll for feature screens that are not using FeatureScreenScroll.
 * One keyboard owner: AppKeyboardAvoiding — do not also enable auto keyboard insets.
 */
export function AppKeyboardScreenScroll({
  rootStyle,
  style,
  children,
  automaticallyAdjustKeyboardInsets: _ignored,
  ...scrollProps
}: Props) {
  return (
    <AppKeyboardAvoiding style={[styles.root, rootStyle]} surface="screen">
      <AppScrollView
        style={[styles.flex, style]}
        automaticallyAdjustKeyboardInsets={false}
        {...scrollProps}>
        {children}
      </AppScrollView>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  flex: {
    flex: 1,
    minHeight: 0,
  },
});
