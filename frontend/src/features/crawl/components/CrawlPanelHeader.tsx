import type { LucideIcon } from 'lucide-react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { AppButton } from '@/shared/components/app-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Action = {
  label: string;
  icon?: LucideIcon;
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
};

type Props = {
  title: string;
  subtitle: string;
  meta?: string;
  /** On compact layouts, hide title when screen-level nav already shows context. */
  hideTitle?: boolean;
  /** When true, subtitle appears above the title (default on compact when title is shown). */
  subtitleFirst?: boolean;
  action?: Action;
};

export function CrawlPanelHeader({ title, subtitle, meta, hideTitle, subtitleFirst, action }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const isCompact = useCrawlCompactLayout();
  const hideIntroOnCompact = isCompact && hideTitle;
  const showTitle = !hideTitle;
  const showSubtitle = !hideIntroOnCompact;
  const showMeta = Boolean(meta) && !hideIntroOnCompact;
  const subtitleBeforeTitle = subtitleFirst ?? (isCompact && showTitle);
  const hasIntroCopy = showTitle || showSubtitle || showMeta;

  if (hideIntroOnCompact && !action) {
    return null;
  }

  const titleNode = showTitle ? (
    <Text accessibilityRole="header" style={[typography.headingSemibold, { color: colors.text }]}>
      {title}
    </Text>
  ) : null;

  const subtitleNode = showSubtitle ? (
    <Text style={[typography.body, { color: colors.textMuted }]}>{subtitle}</Text>
  ) : null;

  return (
    <View style={[styles.root, isCompact && styles.rootMobile, { gap: spacing.sm }]}>
      {hasIntroCopy ? (
        <View style={{ flex: 1, gap: 4 }}>
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
          {showMeta ? <Text style={[typography.caption, { color: colors.textMuted }]}>{meta}</Text> : null}
        </View>
      ) : null}
      {action ? (
        <AppButton
          label={action.label}
          onPress={action.onPress}
          disabled={action.disabled}
          icon={action.icon}
          variant="cta"
          size="compact"
          fullWidth={isCompact}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  rootMobile: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
});
