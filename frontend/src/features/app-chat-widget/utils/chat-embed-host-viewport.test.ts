import { parseChatEmbedHostViewportMessage } from '@/features/app-chat-widget/utils/chat-embed-host-viewport';

describe('parseChatEmbedHostViewportMessage', () => {
  it('parses host innerWidth/innerHeight from the loader', () => {
    expect(
      parseChatEmbedHostViewportMessage({
        source: 'ragsuite-chatbot-host',
        type: 'viewport',
        width: 1440.4,
        height: 1000.6,
      }),
    ).toEqual({ width: 1440, height: 1001 });
  });

  it('rejects missing, zero, or non-host payloads', () => {
    expect(parseChatEmbedHostViewportMessage(null)).toBeNull();
    expect(
      parseChatEmbedHostViewportMessage({
        source: 'ragsuite-chatbot-host',
        type: 'theme',
        width: 1440,
        height: 1000,
      }),
    ).toBeNull();
    expect(
      parseChatEmbedHostViewportMessage({
        source: 'ragsuite-chatbot-host',
        type: 'viewport',
        width: 0,
        height: 800,
      }),
    ).toBeNull();
    expect(
      parseChatEmbedHostViewportMessage({
        source: 'ragsuite-chatbot-embed',
        type: 'viewport',
        width: 1440,
        height: 1000,
      }),
    ).toBeNull();
  });
});
