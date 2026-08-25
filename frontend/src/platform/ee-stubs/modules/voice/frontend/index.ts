import { registerExtensionSlot } from '@/platform/extension-slots';

import { VoiceInputControl } from './VoiceInputControl';
import { VoiceOutputControl } from './VoiceOutputControl';

export function registerVoiceUi(): void {
  registerExtensionSlot(
    'chat.composer.trailing',
    VoiceInputControl as unknown as Parameters<typeof registerExtensionSlot>[1],
  );
  registerExtensionSlot(
    'search.composer.trailing',
    VoiceInputControl as unknown as Parameters<typeof registerExtensionSlot>[1],
  );
  registerExtensionSlot(
    'chat.message.actions',
    VoiceOutputControl as unknown as Parameters<typeof registerExtensionSlot>[1],
  );
  registerExtensionSlot(
    'search.result.actions',
    VoiceOutputControl as unknown as Parameters<typeof registerExtensionSlot>[1],
  );
}

export { VoiceInputControl, VoiceOutputControl };
export default registerVoiceUi;
