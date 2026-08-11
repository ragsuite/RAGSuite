export type AppChatMessageRole = 'user' | 'assistant';

export type AppChatCitation = {
  title: string;
  url: string;
  snippet?: string;
};

export type AppChatMessage = {
  id: string;
  serverMessageId?: string;
  role: AppChatMessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  streaming?: boolean;
  error?: boolean;
  sources?: AppChatCitation[];
};

export type AppChatSendResult = {
  sessionId: string;
  messageId?: string;
  answer: string;
  sources?: AppChatCitation[];
};

export type AppChatFeedbackSubmitResult = {
  ok: boolean;
};

export type AppChatStreamHandlers = {
  onTyping?: () => void;
  onToken?: (content: string) => void;
  onSlow?: () => void;
};
