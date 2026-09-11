import type { ChatWidgetConfig, ChatWidgetCustomization } from '@/features/chatbot-config/types/chatbot-config.types';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';

/** Fixed CE chatbot header title. */
export const CE_CHATBOT_BRAND_TITLE = BRANDING_DEFAULTS.orgName;

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
  return {
    ...customization,
    logoUrl: resolveEffectiveChatbotLogoUrl(customization.logoUrl, enterpriseModulesAvailable),
  };
}
