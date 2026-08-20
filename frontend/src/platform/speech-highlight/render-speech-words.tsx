import React from 'react';
import type { TextStyle } from 'react-native';
import { Text } from 'react-native';

export type SpeechWordRenderCursor = {
  index: number;
};

type RenderSpeechWordsOptions = {
  text: string;
  cursor: SpeechWordRenderCursor;
  activeWordIndex: number | null;
  baseStyle?: TextStyle;
  highlightStyle?: TextStyle;
};

/** Render plain text as nested Text nodes with a light active-word highlight. */
export function renderSpeechWords({
  text,
  cursor,
  activeWordIndex,
  baseStyle,
  highlightStyle,
}: RenderSpeechWordsOptions): React.ReactNode {
  if (!text) return null;
  if (activeWordIndex == null) return text;

  const parts = text.match(/(\s+|[^\s]+)/g);
  if (!parts?.length) return text;

  return parts.map((part, partIndex) => {
    if (/^\s+$/.test(part)) {
      return part;
    }
    const wordIndex = cursor.index;
    cursor.index += 1;
    const isActive = wordIndex === activeWordIndex;
    return (
      <Text
        key={`speech_word_${wordIndex}_${partIndex}`}
        style={isActive ? [baseStyle, highlightStyle] : baseStyle}>
        {part}
      </Text>
    );
  });
}
