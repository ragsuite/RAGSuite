import { Platform } from 'react-native';

import { CHATBOT_LANGUAGE_OPTIONS } from '@/features/chatbot-config/utils/chatbot-language-options';
import { normalizeEmbedSiteHost } from '@/features/app-chat-widget/utils/app-chat-widget-embed-site-host';

/** Canonical visitor language codes (same set as chatbot admin dropdown). */
export type VisitorLanguageCode = (typeof CHATBOT_LANGUAGE_OPTIONS)[number]['key'];

const SUPPORTED = new Set<string>(CHATBOT_LANGUAGE_OPTIONS.map((o) => o.key));

const STORAGE_PREFIX = 'ragsuite_visitor_language_';
const memoryStore = new Map<string, string>();

export function getVisitorLanguageStorageKey(
  projectId: string,
  siteHost?: string | null,
): string {
  const id = String(projectId || '').trim();
  const host = normalizeEmbedSiteHost(siteHost);
  return `${STORAGE_PREFIX}${id}_${host}`;
}

/**
 * Normalize chatbot / search-box language codes onto visitor language keys.
 * Falls back to empty string when unsupported (caller uses admin default).
 */
export function normalizeVisitorLanguage(code: string | null | undefined): VisitorLanguageCode | '' {
  const raw = (code ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw) return '';

  if (raw === 'en-us' || raw === 'en') return 'en';
  if (raw === 'en-uk') return 'en-gb';
  if (raw === 'pt-br' || raw === 'pt') return 'pt';
  if (raw === 'zh-cn' || raw === 'zh-hans' || raw === 'zh') return 'zh';

  if (SUPPORTED.has(raw)) return raw as VisitorLanguageCode;

  const base = raw.split('-')[0] ?? raw;
  if (base === 'en') return 'en';
  if (SUPPORTED.has(base)) return base as VisitorLanguageCode;

  return '';
}

/** Short API code for search/chat RAG language instruction (en, de, pt, …). */
export function toApiVisitorLanguage(code: string | null | undefined): string {
  const normalized = normalizeVisitorLanguage(code);
  if (!normalized) return '';
  if (normalized === 'en-gb') return 'en-gb';
  return normalized;
}

export function resolveEffectiveLanguage(
  visitorLanguage: string | null | undefined,
  adminLanguage: string | null | undefined,
  fallback = 'en',
): string {
  const fromVisitor = normalizeVisitorLanguage(visitorLanguage);
  if (fromVisitor) return fromVisitor;
  const fromAdmin = normalizeVisitorLanguage(adminLanguage);
  if (fromAdmin) return fromAdmin;
  const rawAdmin = (adminLanguage ?? '').trim();
  if (rawAdmin) return rawAdmin;
  return fallback;
}

export function readVisitorLanguage(
  projectId: string,
  siteHost?: string | null,
): VisitorLanguageCode | '' {
  const key = getVisitorLanguageStorageKey(projectId, siteHost);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      const stored = localStorage.getItem(key);
      const normalized = normalizeVisitorLanguage(stored);
      if (normalized) {
        memoryStore.set(key, normalized);
        return normalized;
      }
      return '';
    } catch {
      return normalizeVisitorLanguage(memoryStore.get(key)) || '';
    }
  }
  return normalizeVisitorLanguage(memoryStore.get(key)) || '';
}

export function writeVisitorLanguage(
  projectId: string,
  siteHost: string | null | undefined,
  language: string,
): VisitorLanguageCode | '' {
  const id = String(projectId || '').trim();
  if (!id) return '';
  const normalized = normalizeVisitorLanguage(language);
  const key = getVisitorLanguageStorageKey(id, siteHost);
  if (!normalized) {
    memoryStore.delete(key);
    if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
      try {
        localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    }
    return '';
  }
  memoryStore.set(key, normalized);
  if (Platform.OS === 'web' && typeof localStorage !== 'undefined') {
    try {
      localStorage.setItem(key, normalized);
    } catch {
      /* ignore */
    }
  }
  return normalized;
}

export async function hydrateVisitorLanguage(
  projectId: string,
  siteHost?: string | null,
): Promise<VisitorLanguageCode | ''> {
  return readVisitorLanguage(projectId, siteHost);
}

export type VisitorLanguageChangeListener = (payload: {
  projectId: string;
  siteHost: string;
  language: VisitorLanguageCode | '';
}) => void;

const listeners = new Set<VisitorLanguageChangeListener>();

export function subscribeVisitorLanguageChanges(
  listener: VisitorLanguageChangeListener,
): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifyListeners(
  projectId: string,
  siteHost: string | null | undefined,
  language: VisitorLanguageCode | '',
): void {
  const host = normalizeEmbedSiteHost(siteHost);
  listeners.forEach((listener) => {
    listener({ projectId, siteHost: host, language });
  });
}

/** Write + notify same-tab subscribers (storage event covers cross-tab). */
export function setVisitorLanguage(
  projectId: string,
  siteHost: string | null | undefined,
  language: string,
): VisitorLanguageCode | '' {
  const next = writeVisitorLanguage(projectId, siteHost, language);
  notifyListeners(projectId, siteHost, next);
  return next;
}

let storageListenerBound = false;

/** Bind once on web so Chat + Search stay aligned across tabs. */
export function ensureVisitorLanguageStorageListener(): void {
  if (storageListenerBound) return;
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  storageListenerBound = true;
  window.addEventListener('storage', (event) => {
    if (!event.key || !event.key.startsWith(STORAGE_PREFIX)) return;
    const suffix = event.key.slice(STORAGE_PREFIX.length);
    const underscore = suffix.indexOf('_');
    if (underscore < 0) return;
    const projectId = suffix.slice(0, underscore);
    const siteHost = suffix.slice(underscore + 1);
    const language = normalizeVisitorLanguage(event.newValue);
    if (language) {
      memoryStore.set(event.key, language);
    } else {
      memoryStore.delete(event.key);
    }
    notifyListeners(projectId, siteHost, language);
  });
}
