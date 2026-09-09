import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { ChatHistoryQueryDetailScreen } from '@/features/chat-history/screens/ChatHistoryQueryDetailScreen';
import { parseHistoryKindParam } from '@/features/chat-history/utils/chat-history-nav';

export default function ChatHistoryQueryDetailRoute() {
  const { queryId, kind } = useLocalSearchParams<{ queryId: string; kind?: string }>();
  const messageId = typeof queryId === 'string' ? decodeURIComponent(queryId) : '';
  const historyKind = parseHistoryKindParam(kind);

  if (!messageId) return null;

  return <ChatHistoryQueryDetailScreen messageId={messageId} kind={historyKind} />;
}
