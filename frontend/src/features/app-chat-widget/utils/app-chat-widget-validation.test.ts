import { APP_CHAT_MIN_MESSAGE_LENGTH, isChatMessageLongEnough } from './app-chat-widget-validation';

describe('app-chat-widget-validation', () => {
  it('rejects empty and short trimmed messages', () => {
    expect(isChatMessageLongEnough('')).toBe(false);
    expect(isChatMessageLongEnough('  ')).toBe(false);
    expect(isChatMessageLongEnough('ab')).toBe(false);
    expect(isChatMessageLongEnough('  ab  ')).toBe(false);
  });

  it('accepts messages at or above the minimum', () => {
    expect(APP_CHAT_MIN_MESSAGE_LENGTH).toBe(3);
    expect(isChatMessageLongEnough('abc')).toBe(true);
    expect(isChatMessageLongEnough('  hello  ')).toBe(true);
  });
});
