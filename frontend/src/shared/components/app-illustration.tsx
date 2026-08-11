import { Image } from 'expo-image';
import React from 'react';
import { StyleSheet } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  uri: string;
};

export function AppIllustration({ uri }: Props) {
  const { surfaceRadius } = useAppTheme();
  return <Image source={{ uri }} style={[styles.image, { borderRadius: surfaceRadius.card }]} contentFit="cover" />;
}

const styles = StyleSheet.create({
  image: {
    width: '100%',
    height: 150,
  },
});
