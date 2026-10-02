import React, { useMemo, useRef } from 'react';
import { Text, View } from 'react-native';

import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { HtmlBlockView, type HtmlBlockContext } from '@/shared/components/html-body/html-block-view';
import type { HtmlTextBaseStyle } from '@/shared/components/html-body/html-inline-text';
import { resolveSpeechHighlightWash, useSpeechHighlight } from '@/platform/speech-highlight';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { isHtmlContent, inflateMarkdownBoldToHtml, parseHtmlContent } from '@/shared/utils/html-content';

type Props = {
  html: string;
  compact?: boolean;
  speechContentKey?: string;
};

type FontWeight = HtmlTextBaseStyle['fontWeight'];

export function AppHtmlBody({ html, compact = false, speechContentKey }: Props) {
  const { colors, typography, spacing, fonts } = useAppTheme();
  const { activeWordIndex, isActive } = useSpeechHighlight(speechContentKey);
  const lastActiveWordRef = useRef<number | null>(null);
  if (!isActive) {
    lastActiveWordRef.current = null;
  } else if (activeWordIndex != null) {
    lastActiveWordRef.current = activeWordIndex;
  }
  const paintWordIndex = isActive ? (activeWordIndex ?? lastActiveWordRef.current) : null;
  const speechCursor = useMemo(() => ({ index: 0 }), [html, paintWordIndex, isActive]);
  const highlightStyle = useMemo(
    () => ({
      backgroundColor: resolveSpeechHighlightWash(colors.text),
      borderRadius: 3,
    }),
    [colors.text],
  );
  const decor = useMemo(
    () => ({
      mark: { backgroundColor: `${colors.primary}26`, borderRadius: 3, paddingHorizontal: 2 },
      code: { fontFamily: fonts.mono, backgroundColor: colors.surfaceMuted },
      linkColor: colors.primary,
    }),
    [colors.primary, colors.surfaceMuted, fonts.mono],
  );
  const bodyStyle = useMemo<HtmlTextBaseStyle>(
    () => ({
      fontSize: compact ? 13 : (typography.body.fontSize ?? 14),
      fontWeight: typography.body.fontWeight as FontWeight,
      color: colors.text,
      fontFamily: typography.body.fontFamily,
      lineHeight: compact ? 18 : 22,
    }),
    [colors.text, compact, typography.body.fontFamily, typography.body.fontSize, typography.body.fontWeight],
  );
  const headingStyle = useMemo<HtmlTextBaseStyle>(
    () => ({
      ...bodyStyle,
      fontFamily: compact ? typography.body.fontFamily : fonts.sansSemiBold,
      fontWeight: (compact ? '500' : '600') as FontWeight,
    }),
    [bodyStyle, compact, fonts.sansSemiBold, typography.body.fontFamily],
  );
  const blocks = useMemo(
    () => (html.trim() && isHtmlContent(html) ? parseHtmlContent(inflateMarkdownBoldToHtml(html)) : []),
    [html],
  );

  if (!html.trim()) {
    return (
      <Text style={[bodyStyle, typography.body, { color: colors.textMuted }]}>
        No response recorded.
      </Text>
    );
  }

  // Markdown answers (incl. GFM tables) — shared renderer used by chat + search.
  if (!isHtmlContent(html)) {
    return (
      <AssistantMarkdownBody
        content={html}
        textColor={colors.text}
        mutedColor={colors.textMuted}
        linkColor={colors.ochre}
        codeBackgroundColor={colors.surfaceMuted}
        fontSize={compact ? 13 : (typography.body.fontSize ?? 14)}
        headingFontWeight={compact ? '500' : undefined}
        strongFontWeight={compact ? '500' : undefined}
        speechContentKey={speechContentKey}
      />
    );
  }

  if (blocks.length === 0) {
    return (
      <Text style={[bodyStyle, typography.body, { color: colors.textMuted }]}>
        No response recorded.
      </Text>
    );
  }

  const ctx: HtmlBlockContext = {
    bodyStyle,
    headingStyle,
    decor,
    compact,
    speech:
      isActive && paintWordIndex != null
        ? { activeWordIndex: paintWordIndex, cursor: speechCursor, highlightStyle }
        : undefined,
  };

  return (
    <View style={{ gap: compact ? spacing.xxs : spacing.sm }}>
      {blocks.map((block, index) => (
        <HtmlBlockView key={`${block.type}_${index}`} block={block} index={index} ctx={ctx} />
      ))}
    </View>
  );
}
