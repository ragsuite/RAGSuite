import { shouldAppendLocalSearchTestHistory } from '@/features/search-config/utils/search-test-history-guard';

describe('search test history guard', () => {
  it('allows local append when history storage is enabled', () => {
    expect(shouldAppendLocalSearchTestHistory(true)).toBe(true);
  });

  it('blocks local append when history storage is disabled', () => {
    expect(shouldAppendLocalSearchTestHistory(false)).toBe(false);
  });
});
