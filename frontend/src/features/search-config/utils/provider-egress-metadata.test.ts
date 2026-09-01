import { getProviderEgressNotice } from '@/features/search-config/utils/provider-egress-metadata';

describe('provider egress metadata', () => {
  it('marks ollama as local', () => {
    expect(getProviderEgressNotice('ollama')?.level).toBe('none');
  });

  it('marks openai as non-eu egress', () => {
    expect(getProviderEgressNotice('openai')?.level).toBe('non_eu');
  });

  it('marks mistral as eu-oriented', () => {
    expect(getProviderEgressNotice('mistral')?.level).toBe('eu');
  });
});
