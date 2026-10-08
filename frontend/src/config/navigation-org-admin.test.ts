import { getDrawerNavSections, getOrgAdminRouteAccess } from '@/config/navigation';

jest.mock('lucide-react-native', () => new Proxy({}, { get: () => () => null }));
jest.mock('@/features/mcp/components/mcp-nav-icon', () => () => null);

describe('getOrgAdminRouteAccess', () => {
  it('shows SSO unlocked to org admins with EE attached', () => {
    expect(
      getOrgAdminRouteAccess('organization-sso', { isOrgAdmin: true, enterpriseModulesAvailable: true }),
    ).toEqual({ visible: true, enterpriseLocked: false });
  });

  it('shows SSO as a locked teaser on Community Edition', () => {
    expect(
      getOrgAdminRouteAccess('organization-sso', { isOrgAdmin: false, enterpriseModulesAvailable: false }),
    ).toEqual({ visible: true, enterpriseLocked: true });
  });

  it('hides SSO from non-admins when EE is attached', () => {
    expect(
      getOrgAdminRouteAccess('organization-sso', { isOrgAdmin: false, enterpriseModulesAvailable: true }).visible,
    ).toBe(false);
  });

  it('leaves non org-admin routes visible', () => {
    expect(
      getOrgAdminRouteAccess('history', { isOrgAdmin: false, enterpriseModulesAvailable: true }),
    ).toEqual({ visible: true, enterpriseLocked: false });
  });
});

describe('drawer management section', () => {
  it('lists Team Members for org admins with EE attached and keeps SSO out of the drawer', () => {
    const routes = getDrawerNavSections(true, { isOrgAdmin: true, enterpriseModulesAvailable: true }).flatMap(
      (section) => section.items.map((item) => item.route),
    );
    expect(routes).toContain('organization-users');
    expect(routes).not.toContain('organization-sso');
  });

  it('keeps Team Members as a locked teaser on Community Edition', () => {
    const teamMembers = getDrawerNavSections(true, { isOrgAdmin: false, enterpriseModulesAvailable: false })
      .flatMap((section) => section.items)
      .find((item) => item.route === 'organization-users');
    expect(teamMembers?.enterpriseLocked).toBe(true);
  });

  it('hides Team Members from non-admins when EE is attached', () => {
    const routes = getDrawerNavSections(true, { isOrgAdmin: false, enterpriseModulesAvailable: true }).flatMap(
      (section) => section.items.map((item) => item.route),
    );
    expect(routes).not.toContain('organization-users');
  });
});
