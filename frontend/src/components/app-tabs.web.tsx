import {
  Tabs,
  TabList,
  TabTrigger,
  TabSlot,
  TabTriggerSlotProps,
  TabListProps,
} from 'expo-router/ui';
import { SymbolView } from 'expo-symbols';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ExternalLink } from './external-link';

import { CONTENT_MAX_WIDTH } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusRingStyle } from '@/shared/utils/focus-ring-style';

export default function AppTabs() {
  return (
    <Tabs>
      <TabSlot style={{ height: '100%' }} />
      <TabList asChild>
        <CustomTabList>
          <TabTrigger name="home" href="/" asChild>
            <TabButton>Home</TabButton>
          </TabTrigger>
          <TabTrigger name="explore" href="/explore" asChild>
            <TabButton>Explore</TabButton>
          </TabTrigger>
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <Pressable
      {...props}
      style={({ pressed, focused }) => [
        pressed && styles.pressed,
        focusRingStyle(focused, colors.primary),
      ]}>
      <View
        style={[
          styles.tabButtonView,
          {
            paddingVertical: spacing.xxs,
            paddingHorizontal: spacing.sm,
            borderRadius: surfaceRadius.button,
            backgroundColor: isFocused ? colors.primaryTint : colors.surfaceMuted,
          },
        ]}>
        <Text
          style={[
            typography.caption,
            { color: isFocused ? colors.text : colors.textSoft, fontWeight: isFocused ? '600' : '400' },
          ]}>
          {children}
        </Text>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View {...props} style={styles.tabListContainer}>
      <View
        style={[
          styles.innerContainer,
          {
            paddingVertical: spacing.xs,
            paddingHorizontal: spacing.lg,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surfaceMuted,
            gap: spacing.xs,
          },
        ]}>
        <Text style={[typography.caption, styles.brandText, { color: colors.text, fontWeight: '700' }]}>
          RAGSuite
        </Text>

        {props.children}

        <ExternalLink href="https://docs.expo.dev" asChild>
          <Pressable style={({ pressed, focused }) => [styles.externalPressable, focusRingStyle(focused, colors.primary), pressed && styles.pressed]}>
            <Text style={[typography.caption, { color: colors.primary }]}>Docs</Text>
            <SymbolView tintColor={colors.text} name={{ ios: 'arrow.up.right.square', web: 'link' }} size={12} />
          </Pressable>
        </ExternalLink>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tabListContainer: {
    position: 'absolute',
    width: '100%',
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    flexDirection: 'row',
  },
  innerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flexGrow: 1,
    maxWidth: CONTENT_MAX_WIDTH,
  },
  brandText: {
    marginRight: 'auto',
  },
  pressed: {
    opacity: 0.7,
  },
  tabButtonView: {},
  externalPressable: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginLeft: 12,
  },
});
