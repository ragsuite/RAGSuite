import type { ApiKey } from '@/features/configuration/types/configuration.types';

export const INITIAL_SAMPLE_API_KEYS: ApiKey[] = [
  {
    id: 'key-sample-test',
    name: 'test',
    description: 'Test key for n8n automation',
    maskedKey: 'rgs_live_7f3a...9c2b',
    secretKey: 'rgs_live_7f3a8b2c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e2f9c2b',
    environment: 'production',
    createdAt: '2025-11-14T10:22:00.000Z',
    lastUsedAt: '2026-06-10T14:35:00.000Z',
    requestCount: 1284,
    expiresAt: null,
  },
  {
    id: 'key-sample-staging',
    name: 'Staging integration',
    description: 'Used for staging n8n workflows',
    maskedKey: 'rgs_live_a1b2...x9y8',
    environment: 'staging',
    createdAt: '2026-01-08T09:15:00.000Z',
    lastUsedAt: '2026-05-22T11:40:00.000Z',
    requestCount: 342,
    expiresAt: '2026-07-08T09:15:00.000Z',
  },
  {
    id: 'key-sample-dev',
    name: 'Local development',
    description: '',
    maskedKey: 'rgs_live_dev1...dev9',
    environment: 'development',
    createdAt: '2026-03-20T16:00:00.000Z',
    lastUsedAt: null,
    requestCount: 0,
    expiresAt: '2026-06-20T16:00:00.000Z',
  },
];
