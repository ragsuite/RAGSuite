import type { ModelProvider } from '@/features/search-config/types/search-config.types';

export type ProviderEgressLevel = 'none' | 'eu' | 'non_eu';

export type ProviderEgressNotice = {
  level: ProviderEgressLevel;
  messageKey: string;
  defaultMessage: string;
};

const PROVIDER_EGRESS: Record<string, ProviderEgressNotice> = {
  ollama: {
    level: 'none',
    messageKey: 'compliance.llmEgress.local',
    defaultMessage: 'Local inference — prompts and retrieved chunks stay on your infrastructure.',
  },
  'custom-llm': {
    level: 'none',
    messageKey: 'compliance.llmEgress.local',
    defaultMessage: 'Local inference — prompts and retrieved chunks stay on your infrastructure.',
  },
  mistral: {
    level: 'eu',
    messageKey: 'compliance.llmEgress.eu',
    defaultMessage:
      'Queries and retrieved document chunks are sent to Mistral (EU-oriented provider). Review your sub-processor DPA.',
  },
  openai: {
    level: 'non_eu',
    messageKey: 'compliance.llmEgress.nonEu',
    defaultMessage:
      'Queries and retrieved document chunks may be transmitted outside your infrastructure. Review your DPA and SCCs.',
  },
  anthropic: {
    level: 'non_eu',
    messageKey: 'compliance.llmEgress.nonEu',
    defaultMessage:
      'Queries and retrieved document chunks may be transmitted outside your infrastructure. Review your DPA and SCCs.',
  },
  'google-gemini': {
    level: 'non_eu',
    messageKey: 'compliance.llmEgress.nonEu',
    defaultMessage:
      'Queries and retrieved document chunks may be transmitted outside your infrastructure. Review your DPA and SCCs.',
  },
};

export function getProviderEgressNotice(provider: ModelProvider | string): ProviderEgressNotice | null {
  const key = String(provider || '').toLowerCase();
  if (!key) return null;
  return PROVIDER_EGRESS[key] ?? PROVIDER_EGRESS.openai;
}
