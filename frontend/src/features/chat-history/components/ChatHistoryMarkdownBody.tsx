import React from 'react';

import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { AppHtmlBody } from '@/shared/components/app-html-body';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { isHtmlContent } from '@/shared/utils/html-content';

type Props = {
  content: string;
  textColor?: string;
  mutedColor?: string;
  fontSize?: number;
  headingFontWeight?: '500' | '600' | '700';
  strongFontWeight?: '500' | '600' | '700';
};

export function ChatHistoryMarkdownBody({
  content,
  textColor,
  mutedColor,
  fontSize,
  headingFontWeight,
  strongFontWeight,
}: Props) {
  const { colors, typography } = useAppTheme();
  const primaryText = textColor ?? colors.text;
  const secondaryText = mutedColor ?? colors.textMuted;
  const bodySize = fontSize ?? typography.caption.fontSize ?? 14;

  if (!content.trim()) return null;

  if (isHtmlContent(content)) {
    return <AppHtmlBody html={content} compact={(fontSize ?? typography.caption.fontSize ?? 14) <= 13} />;
  }

  return (
    <AssistantMarkdownBody
      content={content}
      textColor={primaryText}
      mutedColor={secondaryText}
      linkColor={colors.primary}
      codeBackgroundColor={colors.surfaceMuted}
      fontSize={bodySize}
      headingFontWeight={headingFontWeight}
      strongFontWeight={strongFontWeight}
    />
  );
}
