import React from 'react';

import { AiAssistantChatPane } from '@/features/ai-assistant/components/AiAssistantChatPane';
import { useAiAssistantContext } from '@/features/ai-assistant/providers/ai-assistant-provider';

export function AiAssistantScreen() {
  const assistant = useAiAssistantContext();

  const sessionTitle =
    assistant.sessions.find((s) => s.id === assistant.activeSessionId)?.title ?? undefined;

  return (
    <AiAssistantChatPane
      messages={assistant.messages}
      draft={assistant.draft}
      onDraftChange={assistant.setDraft}
      onSend={() => void assistant.sendMessage()}
      sending={assistant.sending}
      streamingAssistantMessageId={assistant.streamingAssistantMessageId}
      needsSettings={assistant.needsSettings}
      sessionTitle={sessionTitle}
      language={assistant.settings?.language ?? 'en'}
      onLanguageChange={(next) => void assistant.setLanguage(next)}
    />
  );
}
