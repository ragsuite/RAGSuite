import { useCallback, useRef, useState } from 'react';
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
 *
 * Note: Chromium ignores `autocomplete=off` when saved logins exist for the
 * origin, so web uses `new-password` (same signal as non-login API key fields).
 */
export const searchInputAutofillProps: TextInputProps = {
  autoComplete: Platform.OS === 'web' ? 'new-password' : 'off',
  autoCorrect: false,
  autoCapitalize: 'none',
  spellCheck: false,
  // oneTimeCode is a stronger iOS signal than "none" against password managers.
  ...(Platform.OS === 'ios' ? { textContentType: 'oneTimeCode' as const } : {}),
  ...(Platform.OS === 'android' ? { importantForAutofill: 'no' as const } : {}),
  ...(Platform.OS === 'web' ? { name: 'ragsuite-list-filter-q' } : {}),
  ...webPasswordManagerIgnore,
};

/**
 * Lighter antifill for generic AppTextField (keeps autoCorrect for comments/prompts).
 * Auth screens should pass autoComplete="username" | "password" | "email" explicitly.
 */
export const genericFieldAutofillProps: TextInputProps = {
  ...(Platform.OS === 'ios' ? { textContentType: 'oneTimeCode' as const } : {}),
  ...(Platform.OS === 'android' ? { importantForAutofill: 'no' as const } : {}),
  ...webPasswordManagerIgnore,
};

type SearchFilterAutofillOptions = {
  onFocus?: () => void;
  onBlur?: () => void;
};

/**
 * Web: keep the field read-only until focus so Chrome cannot paint saved
 * usernames into list/filter search boxes before the user interacts.
 */
export function useSearchFilterInputProps(
  options?: SearchFilterAutofillOptions,
): TextInputProps {
  const [locked, setLocked] = useState(Platform.OS === 'web');
  const onFocusRef = useRef(options?.onFocus);
  const onBlurRef = useRef(options?.onBlur);
  onFocusRef.current = options?.onFocus;
  onBlurRef.current = options?.onBlur;

  const onFocus = useCallback(() => {
    setLocked(false);
    onFocusRef.current?.();
  }, []);

  const onBlur = useCallback(() => {
    onBlurRef.current?.();
  }, []);

  return {
    ...searchInputAutofillProps,
    ...(Platform.OS === 'web' && locked ? { readOnly: true } : null),
    onFocus,
    onBlur,
  };
}
