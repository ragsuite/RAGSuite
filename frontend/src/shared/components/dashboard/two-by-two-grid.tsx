import React from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type Props = {
  /** Exactly four cells (pad with empty views if needed). */
  children: React.ReactNode[];
  gap: number;
  style?: StyleProp<ViewStyle>;
};

/** Reliable 2×2 layout on React Native (percent + flexWrap + gap often collapses to one column). */
export function TwoByTwoGrid({ children, gap, style }: Props) {
  const items = React.Children.toArray(children).slice(0, 4);
  const rows: React.ReactNode[][] = [
    [items[0], items[1]],
    [items[2], items[3]],
  ];

  return (
    <View style={[styles.root, { gap }, style]}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={[styles.row, { gap }]}>
          {row.map((cell, cellIndex) => (
            <View key={cellIndex} style={styles.cell}>
              {cell ?? null}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    width: '100%',
  },
  cell: {
    flex: 1,
    minWidth: 0,
  },
});
