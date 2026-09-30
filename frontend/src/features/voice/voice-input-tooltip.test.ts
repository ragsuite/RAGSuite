import { voiceInputTooltipPlacement } from './voice-input-tooltip';

describe('voiceInputTooltipPlacement', () => {
  it('places the search tooltip beside the mic (inside the field)', () => {
    expect(voiceInputTooltipPlacement('search')).toBe('beside');
  });

  it('places the chat tooltip above the mic', () => {
    expect(voiceInputTooltipPlacement('chat')).toBe('above');
  });

  it('defaults to above when surface is omitted', () => {
    expect(voiceInputTooltipPlacement(undefined)).toBe('above');
  });
});
