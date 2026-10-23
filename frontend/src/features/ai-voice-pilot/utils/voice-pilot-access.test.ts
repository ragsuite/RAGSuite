import { permissionGranted } from '@/features/organization/utils/workspace-permissions';
import { voicePilotAccessFromPermissions } from '@/features/ai-voice-pilot/utils/voice-pilot-access';

function accessFor(perms: string[]) {
  const granted = new Set(perms);
  return voicePilotAccessFromPermissions((permission) => permissionGranted(granted, permission));
}

describe('voicePilotAccessFromPermissions', () => {
  it('lets Chatbot Settings View open Voice Pilot without voice_pilot', () => {
    expect(accessFor(['project:read', 'chatbot_settings:read'])).toEqual({
      canUse: true,
      canSettings: false,
    });
  });

  it('lets Chatbot Settings Write mutate Voice Pilot keys', () => {
    expect(accessFor(['project:read', 'chatbot_settings:write'])).toEqual({
      canUse: true,
      canSettings: true,
    });
  });

  it('keeps standalone voice_pilot grants working', () => {
    expect(accessFor(['project:read', 'voice_pilot:read'])).toEqual({
      canUse: true,
      canSettings: false,
    });
    expect(accessFor(['project:read', 'voice_pilot:write'])).toEqual({
      canUse: true,
      canSettings: true,
    });
  });

  it('does not grant Voice Pilot from Chat training alone', () => {
    expect(accessFor(['project:read', 'chatbot_chat:read'])).toEqual({
      canUse: false,
      canSettings: false,
    });
  });
});
