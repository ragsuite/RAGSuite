import { Platform } from 'react-native';

export const ONBOARDING_MOBILE_BREAKPOINT = 900;

export const ONBOARDING_MOBILE_PADDING = 16;
export const ONBOARDING_DESKTOP_PADDING = 20;
export const ONBOARDING_MOBILE_SCROLL_BOTTOM = 32;
export const ONBOARDING_MOBILE_SECTION_GAP = 16;
export const ONBOARDING_MOBILE_FORM_GAP = 18;

/** Native app or narrow viewport — stacked onboarding layout. */
export function isOnboardingPhoneLayout(width: number): boolean {
  return Platform.OS !== 'web' || width < ONBOARDING_MOBILE_BREAKPOINT;
}

/** On phone, form always appears above live preview. */
export function isOnboardingFormFirstOnPhone(_step: number, width: number): boolean {
  return isOnboardingPhoneLayout(width);
}
