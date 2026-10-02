import { ACTIVE_CLASS, resolveSpeechHighlightWash } from '@/platform/speech-highlight';
import type { useAppTheme } from '@/shared/hooks/use-app-theme';
import { RICH_TEXT_INDENT_CLASS_PREFIX, RICH_TEXT_MAX_INDENT } from '@/shared/utils/rich-text';

type Theme = Pick<ReturnType<typeof useAppTheme>, 'colors' | 'typography' | 'fonts' | 'surfaceRadius'>;

const INDENT_STEP_EM = 2;

function indentRules(): string {
  return Array.from({ length: RICH_TEXT_MAX_INDENT }, (_, i) => i + 1)
    .map((n) => `.app-html-body .${RICH_TEXT_INDENT_CLASS_PREFIX}${n} { margin-left: ${n * INDENT_STEP_EM}em; }`)
    .join('\n');
}

/** Scoped stylesheet for `AppHtmlBody` (assistant answers, FAQ answers, rich text sources). */
export function buildAppHtmlBodyCss({ colors, typography, fonts, surfaceRadius }: Theme): string {
  const fontSize = typography.body.fontSize;
  return `
    .app-html-body {
      color: ${colors.text};
      font-family: ${fonts.sans};
      font-size: ${fontSize}px;
      font-weight: ${typography.body.fontWeight};
      line-height: 22px;
      overflow-wrap: anywhere;
    }
    .app-html-body h1,
    .app-html-body h2 {
      color: ${colors.text};
      font-family: ${fonts.sansSemiBold};
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: 22px;
      margin: 16px 0 8px;
    }
    .app-html-body h3,
    .app-html-body h4 {
      color: ${colors.text};
      font-family: ${fonts.sansSemiBold};
      font-size: ${fontSize}px;
      font-weight: 600;
      line-height: 22px;
      margin: 12px 0 6px;
    }
    .app-html-body p {
      color: ${colors.text};
      font-size: ${fontSize}px;
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
      font-size: ${fontSize}px;
      line-height: 22px;
      margin-bottom: 6px;
    }
    .app-html-body li > p { margin: 0; }
    .app-html-body li > ul,
    .app-html-body li > ol { margin: 6px 0 0; }
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
    .app-html-body sub,
    .app-html-body sup {
      font-size: 0.75em;
      line-height: 0;
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
    .app-html-body code {
      background-color: ${colors.surfaceMuted};
      border-radius: 4px;
      padding: 1px 4px;
      font-size: 0.92em;
    }
    .app-html-body pre {
      background-color: ${colors.surfaceMuted};
      border-radius: ${surfaceRadius.input}px;
      padding: 10px 12px;
      margin: 0 0 12px;
      overflow-x: auto;
      white-space: pre-wrap;
    }
    .app-html-body pre code { background: none; padding: 0; }
    .app-html-body blockquote {
      margin: 0 0 12px;
      padding: 2px 0 2px 12px;
      border-left: 3px solid ${colors.borderStrong};
      color: ${colors.textSoft};
    }
    .app-html-body hr {
      border: 0;
      border-top: 1px solid ${colors.border};
      margin: 16px 0;
    }
    .app-html-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 0 0 12px;
      display: block;
      overflow-x: auto;
    }
    .app-html-body th,
    .app-html-body td {
      border: 1px solid ${colors.border};
      padding: 6px 8px;
      text-align: left;
      vertical-align: top;
    }
    .app-html-body th {
      background-color: ${colors.surfaceMuted};
      font-family: ${fonts.sansSemiBold};
      font-weight: 600;
    }
    .app-html-body th > p,
    .app-html-body td > p { margin: 0; }
    .app-html-body .rs-lead { font-size: 1.15em; }
    .app-html-body .rs-small { font-size: 0.85em; }
    .app-html-body .rs-muted { color: ${colors.textSoft}; }
    ${indentRules()}
    .app-html-body .${ACTIVE_CLASS} {
      background-color: ${resolveSpeechHighlightWash(colors.text)};
      border-radius: 3px;
      box-decoration-break: clone;
      -webkit-box-decoration-break: clone;
    }
  `;
}
