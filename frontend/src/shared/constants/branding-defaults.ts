/** Canonical workspace branding defaults — RAGSuite brand kit (`AGENTS.md`). */
export const BRANDING_DEFAULTS = {
  orgName: 'RAGSuite',
  websiteUrl: 'https://www.ragsuite.de/',
  primaryColor: '#2E6A4E',
  logoDataUrl: null as string | null,
} as const;

/** Brand-aligned accent presets (pine, ochre, pine-deep, error). */
export const BRANDING_THEME_PRESETS = ['#2E6A4E', '#B6802E', '#1E3A30', '#A23B2E'] as const;
