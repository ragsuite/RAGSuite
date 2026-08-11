import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  icon: React.ComponentType<{ size?: number; color?: string }>;
  title: string;
  subtitle: string;
  trailing?: React.ReactNode;
  /** Subtitle above title (default on compact layouts). */
  subtitleFirst?: boolean;
};

export function SettingsSectionHeader({ icon: Icon, title, subtitle, trailing, subtitleFirst }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const isCompact = useCrawlCompactLayout();
  const subtitleBeforeTitle = subtitleFirst ?? isCompact;

  const titleNode = (
    <Text style={[typography.body, { color: colors.text, fontWeight: '500', lineHeight: 24 }]}>{title}</Text>
  );
  const subtitleNode = (
    <Text style={[typography.body, { color: colors.textMuted, lineHeight: 22 }]}>{subtitle}</Text>
  );

  return (
    <View style={[styles.root, { gap: spacing.sm }]} accessibilityRole="header">
      <View style={styles.leading}>
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={[
            styles.iconWrap,
            {
              borderRadius: surfaceRadius.button,
              backgroundColor: colors.surfaceMuted,
              borderColor: colors.border,
            },
          ]}>
          <Icon size={20} color={colors.primary} />
        </View>
        <View style={styles.copy}>
          {subtitleBeforeTitle ? (
            <>
              {subtitleNode}
              {titleNode}
            </>
          ) : (
            <>
              {titleNode}
              {subtitleNode}
            </>
          )}
        </View>
      </View>
      {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  leading: { flexDirection: 'row', alignItems: 'flex-start', flex: 1, gap: 12, minWidth: 0 },
  trailing: { flexShrink: 0, alignSelf: 'center' },
  iconWrap: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
  copy: { flex: 1, gap: 4, minWidth: 0 },
});
