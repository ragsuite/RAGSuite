export const CHUNK_PROFILES = ['default', 'web', 'pdf_manual', 'spreadsheet', 'faq'] as const;
export type ChunkProfile = (typeof CHUNK_PROFILES)[number];

export const DEFAULT_CHUNK_PROFILE: ChunkProfile = 'default';

export function normalizeChunkProfile(value: string | null | undefined): ChunkProfile {
  const raw = (value || DEFAULT_CHUNK_PROFILE).trim().toLowerCase();
  return (CHUNK_PROFILES as readonly string[]).includes(raw) ? (raw as ChunkProfile) : DEFAULT_CHUNK_PROFILE;
}
