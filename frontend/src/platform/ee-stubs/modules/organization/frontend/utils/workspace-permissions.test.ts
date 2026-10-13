import {
  ROUTE_PERMISSION_REQUIREMENTS,
  CRAWL_SEGMENT_PERMISSIONS,
  permissionGranted,
  routeVisible,
} from './workspace-permissions';

describe('routeVisible / ROUTE_PERMISSION_REQUIREMENTS', () => {
  it('gates model-configuration, mcp, system-health, and audit-logs', () => {
    expect(ROUTE_PERMISSION_REQUIREMENTS['model-configuration']?.length).toBeGreaterThan(0);
    expect(ROUTE_PERMISSION_REQUIREMENTS.mcp?.length).toBeGreaterThan(0);
    expect(ROUTE_PERMISSION_REQUIREMENTS['system-health']?.length).toBeGreaterThan(0);
    expect(ROUTE_PERMISSION_REQUIREMENTS['audit-logs']?.length).toBeGreaterThan(0);
  });

  it('hides Dashboard and Sources when member only has project:read', () => {
    const granted = new Set(['project:read']);
    expect(routeVisible('index', granted)).toBe(false);
    expect(routeVisible('crawl-management', granted)).toBe(false);
    expect(routeVisible('analytics', granted)).toBe(false);
    expect(routeVisible('mcp', granted)).toBe(false);
    expect(routeVisible('model-configuration', granted)).toBe(false);
  });

  it('shows Dashboard when member has analytics:read', () => {
    const granted = new Set(['project:read', 'analytics:read']);
    expect(routeVisible('index', granted)).toBe(true);
    expect(routeVisible('crawl-management', granted)).toBe(false);
  });

  it('org admins bypass route gates', () => {
    expect(routeVisible('index', new Set(), { isOrgAdmin: true })).toBe(true);
    expect(routeVisible('mcp', new Set(), { isOrgAdmin: true })).toBe(true);
  });

  it('project:admin still grants all module checks', () => {
    const granted = new Set(['project:admin']);
    expect(permissionGranted(granted, 'analytics:read')).toBe(true);
    expect(routeVisible('crawl-management', granted)).toBe(true);
  });
});

describe('CRAWL_SEGMENT_PERMISSIONS', () => {
  it('includes text, qa-pairs, and sitemap segments', () => {
    expect(CRAWL_SEGMENT_PERMISSIONS.text).toEqual(['documents:manage']);
    expect(CRAWL_SEGMENT_PERMISSIONS['qa-pairs']).toEqual(['documents:manage']);
    expect(CRAWL_SEGMENT_PERMISSIONS.sitemap).toEqual(['crawl:manage']);
  });
});
