import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

const DEFAULT_LEFT_WIDTH = 300;

type Props = {
  header: React.ReactNode;
  left: React.ReactNode;
  right: React.ReactNode;
  leftWidth?: number;
  contentMaxWidth?: number;
  horizontalPadding?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Mail-app style layout: fixed chrome above, two independently scrolling columns below.
 * Parent must give this a bounded height (flex: 1 in a screen root).
 */
export function SessionMasterDetailShell({
  header,
  left,
  right,
  leftWidth = DEFAULT_LEFT_WIDTH,
  contentMaxWidth,
  horizontalPadding,
  style,
}: Props) {
  const { colors, spacing } = useAppTheme();

  return (
    <View style={[styles.root, style]}>
      <View
        style={[
          styles.chrome,
          {
            paddingHorizontal: horizontalPadding ?? spacing.md,
            maxWidth: contentMaxWidth,
            width: '100%',
            alignSelf: 'center',
          },
        ]}>
        {header}
      </View>
      <View
        style={[
          styles.splitWrap,
          {
            paddingHorizontal: horizontalPadding ?? spacing.md,
            maxWidth: contentMaxWidth,
            width: '100%',
            alignSelf: 'center',
            paddingTop: spacing.md,
            paddingBottom: spacing.md,
          },
        ]}>
        <View
          style={[
            styles.split,
            {
              borderColor: colors.border,
              borderWidth: StyleSheet.hairlineWidth,
              backgroundColor: colors.surface,
              borderRadius: 8,
              overflow: 'hidden',
            },
          ]}>
          <View
            style={[
              styles.left,
              {
                width: leftWidth,
                borderRightWidth: StyleSheet.hairlineWidth,
                borderRightColor: colors.border,
              },
            ]}>
            {left}
          </View>
          <View style={styles.right}>{right}</View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
  },
  chrome: {
    flexShrink: 0,
  },
  splitWrap: {
    flex: 1,
    minHeight: 0,
  },
  split: {
    flex: 1,
    minHeight: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  left: {
    flexShrink: 0,
    minHeight: 0,
  },
  right: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },
});
