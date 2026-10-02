import {
  applyEffectiveSearchDisclaimerToCustomization,
  canCustomizeSearchBrand,
  DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL,
  resolveEffectiveDisclaimerLinkLabel,
  resolveEffectiveDisclaimerLinkUrl,
  resolveEffectiveDisclaimerText,
  resolveEffectiveShowDisclaimer,
  resolveEffectiveShowDisclaimerLink,
  resolveSearchDisclaimerDisplay,
} from '@/features/search-config/utils/search-brand-gate';
import type { SearchBoxCustomization } from '@/features/search-config/types/search-config.types';
import { PRODUCT_WEBSITE_URL } from '@/shared/constants/product-links';

const baseCustomization: SearchBoxCustomization = {
  searchFormType: 'with-button',
  buttonType: 'with-label',
  searchButtonText: 'Search',
  searchInputPlaceholder: 'Search using AI...',
  recentSearchEnabled: true,
  recentSearchTitle: 'Recent Searches',
  recentSearchLimit: 5,
  showSpeechInput: true,
  showSpeechOutput: true,
  showDisclaimer: true,
  disclaimerText: '',
  showDisclaimerLink: true,
  disclaimerLinkLabel: '',
  disclaimerLinkUrl: '',
};

describe('search-brand-gate', () => {
  it('CE cannot customize brand', () => {
    expect(canCustomizeSearchBrand(false)).toBe(false);
    expect(canCustomizeSearchBrand(true)).toBe(true);
  });

  it('forces show disclaimer and link on CE', () => {
    expect(resolveEffectiveShowDisclaimer(false, false)).toBe(true);
    expect(resolveEffectiveShowDisclaimerLink(false, false)).toBe(true);
    expect(resolveEffectiveDisclaimerText('Custom', false)).toBe('');
    expect(resolveEffectiveDisclaimerLinkLabel('acme.com', false)).toBe(
      DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL,
    );
    expect(resolveEffectiveDisclaimerLinkUrl('https://acme.com', false)).toBe(PRODUCT_WEBSITE_URL);
  });

  it('keeps custom disclaimer values on EE', () => {
    expect(resolveEffectiveShowDisclaimer(false, true)).toBe(false);
    expect(resolveEffectiveShowDisclaimerLink(false, true)).toBe(false);
    expect(resolveEffectiveDisclaimerText('Custom', true)).toBe('Custom');
    expect(resolveEffectiveDisclaimerLinkLabel('acme.com', true)).toBe('acme.com');
    expect(resolveEffectiveDisclaimerLinkUrl('https://acme.com', true)).toBe('https://acme.com');
  });

  it('strips disclaimer overrides on CE via applyEffective', () => {
    const customization = applyEffectiveSearchDisclaimerToCustomization(
      {
        ...baseCustomization,
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      false,
    );
    expect(customization.showDisclaimer).toBe(true);
    expect(customization.disclaimerText).toBe('');
    expect(customization.showDisclaimerLink).toBe(true);
    expect(customization.disclaimerLinkLabel).toBe('');
    expect(customization.disclaimerLinkUrl).toBe('');
  });

  it('keeps disclaimer overrides on EE via applyEffective', () => {
    const customization = applyEffectiveSearchDisclaimerToCustomization(
      {
        ...baseCustomization,
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      true,
    );
    expect(customization.showDisclaimer).toBe(false);
    expect(customization.disclaimerText).toBe('Custom');
    expect(customization.showDisclaimerLink).toBe(false);
    expect(customization.disclaimerLinkLabel).toBe('acme.com');
    expect(customization.disclaimerLinkUrl).toBe('https://acme.com');
  });

  it('forces CE footer display even when props hide note/link', () => {
    const display = resolveSearchDisclaimerDisplay(
      {
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      { brandEditable: false, defaultNoteText: 'AI can make mistakes.' },
    );
    expect(display.showDisclaimer).toBe(true);
    expect(display.disclaimerText).toBe('AI can make mistakes.');
    expect(display.showDisclaimerLink).toBe(true);
    expect(display.disclaimerLinkLabel).toBe(DEFAULT_SEARCH_DISCLAIMER_LINK_LABEL);
    expect(display.disclaimerLinkUrl).toBe(PRODUCT_WEBSITE_URL);
  });

  it('honors EE footer display overrides when brandEditable', () => {
    const display = resolveSearchDisclaimerDisplay(
      {
        showDisclaimer: false,
        disclaimerText: 'Custom',
        showDisclaimerLink: false,
        disclaimerLinkLabel: 'acme.com',
        disclaimerLinkUrl: 'https://acme.com',
      },
      { brandEditable: true, defaultNoteText: 'AI can make mistakes.' },
    );
    expect(display.showDisclaimer).toBe(false);
    expect(display.disclaimerText).toBe('Custom');
    expect(display.showDisclaimerLink).toBe(false);
    expect(display.disclaimerLinkLabel).toBe('acme.com');
    expect(display.disclaimerLinkUrl).toBe('https://acme.com');
  });
});
