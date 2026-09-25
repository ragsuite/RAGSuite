import type { VoicePilotSessionState } from '@/features/ai-voice-pilot/types/voice-pilot.types';

export type ChatbotVoicePilotAudioStateLabel = {
  key: string;
  fallback: string;
};

/**
 * Primary status line under the chatbot Voice Pilot orb.
 * Prefer live session states over generic tap hints while active.
 */
export function resolveChatbotVoicePilotAudioStateLabel(opts: {
  sessionState: VoicePilotSessionState;
  agentActive: boolean;
  previewMode?: boolean;
}): ChatbotVoicePilotAudioStateLabel {
  if (opts.previewMode) {
    return {
      key: 'chatbot.widget.voicePilot.previewHint',
      fallback: 'Voice Pilot preview',
    };
  }

  switch (opts.sessionState) {
    case 'connecting':
      return { key: 'voicePilot.state.connecting', fallback: 'Connecting…' };
    case 'listening':
      return { key: 'voicePilot.state.listening', fallback: 'Listening…' };
    case 'thinking':
      return { key: 'voicePilot.state.thinking', fallback: 'Thinking…' };
    case 'speaking':
      return { key: 'voicePilot.state.speaking', fallback: 'Speaking…' };
    case 'error':
      return { key: 'voicePilot.state.error', fallback: 'Something went wrong' };
    case 'idle':
    default:
      if (opts.agentActive) {
        return {
          key: 'chatbot.widget.voicePilot.tapToStop',
          fallback: 'Tap to stop',
        };
      }
      return {
        key: 'chatbot.widget.voicePilot.tapToTalk',
        fallback: 'Tap to talk',
      };
  }
}
