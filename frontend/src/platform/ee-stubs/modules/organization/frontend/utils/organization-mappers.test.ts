import {
  orgUserDisplayName,
  toOrgUserCreateWire,
  toOrgUserUpdateWire,
} from './organization-mappers';

describe('org user identity mappers', () => {
  it('omits username on invite so the server generates one', () => {
    const wire = toOrgUserCreateWire({
      firstName: 'Hitesh',
      lastName: 'Chauhan',
      email: 'hitesh.chauhan@acme.com',
      role: 'member',
    });
    expect(wire).not.toHaveProperty('username');
    expect(wire.first_name).toBe('Hitesh');
    expect(wire.email).toBe('hitesh.chauhan@acme.com');
  });

  it('omits username and email on member update', () => {
    const wire = toOrgUserUpdateWire({
      firstName: 'Ada',
      jobTitle: 'Admin',
    });
    expect(wire).not.toHaveProperty('username');
    expect(wire).not.toHaveProperty('email');
    expect(wire.first_name).toBe('Ada');
  });

  it('can send an avatar on member update', () => {
    const wire = toOrgUserUpdateWire({
      firstName: 'Ada',
      avatar: 'data:image/png;base64,abc',
    });
    expect(wire.avatar).toBe('data:image/png;base64,abc');
  });

  it('falls back to username when names are empty', () => {
    expect(orgUserDisplayName({ firstName: '', lastName: '', username: 'admin_k7m2p9' })).toBe(
      'admin_k7m2p9',
    );
    expect(orgUserDisplayName({ firstName: 'Ada', lastName: 'Lovelace', username: 'ada_k7m2p9' })).toBe(
      'Ada Lovelace',
    );
  });
});
