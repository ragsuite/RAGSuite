import type {
  ChatbotConfigPrimaryTab,
  SettingsSection,
} from '@/features/chatbot-config/types/chatbot-config.types';

let pendingPrimaryTab: ChatbotConfigPrimaryTab | null = null;
let pendingSettingsSection: SettingsSection | null = null;

/** Request Chatbot to open a primary tab (survives redirect; cleared after apply). */
export function requestChatbotPrimaryTab(tab: ChatbotConfigPrimaryTab): void {
  pendingPrimaryTab = tab;
}

/** Request a Settings sidebar section (e.g. voice-pilot after redirect). */
export function requestChatbotSettingsSection(section: SettingsSection): void {
  pendingSettingsSection = section;
}

/** Convenience: open Settings → Voice Pilot. */
export function requestChatbotVoicePilot(): void {
  pendingPrimaryTab = 'settings';
  pendingSettingsSection = 'voice-pilot';
}

export function peekChatbotPrimaryTabRequest(): ChatbotConfigPrimaryTab | null {
  return pendingPrimaryTab;
}

export function peekChatbotSettingsSectionRequest(): SettingsSection | null {
  return pendingSettingsSection;
}

export function clearChatbotPrimaryTabRequest(): void {
  pendingPrimaryTab = null;
}

export function clearChatbotSettingsSectionRequest(): void {
  pendingSettingsSection = null;
}
