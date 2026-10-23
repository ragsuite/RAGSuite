import { isChatbotSettingsNavSectionVisible } from '@/features/chatbot-config/utils/chatbot-config-nav';

describe('isChatbotSettingsNavSectionVisible', () => {
  it('shows Voice Pilot with Chatbot Settings, not a separate voice_pilot key', () => {
    expect(isChatbotSettingsNavSectionVisible('voice-pilot', { showModelSettings: false })).toBe(true);
  });

  it('still hides Model when model settings are off', () => {
    expect(isChatbotSettingsNavSectionVisible('model', { showModelSettings: false })).toBe(false);
    expect(isChatbotSettingsNavSectionVisible('model', { showModelSettings: true })).toBe(true);
  });

  it('keeps other Settings chips visible', () => {
    expect(isChatbotSettingsNavSectionVisible('widget-customization', { showModelSettings: false })).toBe(
      true,
    );
    expect(isChatbotSettingsNavSectionVisible('privacy', { showModelSettings: false })).toBe(true);
  });
});
