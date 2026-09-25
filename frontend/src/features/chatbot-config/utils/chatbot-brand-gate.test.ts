import {
  applyEffectiveChatbotBrandToConfig,
  applyEffectiveChatbotBrandToCustomization,
  CE_CHATBOT_BRAND_TITLE,
  canCustomizeChatbotBrand,
  resolveEffectiveChatbotLogoUrl,
  resolveEffectiveChatbotTitle,
  shouldLinkChatbotBrandToProduct,
} from '@/features/chatbot-config/utils/chatbot-brand-gate';
import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';

const baseConfig = {
  title: 'Acme Bot',
  heroTitle: '',
  heroSubtitle: 'Hello',
  widgetLayout: 'direct' as const,
  homeDisplayName: '',
  homeStatusText: '',
  homeCtaLabel: '',
  bubbleMessage: 'Chat',
  welcomeMessage: 'Hi',
  language: 'en',
  greeting: 'Hi',
  placeholder: 'Message',
  showLauncher: true,
  launcherLabel: 'Chat',
  position: 'bottom-right' as const,
  accentColor: '#2E6A4E',
};

const baseCustomization = {
  logoUrl: 'https://example.com/logo.png',
  avatarId: 'default-1',
  avatarUrl: null,
  primaryColor: '#2E6A4E',
  secondaryColor: '#1E3A30',
  gradientAngle: 135,
  fontSize: 14,
  bubbleRadius: 50,
  avatarSize: 38,
  widgetBottomSpace: 15,
  customWidthEnabled: false,
  widgetWidth: 400,
  customHeightEnabled: false,
  widgetHeight: 600,
  panelBorderRadius: 20,
  showBackdrop: false,
  showSpeechInput: true,
  showSpeechOutput: true,
  voicePilotEnabled: false,
  voicePilotProvider: 'elevenlabs',
  voicePilotOrbName: '',
  shadow: false,
  headerColor: '#2E6A4E',
  backgroundColor: '#1a1a1a',
  textColor: '#ffffff',
  showLogo: true,
  logoShape: 'circle',
  logoBorderRadius: 8,
  showDateTime: true,
  showDisclaimer: true,
  disclaimerText: '',
  showDisclaimerLink: true,
  disclaimerLinkLabel: '',
  disclaimerLinkUrl: '',
} satisfies ChatWidgetCustomization;

describe('chatbot-brand-gate', () => {
  it('CE cannot customize brand', () => {
    expect(canCustomizeChatbotBrand(false)).toBe(false);
    expect(canCustomizeChatbotBrand(true)).toBe(true);
  });

  it('forces RAGSuite title and null logo on CE', () => {
    expect(resolveEffectiveChatbotTitle('Acme', false)).toBe(CE_CHATBOT_BRAND_TITLE);
    expect(resolveEffectiveChatbotLogoUrl('https://example.com/logo.png', false)).toBeNull();
  });

  it('keeps custom title and logo on EE', () => {
    expect(resolveEffectiveChatbotTitle('Acme', true)).toBe('Acme');
    expect(resolveEffectiveChatbotLogoUrl('https://example.com/logo.png', true)).toBe(
      'https://example.com/logo.png',
    );
  });

  it('applies effective brand to config and customization', () => {
    const config = applyEffectiveChatbotBrandToConfig(baseConfig as ChatWidgetConfig, false);
    const customization = applyEffectiveChatbotBrandToCustomization(
      {
        ...baseCustomization,
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      false,
    );
    expect(config.title).toBe(CE_CHATBOT_BRAND_TITLE);
    expect(config.heroSubtitle).toBe('Hello');
    expect(customization.logoUrl).toBeNull();
    expect(customization.showLogo).toBe(true);
    expect(customization.showDisclaimer).toBe(true);
    expect(customization.disclaimerText).toBe('');
    expect(customization.showDisclaimerLink).toBe(true);
    expect(customization.disclaimerLinkLabel).toBe('');
    expect(customization.disclaimerLinkUrl).toBe('');
  });

  it('keeps disclaimer overrides on EE', () => {
    const customization = applyEffectiveChatbotBrandToCustomization(
      {
        ...baseCustomization,
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      true,
    );
    expect(customization.showDisclaimer).toBe(false);
    expect(customization.disclaimerText).toBe('Custom');
    expect(customization.showDisclaimerLink).toBe(false);
    expect(customization.disclaimerLinkLabel).toBe('acme.com');
    expect(customization.disclaimerLinkUrl).toBe('https://acme.com');
  });
});

describe('shouldLinkChatbotBrandToProduct', () => {
  it('links when title is default and logo is empty (CE / EE default)', () => {
    expect(
      shouldLinkChatbotBrandToProduct({ title: CE_CHATBOT_BRAND_TITLE, logoUrl: null }),
    ).toBe(true);
    expect(shouldLinkChatbotBrandToProduct({ title: 'ragsuite', logoUrl: '' })).toBe(true);
    expect(shouldLinkChatbotBrandToProduct({ title: '', logoUrl: null })).toBe(true);
  });

  it('links when only title or only logo is customized', () => {
    expect(
      shouldLinkChatbotBrandToProduct({
        title: 'Acme',
        logoUrl: null,
      }),
    ).toBe(true);
    expect(
      shouldLinkChatbotBrandToProduct({
        title: CE_CHATBOT_BRAND_TITLE,
        logoUrl: 'https://example.com/logo.png',
      }),
    ).toBe(true);
  });

  it('does not link when both title and logo are customized', () => {
    expect(
      shouldLinkChatbotBrandToProduct({
        title: 'Acme',
        logoUrl: 'https://example.com/logo.png',
      }),
    ).toBe(false);
  });
});
