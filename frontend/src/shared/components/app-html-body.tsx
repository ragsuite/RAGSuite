import React, { useMemo, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import {
  renderSpeechWords,
  useSpeechHighlight,
  type SpeechWordRenderCursor,
} from '@/platform/speech-highlight';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import {
  isHtmlContent,
  parseHtmlContent,
  type HtmlInlineNode,
} from '@/shared/utils/html-content';

type Props = {
  html: string;
  compact?: boolean;
  speechContentKey?: string;
};

function renderInlineNodes(
  nodes: HtmlInlineNode[],
  keyPrefix: string,
  baseStyle: {
    fontSize: number;
    fontWeight: '400' | '500' | '600' | '700';
    color: string;
    fontFamily?: string;
  },
  compact = false,
  speech?: {
    activeWordIndex: number | null;
    cursor: SpeechWordRenderCursor;
    highlightStyle: { backgroundColor: string; borderRadius: number };
  },
  markStyle?: { backgroundColor: string; borderRadius: number; paddingHorizontal?: number },
) {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}_${index}`;
    const style = {
      ...baseStyle,
      fontWeight: node.bold ? (compact ? '500' : '700') : baseStyle.fontWeight,
      fontStyle: node.italic ? ('italic' as const) : ('normal' as const),
      ...(node.highlight && markStyle
        ? {
            backgroundColor: markStyle.backgroundColor,
            borderRadius: markStyle.borderRadius,
            paddingHorizontal: markStyle.paddingHorizontal ?? 2,
          }
        : null),
    };
    const needsTextWrapper = Boolean(node.bold || node.italic || node.highlight);
    if (needsTextWrapper) {
      return (
        <Text key={key} style={style}>
          {speech && speech.activeWordIndex != null
            ? renderSpeechWords({
                text: node.text,
                cursor: speech.cursor,
                activeWordIndex: speech.activeWordIndex,
                baseStyle: style,
                highlightStyle: speech.highlightStyle,
              })
            : node.text}
        </Text>
      );
    }
    if (speech && speech.activeWordIndex != null) {
      return (
        <Text key={key} style={style}>
          {renderSpeechWords({
            text: node.text,
            cursor: speech.cursor,
            activeWordIndex: speech.activeWordIndex,
            baseStyle: style,
            highlightStyle: speech.highlightStyle,
          })}
        </Text>
      );
    }
    return node.text;
  });
}

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
      backgroundColor: `${colors.primary}59`,
      borderRadius: 3,
    }),
    [colors.primary],
  );
  const markStyle = useMemo(
    () => ({
      backgroundColor: `${colors.primary}26`,
      borderRadius: 3,
      paddingHorizontal: 2,
    }),
    [colors.primary],
  );
  const speech =
    isActive && paintWordIndex != null
      ? { activeWordIndex: paintWordIndex, cursor: speechCursor, highlightStyle }
      : undefined;
  const bodyStyle = useMemo(
    () => ({
      fontSize: compact ? 13 : typography.body.fontSize,
      fontWeight: typography.body.fontWeight as '400' | '500' | '600' | '700',
      color: colors.text,
      fontFamily: typography.body.fontFamily,
      lineHeight: compact ? 18 : 22,
    }),
    [colors.text, compact, typography.body.fontFamily, typography.body.fontSize, typography.body.fontWeight],
  );
  const headingStyle = useMemo(
    () => ({
      ...bodyStyle,
      fontFamily: compact ? typography.body.fontFamily : fonts.sansSemiBold,
      fontWeight: (compact ? '500' : '600') as '400' | '500' | '600' | '700',
    }),
    [bodyStyle, compact, fonts.sansSemiBold, typography.body.fontFamily],
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

  const blocks = parseHtmlContent(html);

  if (blocks.length === 0) {
    return (
      <Text style={[bodyStyle, typography.body, { color: colors.textMuted }]}>
        No response recorded.
      </Text>
    );
  }

  return (
    <View style={{ gap: compact ? spacing.xxs : spacing.sm }}>
      {blocks.map((block, index) => {
        if (block.type === 'heading') {
          return (
            <Text
              key={`heading_${index}`}
              style={[
                headingStyle,
                {
                  marginTop: index > 0 ? spacing.xs : 0,
                },
              ]}>
              {renderInlineNodes(block.inline, `heading_${index}`, { ...headingStyle }, compact, speech, markStyle)}
            </Text>
          );
        }

        if (block.type === 'bullet') {
          return (
            <View key={`bullet_${index}`} style={styles.bulletRow}>
              <Text style={[bodyStyle, { color: colors.textMuted }]}>•</Text>
              <Text style={[bodyStyle, { flex: 1 }]}>
                {renderInlineNodes(block.inline, `bullet_${index}`, bodyStyle, compact, speech, markStyle)}
              </Text>
            </View>
          );
        }

        return (
          <Text key={`paragraph_${index}`} style={bodyStyle}>
            {renderInlineNodes(block.inline, `paragraph_${index}`, bodyStyle, compact, speech, markStyle)}
          </Text>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
});
