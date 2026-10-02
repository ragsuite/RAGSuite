import type { SearchBoxCustomization } from '@/features/search-config/types/search-config.types';
import { PRODUCT_WEBSITE_URL } from '@/shared/constants/product-links';

/** Default brand link label shown next to the search disclaimer. */
export const DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL = 'ragsuite.de';

/**
 * Whether the deployment may customize search disclaimer brand fields (EE).
 * Pass `enterpriseModulesAvailable` from `useOrgAdminAccess()` on the client.
 */
export function canCustomizeSearchBrand(enterpriseModulesAvailable: boolean): boolean {
  return Boolean(enterpriseModulesAvailable);
}

export function resolveEffectiveShowDisclaimer(
  showDisclaimer: boolean | undefined,
  enterpriseModulesAvailable: boolean,
): boolean {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return true;
  }
  return showDisclaimer !== false;
}

export function resolveEffectiveDisclaimerText(
  text: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return '';
  }
  return (text || '').trim();
}

export function resolveEffectiveShowDisclaimerLink(
  showLink: boolean | undefined,
  enterpriseModulesAvailable: boolean,
): boolean {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return true;
  }
  return showLink !== false;
}

export function resolveEffectiveDisclaimerLinkLabel(
  label: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL;
  }
  const trimmed = (label || '').trim();
  return trimmed || DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL;
}

export function resolveEffectiveDisclaimerLinkUrl(
  url: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return PRODUCT_WEBSITE_URL;
  }
  const trimmed = (url || '').trim();
  return trimmed || PRODUCT_WEBSITE_URL;
}

/** Force CE disclaimer defaults; keep EE values as-is. */
export function applyEffectiveSearchDisclaimerToCustomization(
  customization: SearchBoxCustomization,
  enterpriseModulesAvailable: boolean,
): SearchBoxCustomization {
  if (!canCustomizeSearchBrand(enterpriseModulesAvailable)) {
    return {
      ...customization,
      showDisclaimer: true,
      disclaimerText: '',
      showDisclaimerLink: true,
      disclaimerLinkLabel: '',
      disclaimerLinkUrl: '',
    };
  }
  return customization;
}

export type SearchDisclaimerDisplayInput = {
  showDisclaimer?: boolean;
  disclaimerText?: string | null;
  showDisclaimerLink?: boolean;
  disclaimerLinkLabel?: string | null;
  disclaimerLinkUrl?: string | null;
};

export type SearchDisclaimerDisplay = {
  showDisclaimer: boolean;
  disclaimerText: string;
  showDisclaimerLink: boolean;
  disclaimerLinkLabel: string;
  disclaimerLinkUrl: string;
};

/**
 * Resolve footer display values.
 * - CE (`brandEditable` false): always show note + default brand link (ignore overrides).
 * - EE / embed trust path (`brandEditable` true): honor stored/API customization.
 */
export function resolveSearchDisclaimerDisplay(
  input: SearchDisclaimerDisplayInput,
  options: { brandEditable: boolean; defaultNoteText: string },
): SearchDisclaimerDisplay {
  if (!options.brandEditable) {
    return {
      showDisclaimer: true,
      disclaimerText: options.defaultNoteText,
      showDisclaimerLink: true,
      disclaimerLinkLabel: DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL,
      disclaimerLinkUrl: PRODUCT_WEBSITE_URL,
    };
  }
  return {
    showDisclaimer: input.showDisclaimer !== false,
    disclaimerText: (input.disclaimerText || '').trim() || options.defaultNoteText,
    showDisclaimerLink: input.showDisclaimerLink !== false,
    disclaimerLinkLabel:
      (input.disclaimerLinkLabel || '').trim() || DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL,
    disclaimerLinkUrl: (input.disclaimerLinkUrl || '').trim() || PRODUCT_WEBSITE_URL,
  };
}
