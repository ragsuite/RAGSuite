import { AUTH_ERROR_KEYS, resolveAuthErrorMessage } from '@/features/auth/utils/auth-error-message';

describe('resolveAuthErrorMessage', () => {
  const t = (key: string) => `translated:${key}`;

  it('maps inactive account API detail to a dedicated notice', () => {
    expect(resolveAuthErrorMessage(t, new Error('User account is inactive'), 'generic')).toBe(
      `translated:${AUTH_ERROR_KEYS.accountInactive}`,
    );
  });

  it('does not treat inactive as invalid credentials', () => {
    const message = resolveAuthErrorMessage(t, new Error('User account is inactive'), 'invalidCredentials');
    expect(message).not.toContain(AUTH_ERROR_KEYS.invalidCredentials);
    expect(message).toContain(AUTH_ERROR_KEYS.accountInactive);
  });
});
