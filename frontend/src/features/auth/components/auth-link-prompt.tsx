import type { Href } from 'expo-router';
import { Link } from 'expo-router';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  prompt: string;
  linkLabel: string;
  href: Href;
};

export function AuthLinkPrompt({ prompt, linkLabel, href }: Props) {
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View style={[styles.row, { marginTop: spacing.xs, gap: spacing.xxs }]}>
      <Text style={[typography.body, { color: colors.textMuted }]}>{prompt}</Text>
      <Link href={href} style={[typography.body, styles.link, { color: colors.primary }]}>
        {linkLabel}
      </Link>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    alignItems: 'center',
  },
  link: {
  },
});
