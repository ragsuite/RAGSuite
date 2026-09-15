/**
 * Canonical product / legal URLs — web footer source of truth.
 * Backend AI Assistant resolve_product_links() defaults must stay aligned.
 */
export const PRODUCT_WEBSITE_URL = 'https://www.ragsuite.de/';

export const PRODUCT_CONTACT_EMAIL = 'sales@ragsuite.de';

export const PRODUCT_DOCUMENTATION_URL = 'https://docs.ragsuite.de/';

export const PRODUCT_FOOTER_LINKS = [
  { label: 'Documentation', url: PRODUCT_DOCUMENTATION_URL },
  { label: 'Impressum', url: 'https://ragsuite.de/impressum/' },
  { label: 'Datenschutzerklärung', url: 'https://ragsuite.de/datenschutz/' },
  { label: 'Terms', url: 'https://ragsuite.de/terms/' },
  { label: 'AVV', url: 'https://ragsuite.de/avv/' },
  { label: 'Security', url: 'https://ragsuite.de/security/disclosure/' },
] as const;

/** Keyed map for Help defaults / assistants (mirrors footer + branding). */
export const PRODUCT_LINKS = {
  documentation: PRODUCT_DOCUMENTATION_URL,
  website: PRODUCT_WEBSITE_URL,
  pricing: 'https://www.ragsuite.de/pricing/',
  impressum: 'https://ragsuite.de/impressum/',
  datenschutz: 'https://ragsuite.de/datenschutz/',
  terms: 'https://ragsuite.de/terms/',
  avv: 'https://ragsuite.de/avv/',
  security_disclosure: 'https://ragsuite.de/security/disclosure/',
  contact_email: PRODUCT_CONTACT_EMAIL,
} as const;
