import React, { useMemo } from 'react';
import { Text } from 'react-native';

import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { normalizeAssistantMarkdownSpacing } from '@/shared/utils/normalize-assistant-markdown-spacing';
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
  /** When omitted, follows `streaming`. TTS freeze can keep streaming prep without the cursor. */
  showCursor?: boolean;
  speechContentKey?: string;
  /** Ops-mode: open allowlisted `/(app)/…` links in-app. */
  onInAppHref?: (href: string) => void;
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
  showCursor,
  speechContentKey,
  onInAppHref,
}: Props) {
  const prepared = useMemo(() => {
    const spaced = normalizeAssistantMarkdownSpacing(content);
    return streaming ? prepareStreamingMarkdown(spaced) : spaced;
  }, [content, streaming]);
  const cursorVisible = showCursor ?? streaming;

  if (!prepared.trim()) return null;

  if (isHtmlContent(prepared)) {
    return <AppHtmlBody html={prepared} speechContentKey={speechContentKey} />;
  }

  return (
    <AssistantMarkdownBody
      content={prepared}
      textColor={textColor}
      mutedColor={mutedColor}
      linkColor={linkColor}
      codeBackgroundColor={codeBackgroundColor}
      fontSize={fontSize}
      speechContentKey={speechContentKey}
      onInAppHref={onInAppHref}
      trailing={cursorVisible ? <StreamingCursor color={textColor} /> : null}
    />
  );
}
