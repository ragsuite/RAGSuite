import type { AppChatMessage } from '@/features/app-chat-widget/types/app-chat-widget.types';
import type { ChatWidgetConfig } from '@/features/chatbot-config/types/chatbot-config.types';

export const WELCOME_MESSAGE_ID = 'welcome';

export function resolveWelcomeText(config: ChatWidgetConfig, defaultText: string): string {
  return config.welcomeMessage?.trim() || config.greeting?.trim() || defaultText;
}

export function createWelcomeMessage(config: ChatWidgetConfig, defaultText: string): AppChatMessage {
  return {
    id: WELCOME_MESSAGE_ID,
    role: 'assistant',
    content: resolveWelcomeText(config, defaultText),
    createdAt: new Date().toISOString(),
  };
}

export function isWelcomeMessage(message: AppChatMessage): boolean {
  return message.id === WELCOME_MESSAGE_ID;
}
