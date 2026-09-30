import '@/platform/ui-attach';

import { getExtensionSlot } from '@/platform/extension-slots/registry';

jest.mock('@/platform/extension-slots', () => jest.requireActual('@/platform/extension-slots/registry'));
jest.mock('@/features/voice/VoiceInputControl', () => ({ VoiceInputControl: () => null }));
jest.mock('@/features/voice/VoiceOutputControl', () => ({ VoiceOutputControl: () => null }));
jest.mock('@/features/ai-voice-pilot/components/ChatbotVoicePilotPanel', () => ({
  ChatbotVoicePilotPanel: () => null,
}));
jest.mock('@/features/ai-voice-pilot/screens/AiVoicePilotScreen', () => ({
  AiVoicePilotScreen: () => null,
}));

describe('ui-attach', () => {
  it('registers Community voice and Voice Pilot slots without Enterprise UI', () => {
    expect(getExtensionSlot('chat.composer.trailing')).toBeDefined();
    expect(getExtensionSlot('search.composer.trailing')).toBeDefined();
    expect(getExtensionSlot('chat.message.actions')).toBeDefined();
    expect(getExtensionSlot('search.result.actions')).toBeDefined();
    expect(getExtensionSlot('chat.widget.voicePilotPanel')).toBeDefined();
  });
});
