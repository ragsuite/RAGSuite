import { createProfileFormSchema } from '@/features/profile/types/profile.types';

const t = (key: string) => key;

describe('profile form schema', () => {
  const schema = createProfileFormSchema(t);
  const base = {
    firstName: 'Ada',
    lastName: 'Lovelace',
    username: 'ada_k7m2p9',
    email: 'ada@acme.com',
    jobTitle: '',
    phone: '',
    country: '',
    timezone: '',
    bio: '',
  };

  it('requires first and last names', () => {
    expect(schema.safeParse({ ...base, firstName: '', lastName: '' }).success).toBe(false);
    expect(schema.safeParse(base).success).toBe(true);
  });

  it('accepts a valid Indian phone number', () => {
    const result = schema.safeParse({
      ...base,
      phone: '9876543210',
      country: 'IN',
      timezone: 'Asia/Kolkata',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a phone number after the country no longer matches', () => {
    const result = schema.safeParse({
      ...base,
      phone: '9876543210',
      country: 'US',
      timezone: 'America/New_York',
    });
    expect(result.success).toBe(false);
  });

  it('requires timezone and phone when a country is set', () => {
    expect(schema.safeParse({ ...base, country: 'DE', timezone: '', phone: '' }).success).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        country: 'DE',
        timezone: 'Europe/Berlin',
        phone: '',
      }).success,
    ).toBe(false);
    expect(
      schema.safeParse({
        ...base,
        country: 'DE',
        timezone: '',
        phone: '15123456789',
      }).success,
    ).toBe(false);
  });
});
