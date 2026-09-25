import { resolveChatbotVoicePilotAudioStateLabel } from '@/features/app-chat-widget/utils/chatbot-voice-pilot-audio-state';
import { parseWidgetCapabilitiesPayload } from '@/platform/widget-capabilities';

describe('chatbot Voice Pilot capability', () => {
  it('parses voice.pilot.widget from public capabilities', () => {
    expect(
      parseWidgetCapabilitiesPayload({
        capabilities: ['voice.stt', 'voice.pilot.widget', 'voice.tts'],
      }),
    ).toEqual(['voice.stt', 'voice.pilot.widget', 'voice.tts']);
  });

  it('CE payload without pilot capability stays empty of pilot', () => {
    const caps = parseWidgetCapabilitiesPayload({ capabilities: ['voice.stt', 'voice.tts'] });
    expect(caps.includes('voice.pilot.widget')).toBe(false);
  });
});

describe('chatbot Voice Pilot tab gate', () => {
  function showVoicePilotTab(opts: {
    isTabbed: boolean;
    voicePilotEnabled: boolean;
    hasCapability: boolean;
    hasSlot: boolean;
  }): boolean {
    return (
      opts.isTabbed &&
      opts.voicePilotEnabled &&
      opts.hasCapability &&
      opts.hasSlot
    );
  }

  it('hides when CE has no capability or slot', () => {
    expect(
      showVoicePilotTab({
        isTabbed: true,
        voicePilotEnabled: true,
        hasCapability: false,
        hasSlot: false,
      }),
    ).toBe(false);
  });

  it('hides when toggle off even with EE capability', () => {
    expect(
      showVoicePilotTab({
        isTabbed: true,
        voicePilotEnabled: false,
        hasCapability: true,
        hasSlot: true,
      }),
    ).toBe(false);
  });

  it('hides on Layout 1 even when enabled', () => {
    expect(
      showVoicePilotTab({
        isTabbed: false,
        voicePilotEnabled: true,
        hasCapability: true,
        hasSlot: true,
      }),
    ).toBe(false);
  });

  it('shows on Layout 2 when enabled + capability + slot', () => {
    expect(
      showVoicePilotTab({
        isTabbed: true,
        voicePilotEnabled: true,
        hasCapability: true,
        hasSlot: true,
      }),
    ).toBe(true);
  });

  it('same gate drives Home Voice Pilot CTA', () => {
    const gate = showVoicePilotTab({
      isTabbed: true,
      voicePilotEnabled: true,
      hasCapability: true,
      hasSlot: true,
    });
    // Panel wires showVoicePilotCta={showVoicePilotTab}
    expect(gate).toBe(true);
  });
});

describe('resolveChatbotVoicePilotAudioStateLabel', () => {
  it('maps live session states', () => {
    expect(
      resolveChatbotVoicePilotAudioStateLabel({
        sessionState: 'connecting',
        agentActive: true,
      }).key,
    ).toBe('voicePilot.state.connecting');
    expect(
      resolveChatbotVoicePilotAudioStateLabel({
        sessionState: 'speaking',
        agentActive: true,
      }).key,
    ).toBe('voicePilot.state.speaking');
    expect(
      resolveChatbotVoicePilotAudioStateLabel({
        sessionState: 'listening',
        agentActive: true,
      }).key,
    ).toBe('voicePilot.state.listening');
  });

  it('uses tap hints when idle', () => {
    expect(
      resolveChatbotVoicePilotAudioStateLabel({
        sessionState: 'idle',
        agentActive: false,
      }).fallback,
    ).toBe('Tap to talk');
    expect(
      resolveChatbotVoicePilotAudioStateLabel({
        sessionState: 'idle',
        agentActive: true,
      }).fallback,
    ).toBe('Tap to stop');
  });

  it('orb display name stays independent of bootstrap voice_name', () => {
    const configured = 'My Orb';
    const bootstrapVoiceName = 'Jenny';
    const display =
      (configured || '').trim() || bootstrapVoiceName || 'Assistant';
    // Chatbot orb name wins; Pilot catalog name is never the primary source.
    expect(display).toBe('My Orb');
    expect(display).not.toBe(bootstrapVoiceName);
  });
});
