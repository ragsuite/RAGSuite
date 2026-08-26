/** Minimum trimmed message length before the chat composer can send. */
export const APP_CHAT_MIN_MESSAGE_LENGTH = 3;

export function isChatMessageLongEnough(text: string, min = APP_CHAT_MIN_MESSAGE_LENGTH): boolean {
  return text.trim().length >= min;
}
