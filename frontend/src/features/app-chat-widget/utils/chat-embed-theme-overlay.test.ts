import {
  mergeChatEmbedConfigOverlay,
  mergeChatEmbedThemeOverlay,
  parseChatEmbedThemeMessage,
} from '@/features/app-chat-widget/utils/chat-embed-theme-overlay';
import type {
  ChatWidgetConfig,
  ChatWidgetCustomization,
} from '@/features/chatbot-config/types/chatbot-config.types';

const base: ChatWidgetCustomization = {
  logoUrl: null,
  avatarId: 'default',
  avatarUrl: null,
  primaryColor: '#111111',
  secondaryColor: '#222222',
  gradientAngle: 90,
  fontSize: 14,
  bubbleRadius: 12,
  avatarSize: 38,
  widgetBottomSpace: 0,
  customWidthEnabled: false,
  widgetWidth: 380,
  customHeightEnabled: false,
  widgetHeight: 600,
  panelBorderRadius: 20,
  showBackdrop: false,
  showSpeechInput: true,
  showSpeechOutput: true,
  shadow: true,
  headerColor: '#333333',
  backgroundColor: '#444444',
  textColor: '#555555',
  showLogo: true,
  showDateTime: false,
};

const baseConfig: ChatWidgetConfig = {
  title: 'Assistant',
  bubbleMessage: 'Chat with us',
  welcomeMessage: 'Hello',
  language: 'en',
  greeting: 'Hi',
  placeholder: 'Ask…',
  showLauncher: true,
  launcherLabel: 'Chat',
  position: 'bottom-right',
  accentColor: '#2E6A4E',
};

describe('parseChatEmbedThemeMessage', () => {
  it('parses customization and config keys from host theme message', () => {
    expect(
      parseChatEmbedThemeMessage({
        source: 'ragsuite-chatbot-host',
        type: 'theme',
        theme: {
          primaryColor: '#2E6A4E',
          backgroundColor: '#F4F1EA',
          avatarId: 'brand-1',
          launcherLabel: 'Ask RAGSuite',
          bubbleMessage: 'Need help?',
          accentColor: '#1B1A17',
          unknown: 'drop-me',
        },
      }),
    ).toEqual({
      customization: {
        primaryColor: '#2E6A4E',
        backgroundColor: '#F4F1EA',
        avatarId: 'brand-1',
      },
      config: {
        launcherLabel: 'Ask RAGSuite',
        bubbleMessage: 'Need help?',
        accentColor: '#1B1A17',
      },
    });
  });

  it('rejects non-theme messages', () => {
    expect(parseChatEmbedThemeMessage({ source: 'ragsuite-chatbot-host', type: 'focus' })).toBeNull();
    expect(parseChatEmbedThemeMessage({ type: 'theme', theme: { primaryColor: '#000' } })).toBeNull();
  });
});

describe('mergeChatEmbedThemeOverlay', () => {
  it('merges overlay onto base customization', () => {
    const merged = mergeChatEmbedThemeOverlay(base, {
      primaryColor: '#2E6A4E',
      logoUrl: null,
      avatarId: 'x',
    });
    expect(merged?.primaryColor).toBe('#2E6A4E');
    expect(merged?.logoUrl).toBeNull();
    expect(merged?.avatarId).toBe('x');
    expect(merged?.headerColor).toBe('#333333');
  });

  it('returns base when overlay empty', () => {
    expect(mergeChatEmbedThemeOverlay(base, {})).toBe(base);
  });
});

describe('mergeChatEmbedConfigOverlay', () => {
  it('merges config overlay keys', () => {
    const merged = mergeChatEmbedConfigOverlay(baseConfig, {
      launcherLabel: 'Ask RAGSuite',
      bubbleMessage: 'Need help?',
    });
    expect(merged?.launcherLabel).toBe('Ask RAGSuite');
    expect(merged?.bubbleMessage).toBe('Need help?');
    expect(merged?.accentColor).toBe('#2E6A4E');
  });

  it('clears bubbleMessage when overlay sets null', () => {
    const merged = mergeChatEmbedConfigOverlay(baseConfig, { bubbleMessage: null });
    expect(merged?.bubbleMessage).toBe('');
    expect(merged?.launcherLabel).toBe('Chat');
  });

  it('updates bubbleMessage on a later overlay', () => {
    const first = mergeChatEmbedConfigOverlay(baseConfig, { bubbleMessage: 'First hint' });
    const second = mergeChatEmbedConfigOverlay(first, { bubbleMessage: 'Second hint' });
    expect(second?.bubbleMessage).toBe('Second hint');
  });
});

describe('parseChatEmbedThemeMessage bubbleMessage clear', () => {
  it('accepts null bubbleMessage to clear the hint', () => {
    expect(
      parseChatEmbedThemeMessage({
        source: 'ragsuite-chatbot-host',
        type: 'theme',
        theme: { bubbleMessage: null },
      }),
    ).toEqual({
      customization: {},
      config: { bubbleMessage: null },
    });
  });

  it('accepts empty string bubbleMessage as clear', () => {
    expect(
      parseChatEmbedThemeMessage({
        source: 'ragsuite-chatbot-host',
        type: 'theme',
        theme: { bubbleMessage: '' },
      }),
    ).toEqual({
      customization: {},
      config: { bubbleMessage: null },
    });
  });
});
