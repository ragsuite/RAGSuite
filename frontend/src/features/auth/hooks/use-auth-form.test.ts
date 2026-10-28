import { createAuthFormSchemas, liveLoginIdentifierMessage } from '@/features/auth/hooks/use-auth-form';

const t = (key: string) => key;

describe('login identifier schema', () => {
  const { signInSchema } = createAuthFormSchemas(t);

  it('accepts a username without the 3–24 charset regex', () => {
    const result = signInSchema.safeParse({
      email: 'legacy-sso-name',
      password: 'Password1',
    });
    expect(result.success).toBe(true);
  });

  it('accepts an email identifier', () => {
    const result = signInSchema.safeParse({
      email: 'person@acme.com',
      password: 'Password1',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a malformed email identifier', () => {
    const result = signInSchema.safeParse({
      email: 'not-an-email@',
      password: 'Password1',
    });
    expect(result.success).toBe(false);
  });

  it('live-validates a typed identifier without flagging an empty field', () => {
    expect(liveLoginIdentifierMessage('', t)).toBeUndefined();
    expect(liveLoginIdentifierMessage('cl', t)).toBeUndefined();
    expect(liveLoginIdentifierMessage('person@acme.com', t)).toBeUndefined();
    expect(liveLoginIdentifierMessage('not-an-email@', t)).toBe('auth.validation.email');
  });
});

describe('signup schema', () => {
  const { signUpSchema } = createAuthFormSchemas(t);
  const valid = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    email: 'admin@acme.com',
    password: 'Password1',
    confirmPassword: 'Password1',
    agreeToTerms: true,
  };

  it('requires first and last names', () => {
    expect(signUpSchema.safeParse({ ...valid, firstName: '', lastName: '' }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, firstName: '  ', lastName: 'Lovelace' }).success).toBe(false);
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });
});
