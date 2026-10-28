import { mapUpdateProfilePayloadToApi } from '@/features/profile/utils/profile-api-mappers';

describe('mapUpdateProfilePayloadToApi', () => {
  it('does not send username or email', () => {
    const body = mapUpdateProfilePayloadToApi({
      firstName: 'Ada',
      lastName: 'Lovelace',
      jobTitle: 'Engineer',
      phone: '9876543210',
      phoneCountryCode: 'IN',
      country: 'IN',
      timezone: 'Asia/Kolkata',
      bio: '',
    });
    expect(body).not.toHaveProperty('username');
    expect(body).not.toHaveProperty('email');
    expect(body.first_name).toBe('Ada');
    expect(body.phone_number).toBe('+919876543210');
    expect(body.country).toBe('IN');
  });
});
