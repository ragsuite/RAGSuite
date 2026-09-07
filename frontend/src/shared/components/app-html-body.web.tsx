import React, { useEffect, useMemo, useRef } from 'react';
import { View } from 'react-native';

import {
  ACTIVE_CLASS,
  applySpeechWordHighlight,
  prepareSpeechWordSpans,
  useSpeechHighlight,
} from '@/platform/speech-highlight';
import { AssistantMarkdownBody } from '@/shared/components/assistant-markdown-body';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { isHtmlContent, inflateMarkdownBoldToHtml } from '@/shared/utils/html-content';
import { openCitationUrl } from '@/shared/utils/open-citation-url';

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
    return isHtmlContent(trimmed) ? inflateMarkdownBoldToHtml(trimmed) : '';
  }, [trimmed]);

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
      <style>{`
        .app-html-body {
          color: ${colors.text};
          font-family: ${fonts.sans};
          font-size: ${typography.body.fontSize}px;
          font-weight: ${typography.body.fontWeight};
          line-height: 22px;
        }
        .app-html-body h1,
        .app-html-body h2 {
          color: ${colors.text};
          font-family: ${fonts.sansSemiBold};
          font-size: ${typography.body.fontSize}px;
          font-weight: 600;
          line-height: 22px;
          margin: 16px 0 8px;
        }
        .app-html-body h3 {
          color: ${colors.text};
          font-family: ${fonts.sansSemiBold};
          font-size: ${typography.body.fontSize}px;
          font-weight: 600;
          line-height: 22px;
          margin: 12px 0 6px;
        }
        .app-html-body p {
          color: ${colors.text};
          font-size: ${typography.body.fontSize}px;
          line-height: 22px;
          margin: 0 0 12px;
        }
        .app-html-body ul,
        .app-html-body ol {
          color: ${colors.text};
          margin: 0 0 12px;
          padding-left: 20px;
        }
        .app-html-body li {
          color: ${colors.text};
          font-size: ${typography.body.fontSize}px;
          line-height: 22px;
          margin-bottom: 6px;
        }
        .app-html-body strong,
        .app-html-body b {
          font-weight: 700;
        }
        .app-html-body mark {
          background-color: ${colors.primary}26;
          color: inherit;
          border-radius: 3px;
          padding: 0 2px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .app-html-body em,
        .app-html-body i {
          font-style: italic;
        }
        .app-html-body a {
          color: ${colors.primary};
          text-decoration: underline;
        }
        .app-html-body a[href*="/documents/"][href*="/content"] {
          display: inline;
          color: ${colors.text};
          text-decoration: none;
          background-color: ${colors.ochreTint};
          border-radius: ${surfaceRadius.button}px;
          padding: 0 4px;
          font-size: 13px;
          line-height: 18px;
          white-space: nowrap;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
        .app-html-body code,
        .app-html-body pre,
        .app-html-body kbd,
        .app-html-body samp {
          font-family: ${fonts.mono};
        }
        .app-html-body .${ACTIVE_CLASS} {
          background-color: ${colors.primary}59;
          border-radius: 3px;
          box-decoration-break: clone;
          -webkit-box-decoration-break: clone;
        }
      `}</style>
      <div
        ref={rootRef}
        className="app-html-body"
        dangerouslySetInnerHTML={{ __html: content }}
      />
    </View>
  );
}
