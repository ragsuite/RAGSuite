import { ExternalLink } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { Keyframe } from 'react-native-reanimated';

import { motionDuration, useReducedMotion } from '@/shared/hooks/use-reduced-motion';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { brandTokens } from '@/theme/brand-tokens';
import { parseCitationUrl } from '@/shared/utils/citation-url';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

type CitationChipProps = {
  index: number;
  /** Defaults to `[n]` per AGENTS.md signature spec. */
  label?: string;
};

export function CitationChip({ index, label }: CitationChipProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const reducedMotion = useReducedMotion();
  const duration = motionDuration(reducedMotion, brandTokens.motion.verify);

  const entering = useMemo(() => {
    if (reducedMotion) return undefined;
    return new Keyframe({
      0: { opacity: 0, transform: [{ scale: 0.96 }] },
      100: { opacity: 1, transform: [{ scale: 1 }] },
    }).duration(duration);
  }, [duration, reducedMotion]);

  return (
    <Animated.Text
      entering={entering}
      style={[
        typography.citation,
        styles.chip,
        {
          backgroundColor: colors.ochreTint,
          color: colors.text,
          borderRadius: surfaceRadius.button,
          paddingHorizontal: spacing.xxs + 2,
          marginHorizontal: 2,
        },
      ]}>
      {label ?? `[${index}]`}
    </Animated.Text>
  );
}

type CitationSourceLineProps = {
  url: string;
  onPress?: () => void;
};

export function CitationSourceLine({ url, onPress }: CitationSourceLineProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { domain, path } = parseCitationUrl(url);
  const isInternalDocument = domain === 'Document' && !path;
  const display = isInternalDocument ? 'Document' : `${domain}${path}`;

  const content = (
    <View style={[styles.sourceRow, { gap: spacing.xs }]}>
      <View style={[styles.sourceDot, { backgroundColor: colors.ochre }]} />
      <Text style={[typography.citation, { color: colors.textMuted, flexShrink: 1 }]} numberOfLines={1}>
        {display}
      </Text>
    </View>
  );

  if (!onPress) {
    return content;
  }

  return (
    <Pressable
      accessibilityRole="link"
      onPress={onPress}
      hitSlop={6}
      style={({ pressed, hovered }) => ({
        opacity: pressed ? 0.75 : 1,
        backgroundColor: hovered ? colors.surfaceHover : 'transparent',
        borderRadius: surfaceRadius.button,
      })}>
      {content}
    </Pressable>
  );
}

type CitationCardProps = {
  index: number;
  title: string;
  url?: string;
  excerpt?: string;
  /** Inline chip in title row vs stacked card layout. */
  variant?: 'card' | 'compact' | 'inline';
  /** When false (chat widget), hide domain/path under the title. Default true. */
  showUrlPath?: boolean;
  /** Override card corner radius (e.g. match chat bubble curve). */
  borderRadius?: number;
  /** Match assistant response font size when set. */
  titleFontSize?: number;
  /** Index badge shape — circle for Search Test / bubble UIs. */
  indexShape?: 'rounded' | 'circle';
  style?: StyleProp<ViewStyle>;
  palette?: {
    background: string;
    border: string;
    text: string;
    muted: string;
    accent: string;
    chipBackground: string;
    hoverBackground?: string;
  };
};

