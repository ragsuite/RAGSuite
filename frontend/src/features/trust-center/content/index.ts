import { aiEn, processingEn, securityEn, subprocessorsEn } from '@/features/trust-center/content/subprocessors-security-processing-ai.en';
import {
  aiDe,
  processingDe,
  securityDe,
  subprocessorsDe,
} from '@/features/trust-center/content/subprocessors-security-processing-ai.de';
import { dpaEn } from '@/features/trust-center/content/dpa.en';
import { dpaDe, overviewDe } from '@/features/trust-center/content/overview-dpa.de';
import { overviewEn } from '@/features/trust-center/content/overview.en';
import type { TrustCenterTabId, TrustDocument } from '@/features/trust-center/content/types';

export type TrustLocale = 'en' | 'de';

const EN_DOCS: Record<TrustCenterTabId, TrustDocument> = {
  overview: overviewEn,
  dpa: dpaEn,
  subprocessors: subprocessorsEn,
  security: securityEn,
  processing: processingEn,
  ai: aiEn,
};

const DE_DOCS: Record<TrustCenterTabId, TrustDocument> = {
  overview: overviewDe,
  dpa: dpaDe,
  subprocessors: subprocessorsDe,
  security: securityDe,
  processing: processingDe,
  ai: aiDe,
};

export function resolveTrustLocale(appLocale: string | undefined | null): TrustLocale {
  const normalized = (appLocale || 'en').toLowerCase();
  if (normalized === 'de' || normalized.startsWith('de-')) return 'de';
  return 'en';
}

export function getTrustDocument(
  tab: TrustCenterTabId,
  locale: TrustLocale | string | undefined | null,
): TrustDocument {
  const resolved =
    locale === 'en' || locale === 'de' ? locale : resolveTrustLocale(locale);
  return resolved === 'de' ? DE_DOCS[tab] : EN_DOCS[tab];
}

export {
  TRUST_CENTER_TAB_IDS,
  TRUST_CENTER_UPDATED_AT,
  TRUST_CENTER_VERSION,
} from '@/features/trust-center/content/types';
export type { TrustCenterTabId, TrustDocument, TrustDocSection } from '@/features/trust-center/content/types';
