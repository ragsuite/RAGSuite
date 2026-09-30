import { registerVoicePilotUi } from '@/features/ai-voice-pilot/register';
import { registerVoiceUi } from '@/features/voice/register';
import { attachEnterpriseUi } from '@ragsuite-ee/boot';

/**
 * Register module UI slots once at app/embed start: Community modules first,
 * then Enterprise UI (Metro resolves `@ragsuite-ee/boot` to EE or CE no-op stubs).
 */
registerVoiceUi();
registerVoicePilotUi();
attachEnterpriseUi();
