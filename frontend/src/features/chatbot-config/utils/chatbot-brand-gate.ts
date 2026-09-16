import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { PRODUCT_WEBSITE_URL } from '@/shared/constants/product-links';

/** Fixed CE chatbot header title. */
export const CE_CHATBOT_BRAND_TITLE = BRANDING_DEFAULTS.orgName;

/** Default brand link label shown next to the disclaimer. */
export const DEFAULT_DISCLAIMER_LINK_LABEL = 'ragsuite.de';

/**
 * Whether the deployment may customize chatbot title / header logo (EE).
 * Pass `enterpriseModulesAvailable` from `useOrgAdminAccess()` on the client.
 */
export function canCustomizeChatbotBrand(enterpriseModulesAvailable: boolean): boolean {
  return Boolean(enterpriseModulesAvailable);
}

/** Effective title for display/save when CE must stay RAGSuite. */
export function resolveEffectiveChatbotTitle(
  title: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return CE_CHATBOT_BRAND_TITLE;
  }
  const trimmed = (title || '').trim();
  return trimmed || CE_CHATBOT_BRAND_TITLE;
}

/** Effective logo URL: CE always null (widget uses bundled RAGSuite mark). */
export function resolveEffectiveChatbotLogoUrl(
  logoUrl: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string | null {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return null;
  }
  const trimmed = (logoUrl || '').trim();
  return trimmed || null;
}

export function resolveEffectiveShowDisclaimer(
  showDisclaimer: boolean | undefined,
  enterpriseModulesAvailable: boolean,
): boolean {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return true;
  }
  return showDisclaimer !== false;
}

export function resolveEffectiveDisclaimerText(
  text: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return '';
  }
  return (text || '').trim();
}

export function resolveEffectiveShowDisclaimerLink(
  showLink: boolean | undefined,
  enterpriseModulesAvailable: boolean,
): boolean {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return true;
  }
  return showLink !== false;
}

export function resolveEffectiveDisclaimerLinkLabel(
  label: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return DEFAULT_DISCLAIMER_LINK_LABEL;
  }
  const trimmed = (label || '').trim();
  return trimmed || DEFAULT_DISCLAIMER_LINK_LABEL;
}

export function resolveEffectiveDisclaimerLinkUrl(
  url: string | null | undefined,
  enterpriseModulesAvailable: boolean,
): string {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return PRODUCT_WEBSITE_URL;
  }
  const trimmed = (url || '').trim();
  return trimmed || PRODUCT_WEBSITE_URL;
}

export function applyEffectiveChatbotBrandToConfig(
  config: ChatWidgetConfig,
  enterpriseModulesAvailable: boolean,
): ChatWidgetConfig {
  return {
    ...config,
    title: resolveEffectiveChatbotTitle(config.title, enterpriseModulesAvailable),
  };
}

export function applyEffectiveChatbotBrandToCustomization(
  customization: ChatWidgetCustomization,
  enterpriseModulesAvailable: boolean,
): ChatWidgetCustomization {
  if (!canCustomizeChatbotBrand(enterpriseModulesAvailable)) {
    return {
      ...customization,
      logoUrl: null,
      showDisclaimer: true,
      disclaimerText: '',
      showDisclaimerLink: true,
      disclaimerLinkLabel: '',
      disclaimerLinkUrl: '',
    };
  }
  return {
    ...customization,
    logoUrl: resolveEffectiveChatbotLogoUrl(customization.logoUrl, true),
  };
}

/**
 * Whether Home logo + title should open the product website.
 * Disabled only when both a custom title and a custom logo are set (full white-label).
 */
export function shouldLinkChatbotBrandToProduct(input: {
  title: string | null | undefined;
  logoUrl: string | null | undefined;
}): boolean {
  const title = (input.title || '').trim();
  const isDefaultTitle =
    !title || title.toLowerCase() === CE_CHATBOT_BRAND_TITLE.toLowerCase();
  const hasCustomTitle = !isDefaultTitle;
  const hasCustomLogo = Boolean((input.logoUrl || '').trim());
  return !(hasCustomTitle && hasCustomLogo);
}
