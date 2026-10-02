import React from 'react';
import { Text, type TextStyle } from 'react-native';

import { renderSpeechWords, type SpeechWordRenderCursor } from '@/platform/speech-highlight';
import type { HtmlInlineNode } from '@/shared/utils/html-content';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

export type HtmlTextBaseStyle = {
  fontSize: number;
  fontWeight: '400' | '500' | '600' | '700';
  color: string;
  fontFamily?: string;
  lineHeight?: number;
};

export type HtmlSpeechOptions = {
  activeWordIndex: number | null;
  cursor: SpeechWordRenderCursor;
  highlightStyle: { backgroundColor: string; borderRadius: number };
};

export type HtmlInlineDecor = {
  mark: { backgroundColor: string; borderRadius: number; paddingHorizontal?: number };
  code: { fontFamily: string; backgroundColor: string };
  linkColor: string;
};

type Options = {
  baseStyle: HtmlTextBaseStyle;
  decor: HtmlInlineDecor;
  compact?: boolean;
  speech?: HtmlSpeechOptions;
};

const SCRIPT_SCALE = 0.75;

function nodeStyle(node: HtmlInlineNode, { baseStyle, decor, compact }: Options): TextStyle {
  return {
    ...baseStyle,
    fontWeight: node.bold ? (compact ? '500' : '700') : baseStyle.fontWeight,
    fontStyle: node.italic ? 'italic' : 'normal',
    ...(node.highlight
      ? {
          backgroundColor: decor.mark.backgroundColor,
          borderRadius: decor.mark.borderRadius,
          paddingHorizontal: decor.mark.paddingHorizontal ?? 2,
        }
      : null),
    ...(node.code ? { fontFamily: decor.code.fontFamily, backgroundColor: decor.code.backgroundColor } : null),
    ...(node.script ? { fontSize: Math.round(baseStyle.fontSize * SCRIPT_SCALE) } : null),
    ...(node.href ? { color: decor.linkColor, textDecorationLine: 'underline' } : null),
  };
}

/** Inline HTML runs (bold, italic, mark, code, sub/sup, links) with optional TTS word highlight. */
export function renderInlineNodes(nodes: HtmlInlineNode[], keyPrefix: string, options: Options) {
  const { speech } = options;
  return nodes.map((node, index) => {
    const key = `${keyPrefix}_${index}`;
    const decorated = Boolean(node.bold || node.italic || node.highlight || node.code || node.script || node.href);
    const speaking = Boolean(speech && speech.activeWordIndex != null);
    if (!decorated && !speaking) return node.text;
    const style = nodeStyle(node, options);
    const href = node.href;
    return (
      <Text
        key={key}
        style={style}
        {...(href
          ? { accessibilityRole: 'link' as const, onPress: () => void openCitationUrl(href).catch(() => {}) }
          : null)}>
        {speech && speaking
          ? renderSpeechWords({
              text: node.text,
              cursor: speech.cursor,
              activeWordIndex: speech.activeWordIndex as number,
              baseStyle: style,
              highlightStyle: speech.highlightStyle,
            })
          : node.text}
      </Text>
    );
  });
}
