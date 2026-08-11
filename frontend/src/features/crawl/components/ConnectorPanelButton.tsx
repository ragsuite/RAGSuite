import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AppButton } from '@/shared/components/app-button';

type Props = React.ComponentProps<typeof AppButton>;

/** Primary connector actions — left-aligned, 44px compact, never full-width. */
export function ConnectorPanelButton({ size = 'compact', ...props }: Props) {
  return (
    <View style={styles.wrap}>
      <AppButton size={size} {...props} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignSelf: 'flex-start',
  },
});
