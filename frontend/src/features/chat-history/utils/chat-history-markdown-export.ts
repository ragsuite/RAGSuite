import type { ChatQueryDetail } from '@/features/chat-history/types/chat-history.types';
import { downloadTextFile } from '@/shared/utils/download-text-file';

/** Reference web export: `chat-{message_id}.md` */
export function buildChatAnswerMarkdownFilename(messageId: string): string {
  const id = messageId.trim();
  return id ? `chat-${id}.md` : 'chat-answer.md';
}

/** Reference web export body: assistant answer markdown only (no frontmatter). */
export function buildChatAnswerMarkdownContent(detail: ChatQueryDetail): string {
  return detail.assistantAnswer.trim() || detail.answerPreview.trim() || 'No response recorded.';
}

export async function exportChatQueryMarkdown(detail: ChatQueryDetail): Promise<boolean> {
  const result = await downloadTextFile({
    content: buildChatAnswerMarkdownContent(detail),
    filename: buildChatAnswerMarkdownFilename(detail.messageId),
    mimeType: 'text/markdown;charset=utf-8',
  });
  return result.success;
}
