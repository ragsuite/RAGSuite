import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type EdgeBackgroundColors = Partial<Record<Edge, string>>;

type Props = {
  children: React.ReactNode;
  edges?: Edge[];
  backgroundColor?: string;
  contentBackgroundColor?: string;
  edgeBackgroundColors?: EdgeBackgroundColors;
  style?: StyleProp<ViewStyle>;
};

const INSET_OVERLAY_Z = 9999;

export function AppSafeArea({
  children,
  edges = ['top', 'right', 'bottom', 'left'],
  backgroundColor,
  contentBackgroundColor,
  edgeBackgroundColors,
  style,
}: Props) {
  const { colors } = useAppTheme();
  const insets = useSafeAreaInsets();
  const shellBackground = backgroundColor ?? colors.background;
  const contentBackground = contentBackgroundColor ?? shellBackground;

  const insetOverlays = (
    <>
      {edgeBackgroundColors?.top ? (
        <View
          style={[
            styles.topInset,
            {
              height: insets.top,
              backgroundColor: edgeBackgroundColors.top,
              zIndex: INSET_OVERLAY_Z,
              elevation: INSET_OVERLAY_Z,
              pointerEvents: 'none',
            },
          ]}
        />
      ) : null}
      {edgeBackgroundColors?.bottom ? (
        <View
          style={[
            styles.bottomInset,
            {
              height: insets.bottom,
              backgroundColor: edgeBackgroundColors.bottom,
              zIndex: INSET_OVERLAY_Z,
              elevation: INSET_OVERLAY_Z,
              pointerEvents: 'none',
            },
          ]}
        />
      ) : null}
      {edgeBackgroundColors?.left ? (
        <View
          style={[
            styles.leftInset,
            {
              width: insets.left,
              backgroundColor: edgeBackgroundColors.left,
              zIndex: INSET_OVERLAY_Z,
              elevation: INSET_OVERLAY_Z,
              pointerEvents: 'none',
            },
          ]}
        />
      ) : null}
      {edgeBackgroundColors?.right ? (
        <View
          style={[
            styles.rightInset,
            {
              width: insets.right,
              backgroundColor: edgeBackgroundColors.right,
              zIndex: INSET_OVERLAY_Z,
              elevation: INSET_OVERLAY_Z,
              pointerEvents: 'none',
            },
          ]}
        />
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: shellBackground }, style]}>
      <SafeAreaView edges={edges} style={[styles.root, { backgroundColor: contentBackground }]}>
        {children}
      </SafeAreaView>
      {insetOverlays}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  topInset: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  bottomInset: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 1,
  },
  leftInset: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    zIndex: 1,
  },
  rightInset: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    right: 0,
    zIndex: 1,
  },
});
