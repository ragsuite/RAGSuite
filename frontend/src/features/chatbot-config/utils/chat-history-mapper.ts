import type {
  ChatConversation,
  ChatHistoryApiRow,
  ChatHistoryEntry,
  ChatHistoryMessage,
  TrainingOverviewStats,
} from '@/features/chatbot-config/types/chatbot-config.types';

function truncate(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function rowToMessages(row: ChatHistoryApiRow): ChatHistoryMessage[] {
  const messages: ChatHistoryMessage[] = [];
  if (row.user_message?.trim()) {
    messages.push({
      id: `${row.id}_user`,
      role: 'user',
      content: row.user_message.trim(),
      createdAt: row.created_at,
    });
  }
  if (row.assistant_response?.trim()) {
    messages.push({
      id: `${row.id}_assistant`,
      role: 'assistant',
      content: row.assistant_response.trim(),
      sources: row.sources?.length ? row.sources : undefined,
      createdAt: row.created_at,
      feedbackRating: row.feedback_rating,
    });
  }
  return messages;
}

export function mapChatHistoryRowsToConversations(rows: ChatHistoryApiRow[]): ChatConversation[] {
  const bySession = new Map<string, ChatHistoryApiRow[]>();
  for (const row of rows) {
    const list = bySession.get(row.session_id) ?? [];
    list.push(row);
    bySession.set(row.session_id, list);
  }

  const conversations: ChatConversation[] = [];
  for (const [sessionId, sessionRows] of bySession) {
    const sorted = [...sessionRows].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    const messages = sorted.flatMap(rowToMessages);
    const firstUser = sorted.find((r) => r.user_message?.trim());
    const title = truncate(firstUser?.user_message ?? 'Conversation', 72);
    const lastRow = sorted[sorted.length - 1];
    const previewSource = lastRow.assistant_response?.trim() || lastRow.user_message?.trim() || '';
    const failed = sorted.some((r) => r.history_status !== 'success');
    const avgLatency =
      sorted.reduce((sum, r) => sum + (r.history_total_ms ?? 0), 0) / Math.max(sorted.length, 1);

    conversations.push({
      sessionId,
      title,
      previewText: truncate(previewSource, 120),
      messageCount: messages.length,
      lastMessageAt: lastRow.created_at,
      status: failed ? 'failed' : 'success',
      latencyMs: Math.round(avgLatency),
      messages,
    });
  }

  return conversations.sort(
    (a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime(),
  );
}

export function conversationsToLegacyEntries(conversations: ChatConversation[]): ChatHistoryEntry[] {
  return conversations.map((c) => ({
    id: c.sessionId,
    sessionLabel: c.title,
    messageCount: c.messageCount,
    latencyMs: c.latencyMs,
    createdAt: c.lastMessageAt,
    status: c.status,
  }));
}

export function buildTrainingStats(
  conversations: ChatConversation[],
  systemPrompt: string,
  chatbotActive: boolean,
): TrainingOverviewStats {
  const words = systemPrompt.trim() ? systemPrompt.trim().split(/\s+/).length : 0;
  return {
    chatbotActive,
    systemPromptWordCount: words,
    systemPromptCharCount: systemPrompt.length,
    conversationCount: conversations.length,
    totalMessageCount: conversations.reduce((sum, c) => sum + c.messageCount, 0),
  };
}

export function filterConversationsByTimeRange(
  conversations: ChatConversation[],
  range: import('@/features/chatbot-config/types/chatbot-config.types').HistoryTimeRange,
): ChatConversation[] {
  if (range === 'all') return conversations;
  const now = Date.now();
  const cutoffs: Record<Exclude<typeof range, 'all'>, number> = {
    today: now - 24 * 60 * 60 * 1000,
    '7d': now - 7 * 24 * 60 * 60 * 1000,
    '30d': now - 30 * 24 * 60 * 60 * 1000,
    year: now - 365 * 24 * 60 * 60 * 1000,
  };
  const cutoff = cutoffs[range];
  return conversations.filter((c) => new Date(c.lastMessageAt).getTime() >= cutoff);
}

export function filterConversationsBySearch(
  conversations: ChatConversation[],
  query: string,
): ChatConversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter((c) => {
    if (c.title.toLowerCase().includes(q) || c.previewText.toLowerCase().includes(q)) return true;
    return c.messages.some((m) => m.content.toLowerCase().includes(q));
  });
}
