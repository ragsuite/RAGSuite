import { getRenderablePlainText } from '@/shared/utils/html-content';

/** Light cleanup so snippets read without raw HTML or markdown tokens. */
export function formatAssistantAnswerForDisplay(text: string): string {
  const plain = getRenderablePlainText(text);
  return plain
    .replace(/^###\s+\*\*(.+)\*\*/gm, '$1')
    .replace(/^###\s+/gm, '')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^\s*[-*+]\s+/gm, '• ')
    .trim();
}

/** Flatten HTML/markdown for list-row preview snippets (web Feedback parity). */
export function formatAssistantPreviewForList(text: string, maxChars = 220): string {
  const flattened = formatAssistantAnswerForDisplay(text)
    .replace(/\s*\n+\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!flattened) return '';
  if (flattened.length <= maxChars) return flattened;
  return `${flattened.slice(0, maxChars - 1).trimEnd()}…`;
}
