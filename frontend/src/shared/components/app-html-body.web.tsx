import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import {
  applySpeechWordHighlight,
  prepareSpeechWordSpans,
  useSpeechHighlight,
} from '@/platform/speech-highlight';
import { buildAppHtmlBodyCss } from '@/shared/components/app-html-body.styles.web';
import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { isHtmlContent, inflateMarkdownBoldToHtml } from '@/shared/utils/html-content';
import { openCitationUrl } from '@/shared/utils/open-citation-url';
import { sanitizeDisplayHtml } from '@/shared/utils/sanitize-html';

type Props = {
  html: string;
  speechContentKey?: string;
};

export function AppHtmlBody({ html, speechContentKey }: Props) {
  const { colors, typography, fonts, surfaceRadius } = useAppTheme();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const { activeWordIndex, isActive } = useSpeechHighlight(speechContentKey);
  const activeWordIndexRef = useRef(activeWordIndex);
  activeWordIndexRef.current = activeWordIndex;
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;
  const trimmed = html.trim();
  const content = useMemo(() => {
    if (!trimmed) return '';
    // HTML answers only — markdown is rendered via AssistantMarkdownBody (native parity).
    return isHtmlContent(trimmed) ? sanitizeDisplayHtml(inflateMarkdownBoldToHtml(trimmed)) : '';
  }, [trimmed]);
  const css = useMemo(
    () => buildAppHtmlBodyCss({ colors, typography, fonts, surfaceRadius }),
    [colors, typography, fonts, surfaceRadius],
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const onClick = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor?.href) return;
      const href = anchor.getAttribute('href') || anchor.href;
      if (!/\/api\/v1\/documents\/[^/]+\/content/i.test(href)) return;
      event.preventDefault();
      event.stopPropagation();
      void openCitationUrl(href).catch(() => {});
    };

    root.addEventListener('click', onClick);
    return () => root.removeEventListener('click', onClick);
  }, [content]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root || !content) return;

    // Only rebuild spans when HTML changes — toggling isActive used to wipe
    // innerHTML and made the highlighter disappear / restart at word 0.
    root.innerHTML = content;
    prepareSpeechWordSpans(root);
    if (isActiveRef.current) {
      applySpeechWordHighlight(root, activeWordIndexRef.current);
    }
  }, [content]);

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!isActive) {
      applySpeechWordHighlight(root, -1);
      return;
    }
    // Session armed (wordIndex -1) — keep the last painted word instead of clearing.
    if (activeWordIndex == null) return;
    if (!root.querySelector('[data-speech-word-index]')) {
      prepareSpeechWordSpans(root);
    }
    applySpeechWordHighlight(root, activeWordIndex);
  }, [activeWordIndex, isActive]);

  if (!trimmed) {
    return (
      <View>
        <span
          style={{
            color: colors.textMuted,
            fontFamily: fonts.sans,
            fontSize: typography.body.fontSize,
            lineHeight: '22px',
          }}>
          No response recorded.
        </span>
      </View>
    );
  }

  // Markdown answers (incl. GFM tables) — same renderer as native AppHtmlBody / chat.
  if (!isHtmlContent(trimmed)) {
    return (
      <AssistantMarkdownBody
        content={trimmed}
        textColor={colors.text}
        mutedColor={colors.textMuted}
        linkColor={colors.ochre}
        codeBackgroundColor={colors.surfaceMuted}
        fontSize={typography.body.fontSize ?? 14}
        speechContentKey={speechContentKey}
      />
    );
  }

  return (
    <View>
      <style>{css}</style>
      <div
        ref={rootRef}
        className="app-html-body"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </View>
  );
}
