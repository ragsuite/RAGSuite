import React, { useMemo } from 'react';
import { Text } from 'react-native';

import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { prepareStreamingMarkdown } from '@/shared/utils/prepare-streaming-markdown';
import { isHtmlContent } from '@/shared/utils/html-content';

type Props = {
  content: string;
  textColor: string;
  mutedColor: string;
  linkColor: string;
  codeBackgroundColor: string;
  fontSize: number;
  streaming?: boolean;
};

function StreamingCursor({ color }: { color: string }) {
  return (
    <Text
      style={{
        color,
        fontSize: 14,
        lineHeight: 20,
        opacity: 0.85,
      }}>
      ▍
    </Text>
  );
}

export function AppChatWidgetMarkdownBody({
  content,
  textColor,
  mutedColor,
  linkColor,
  codeBackgroundColor,
  fontSize,
  streaming = false,
}: Props) {
  const prepared = useMemo(
    () => (streaming ? prepareStreamingMarkdown(content) : content),
    [content, streaming],
  );

  if (!prepared.trim()) return null;

  if (isHtmlContent(prepared)) {
    return <AppHtmlBody html={prepared} />;
  }

  return (
    <AssistantMarkdownBody
      content={prepared}
      textColor={textColor}
      mutedColor={mutedColor}
      linkColor={linkColor}
      codeBackgroundColor={codeBackgroundColor}
      fontSize={fontSize}
      trailing={streaming ? <StreamingCursor color={textColor} /> : null}
    />
  );
}
