import React, { createContext, useContext } from 'react';

import { useAiAssistant } from '@/features/ai-assistant/hooks/useAiAssistant';

type AiAssistantContextValue = ReturnType<typeof useAiAssistant>;

const AiAssistantContext = createContext<AiAssistantContextValue | null>(null);

export function AiAssistantProvider({ children }: { children: React.ReactNode }) {
  const value = useAiAssistant();
  return <AiAssistantContext.Provider value={value}>{children}</AiAssistantContext.Provider>;
}

export function useAiAssistantContext(): AiAssistantContextValue {
  const ctx = useContext(AiAssistantContext);
  if (!ctx) {
    throw new Error('useAiAssistantContext must be used inside AiAssistantProvider');
  }
  return ctx;
}