export function CitationCard({
  index,
  title,
  url,
  excerpt,
  variant = 'card',
  showUrlPath = true,
  borderRadius,
  titleFontSize,
  indexShape = 'rounded',
  style,
  palette,
}: CitationCardProps) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const resolved = palette ?? {
    background: colors.surface,
    border: colors.border,
    text: colors.text,
    muted: colors.textMuted,
    accent: colors.ochre,
    chipBackground: colors.ochreTint,
    hoverBackground: colors.surfaceHover,
  };
  const compactHoverBackground = resolved.hoverBackground ?? resolved.background;

  const openSource = url
    ? () => {
        void openCitationUrl(url).catch(() => {
          // Tokenized PDF open failed — do not navigate to bare /content (auth wall / 404).
        });
      }
    : undefined;

  if (variant === 'inline') {
    return (
      <View style={[styles.inlineWrap, { gap: spacing.xxs }, style]}>
        <Text style={[typography.body, { color: colors.text, lineHeight: 22 }]}>
          {title}
          <CitationChip index={index} />
        </Text>
        {url && showUrlPath ? <CitationSourceLine url={url} onPress={openSource} /> : null}
      </View>
    );
  }

  if (variant === 'compact') {
    const { domain, path } = parseCitationUrl(url ?? '');
    const isInternalDocument = domain === 'Document' && !path;
    const sourceLabel = isInternalDocument ? 'Document' : `${domain || ''}${path}`;
    const titleOnly = !showUrlPath;
    const resolvedTitleSize = titleFontSize ?? typography.body.fontSize ?? 14;
    const titleLineHeight = Math.max(resolvedTitleSize + 4, titleOnly ? resolvedTitleSize + 6 : 19);
    const cardRadius = borderRadius ?? surfaceRadius.input;
    const indexSize = titleOnly ? 22 : 28;
    const indexRadius = indexShape === 'circle' ? indexSize / 2 : Math.min(cardRadius, surfaceRadius.button);
    const content = (
      <>
        <View
          style={[
            styles.compactIndex,
            {
              width: indexSize,
              height: indexSize,
              backgroundColor: resolved.chipBackground,
              borderRadius: indexRadius,
            },
          ]}>
          <Text
            style={[
              typography.citation,
              {
                color: resolved.text,
                fontSize: titleOnly ? Math.max(11, resolvedTitleSize - 2) : typography.citation.fontSize,
              },
            ]}>
            {index}
          </Text>
        </View>
        <View style={styles.compactBody}>
          <Text
            style={{
              color: resolved.text,
              fontSize: resolvedTitleSize,
              fontWeight: '400',
              lineHeight: titleLineHeight,
            }}
            numberOfLines={2}>
            {title}
          </Text>
          {showUrlPath && url ? (
            <View style={[styles.compactMeta, { gap: spacing.xxs }]}>
              <View style={[styles.sourceDot, { backgroundColor: resolved.accent }]} />
              <Text style={[typography.citation, { color: resolved.muted, flex: 1 }]} numberOfLines={1}>
                {sourceLabel || url}
              </Text>
            </View>
          ) : showUrlPath && excerpt ? (
            <Text style={[typography.caption, { color: resolved.muted }]} numberOfLines={1}>
              {excerpt}
            </Text>
          ) : null}
        </View>
        {url ? <ExternalLink size={titleOnly ? 12 : 14} color={resolved.muted} strokeWidth={1.7} /> : null}
      </>
    );

    return (
      <Pressable
        accessibilityRole={url ? 'link' : undefined}
        accessibilityLabel={url ? `Open source ${index}: ${title}` : undefined}
        disabled={!openSource}
        onPress={openSource}
        style={({ pressed, hovered }) => [
          styles.compactCard,
          titleOnly ? styles.compactCardTitleOnly : null,
          {
            borderColor: resolved.border,
            backgroundColor: hovered ? compactHoverBackground : resolved.background,
            borderRadius: cardRadius,
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.sm,
            gap: spacing.xs,
            opacity: pressed ? 0.8 : 1,
          },
          style,
        ]}>
        {content}
      </Pressable>
    );
  }

  return (
    <View
      style={[
        styles.card,
        {
          borderColor: colors.border,
          backgroundColor: colors.surface,
          borderRadius: surfaceRadius.input,
          paddingHorizontal: spacing.sm,
          paddingVertical: spacing.xs,
          gap: spacing.xxs,
        },
        style,
      ]}>
      <View style={[styles.titleRow, { gap: spacing.xxs }]}>
        <CitationChip index={index} />
        <Text
          style={[typography.caption, { color: colors.text, flex: 1, fontWeight: '400', lineHeight: 18 }]}
          numberOfLines={2}>
          {title}
        </Text>
      </View>
      {excerpt ? (
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]} numberOfLines={3}>
          {excerpt}
        </Text>
      ) : null}
      {url ? <CitationSourceLine url={url} onPress={openSource} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  chip: {
    overflow: 'hidden',
    textAlignVertical: 'center',
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 20,
  },
  sourceDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    flexShrink: 0,
  },
  card: {
    borderWidth: 1,
    minWidth: 148,
  },
  compactCard: {
    borderWidth: 1,
    width: '100%',
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactCardTitleOnly: {
    minHeight: 0,
    alignSelf: 'stretch',
  },
  compactIndex: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  compactBody: {
    flex: 1,
    minWidth: 0,
    gap: 3,
  },
  compactMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  inlineWrap: {
    width: '100%',
  },
});
