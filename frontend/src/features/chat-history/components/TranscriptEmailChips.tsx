import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

const VISIBLE_COUNT = 2;

type Props = {
  emails: string[];
  /** Compact density for session list rows. */
  compact?: boolean;
  /** No top margin — for use inside a pane header band. */
  inline?: boolean;
};

export function TranscriptEmailChips({ emails, compact = false, inline = false }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!emails.length) return null;

  const overflow = emails.length - VISIBLE_COUNT;
  const visible = expanded || overflow <= 0 ? emails : emails.slice(0, VISIBLE_COUNT);
  const chipBg = inline ? colors.surface : colors.surfaceMuted;

  return (
    <View
      style={[
        styles.wrap,
        {
          gap: spacing.xxs,
          marginTop: inline || compact ? 0 : spacing.xs,
        },
      ]}>
      {visible.map((email) => (
        <View
          key={email}
          style={[
            styles.chip,
            {
              backgroundColor: chipBg,
              borderColor: colors.border,
              paddingHorizontal: spacing.sm,
              paddingVertical: compact ? 2 : 4,
            },
          ]}>
          <Text
            style={[typography.caption, { color: colors.textMuted }]}
            numberOfLines={1}>
            {email}
          </Text>
        </View>
      ))}
      {overflow > 0 ? (
        <Text
          accessibilityRole="button"
          accessibilityLabel={
            expanded
              ? t('history.sessions.emails.showLess')
              : t('history.sessions.emails.more', { count: overflow })
          }
          onPress={() => setExpanded((v) => !v)}
          style={[
            typography.caption,
            styles.more,
            {
              color: colors.primary,
              fontWeight: '600',
              paddingHorizontal: spacing.sm,
              paddingVertical: compact ? 2 : 4,
            },
          ]}>
          {expanded
            ? t('history.sessions.emails.showLess')
            : t('history.sessions.emails.more', { count: overflow })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  chip: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 999,
    maxWidth: '100%',
  },
  more: {
    borderRadius: 999,
  },
});
