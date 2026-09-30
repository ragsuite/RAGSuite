import { registerExtensionSlot } from '@/platform/extension-slots';

import { ChatbotVoicePilotPanel } from './components/ChatbotVoicePilotPanel';
import { AiVoicePilotScreen } from './screens/AiVoicePilotScreen';

export function registerVoicePilotUi(): void {
  registerExtensionSlot(
    'chat.widget.voicePilotPanel',
    ChatbotVoicePilotPanel as unknown as Parameters<typeof registerExtensionSlot>[1],
  );
}

export { AiVoicePilotScreen, ChatbotVoicePilotPanel };
