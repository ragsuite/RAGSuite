import {
  CHAT_RETRIEVAL_LIMITS,
  clampToRange,
  effectiveChatMaxTokens,
  effectiveSearchMaxTokens,
} from '@/shared/constants/widget-retrieval-limits';

describe('widget retrieval limits', () => {
  it('clamps chat similarity threshold to the band the chat backend applies', () => {
    expect(clampToRange(0.7, CHAT_RETRIEVAL_LIMITS.similarityThreshold)).toBe(0.45);
    expect(clampToRange(0.1, CHAT_RETRIEVAL_LIMITS.similarityThreshold)).toBe(0.2);
    expect(clampToRange(0.3, CHAT_RETRIEVAL_LIMITS.similarityThreshold)).toBe(0.3);
  });

  it('resolves chat max tokens like the backend (default 800, minimum 500)', () => {
    expect(effectiveChatMaxTokens(null)).toBe(800);
    expect(effectiveChatMaxTokens(0)).toBe(800);
    expect(effectiveChatMaxTokens(50)).toBe(500);
    expect(effectiveChatMaxTokens(1200)).toBe(1200);
  });

  it('caps short search responses at 500 and defaults by response type', () => {
    expect(effectiveSearchMaxTokens(1000, 'short')).toBe(500);
    expect(effectiveSearchMaxTokens(0, 'short')).toBe(500);
    expect(effectiveSearchMaxTokens(0, 'long')).toBe(1000);
    expect(effectiveSearchMaxTokens(100, 'long')).toBe(400);
    expect(effectiveSearchMaxTokens(2500, 'long')).toBe(2500);
  });
});
