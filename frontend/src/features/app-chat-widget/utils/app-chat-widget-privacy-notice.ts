import type { PrivacyNoticeSettings } from '@/features/chatbot-config/types/chatbot-config.types';
import { normalizePrivacyNoticeLinkPhrases } from '@/features/chatbot-config/utils/privacy-notice-settings';

const STORAGE_PREFIX = 'ragsuite.chatbot.privacyNotice.accepted';

export type PrivacyNoticeBodySegment =
  | { type: 'text'; value: string }
  | { type: 'link'; value: string };

export function privacyNoticeAcceptanceKey(projectId: string, version: number): string {
  return `${STORAGE_PREFIX}:${projectId}:v${Math.max(1, Math.floor(version || 1))}`;
}

export function hasAcceptedPrivacyNotice(projectId: string | null | undefined, version: number): boolean {
  if (!projectId?.trim() || typeof localStorage === 'undefined') return false;
  try {
    return localStorage.getItem(privacyNoticeAcceptanceKey(projectId.trim(), version)) === '1';
  } catch {
    return false;
  }
}

export function acceptPrivacyNotice(projectId: string | null | undefined, version: number): void {
  if (!projectId?.trim() || typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(privacyNoticeAcceptanceKey(projectId.trim(), version), '1');
  } catch {
    /* ignore quota / private mode */
  }
}

/**
 * Split content into text/link segments. Longer phrases win when overlapping;
 * leftmost earliest match otherwise.
 */
export function buildPrivacyNoticeBodySegments(
  content: string,
  linkPhrases: string[] | null | undefined,
): PrivacyNoticeBodySegment[] {
  const text = String(content ?? '');
  if (!text) return [];
  const phrases = normalizePrivacyNoticeLinkPhrases(linkPhrases, text);
  if (!phrases.length) return [{ type: 'text', value: text }];

  type Match = { start: number; end: number; phrase: string };
  const matches: Match[] = [];
  for (const phrase of phrases) {
    let from = 0;
    while (from < text.length) {
      const idx = text.indexOf(phrase, from);
      if (idx === -1) break;
      matches.push({ start: idx, end: idx + phrase.length, phrase });
      from = idx + phrase.length;
    }
  }
  matches.sort((a, b) => a.start - b.start || b.end - a.end);

  const picked: Match[] = [];
  for (const match of matches) {
    const overlaps = picked.some((p) => !(match.end <= p.start || match.start >= p.end));
    if (!overlaps) picked.push(match);
  }
  picked.sort((a, b) => a.start - b.start);

  const segments: PrivacyNoticeBodySegment[] = [];
  let cursor = 0;
  for (const match of picked) {
    if (match.start > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.start) });
    }
    segments.push({ type: 'link', value: match.phrase });
    cursor = match.end;
  }
  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) });
  }
  return segments.length ? segments : [{ type: 'text', value: text }];
}

export function shouldShowPrivacyNoticeGate(options: {
  notice: PrivacyNoticeSettings | null | undefined;
  projectId: string | null | undefined;
  isOpen: boolean;
  previewMode?: boolean;
}): boolean {
  const { notice, projectId, isOpen, previewMode } = options;
  if (!notice?.enabled) return false;
  if (previewMode) return true;
  if (!isOpen) return false;
  return !hasAcceptedPrivacyNotice(projectId, notice.version);
}
