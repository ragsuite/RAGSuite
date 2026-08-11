import { Platform, type TextInputProps } from 'react-native';

const webPasswordManagerIgnore = Platform.OS === 'web'
  ? ({
      // RN Web forwards unknown props to the DOM for password-manager hints.
      'data-lpignore': 'true',
      'data-1p-ignore': 'true',
      'data-form-type': 'other',
      'data-bwignore': 'true',
    } as TextInputProps)
  : ({} as TextInputProps);

/**
 * Spread onto filter/search TextInputs so browsers and password managers
 * do not inject saved usernames into non-auth fields (common on web).
 */
export const searchInputAutofillProps: TextInputProps = {
  autoComplete: 'off',
  autoCorrect: false,
  autoCapitalize: 'none',
  spellCheck: false,
  ...(Platform.OS === 'ios' ? { textContentType: 'none' as const } : {}),
  ...(Platform.OS === 'android' ? { importantForAutofill: 'no' as const } : {}),
  ...(Platform.OS === 'web' ? { name: 'ragsuite-filter-search' } : {}),
  ...webPasswordManagerIgnore,
};

/**
 * Lighter antifill for generic AppTextField (keeps autoCorrect for comments/prompts).
 * Auth screens should pass autoComplete="username" | "password" | "email" explicitly.
 */
export const genericFieldAutofillProps: TextInputProps = {
  ...(Platform.OS === 'ios' ? { textContentType: 'none' as const } : {}),
  ...(Platform.OS === 'android' ? { importantForAutofill: 'no' as const } : {}),
  ...webPasswordManagerIgnore,
};
