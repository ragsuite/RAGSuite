import { useLocalSearchParams } from 'expo-router';
import React from 'react';

import { ChatHistoryQueryDetailScreen } from '@/features/chat-history/screens/ChatHistoryQueryDetailScreen';

export default function ChatHistoryQueryDetailRoute() {
  const { queryId } = useLocalSearchParams<{ queryId: string }>();
  const messageId = typeof queryId === 'string' ? decodeURIComponent(queryId) : '';

  if (!messageId) return null;

  return <ChatHistoryQueryDetailScreen messageId={messageId} />;
}
