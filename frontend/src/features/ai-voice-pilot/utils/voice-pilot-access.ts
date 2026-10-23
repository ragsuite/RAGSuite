export function voicePilotAccessFromPermissions(hasPermission: (permission: string) => boolean): {
  canUse: boolean;
  canSettings: boolean;
} {
  return {
    canUse: hasPermission('voice_pilot:read') || hasPermission('chatbot_settings:read'),
    canSettings: hasPermission('voice_pilot:write') || hasPermission('chatbot_settings:write'),
  };
}
