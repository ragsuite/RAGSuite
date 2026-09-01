import { parseWidgetCapabilitiesPayload } from '@/platform/widget-capabilities';
import {
  getExtensionSlot,
  registerExtensionSlot,
  resetExtensionSlots,
} from '@/platform/extension-slots/registry';

describe('parseWidgetCapabilitiesPayload', () => {
  it('returns allowed string caps only', () => {
    expect(parseWidgetCapabilitiesPayload({ capabilities: ['voice.stt', 'voice.tts'] })).toEqual([
      'voice.stt',
      'voice.tts',
    ]);
  });

  it('returns empty for missing or invalid payloads', () => {
    expect(parseWidgetCapabilitiesPayload(null)).toEqual([]);
    expect(parseWidgetCapabilitiesPayload({})).toEqual([]);
    expect(parseWidgetCapabilitiesPayload({ capabilities: [1, ''] })).toEqual([]);
  });
});

describe('extension slots', () => {
  afterEach(() => {
    resetExtensionSlots();
  });

  it('returns undefined when unregistered', () => {
    expect(getExtensionSlot('chat.composer.trailing')).toBeUndefined();
  });

  it('returns the registered component', () => {
    const Comp = () => null;
    registerExtensionSlot('chat.composer.trailing', Comp);
    expect(getExtensionSlot('chat.composer.trailing')).toBe(Comp);
  });
});
