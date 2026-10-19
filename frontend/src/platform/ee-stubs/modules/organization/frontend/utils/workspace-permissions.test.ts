import {
  ROUTE_PERMISSION_REQUIREMENTS,
  CRAWL_SEGMENT_PERMISSIONS,
  firstAccessibleTabRoute,
  permissionGranted,
  routeVisible,
} from './workspace-permissions';

describe('routeVisible / ROUTE_PERMISSION_REQUIREMENTS', () => {
  it('gates model-configuration and mcp; system-health and audit-logs are ungated', () => {
    expect(ROUTE_PERMISSION_REQUIREMENTS['model-configuration']).toEqual([
      'model_configuration:manage',
    ]);
    expect(ROUTE_PERMISSION_REQUIREMENTS.mcp).toEqual(['settings:manage']);
    expect(ROUTE_PERMISSION_REQUIREMENTS['system-health']).toBeUndefined();
    expect(ROUTE_PERMISSION_REQUIREMENTS['audit-logs']).toBeUndefined();
    expect(ROUTE_PERMISSION_REQUIREMENTS.configuration).toEqual(['api_keys:manage', 'project:write']);
  });

  it('each Project access switch unlocks only its own module', () => {
    const mcpOnly = new Set(['project:read', 'settings:manage']);
    expect(routeVisible('mcp', mcpOnly)).toBe(true);
    expect(routeVisible('system-health', mcpOnly)).toBe(true);
    expect(routeVisible('audit-logs', mcpOnly)).toBe(true);
    expect(routeVisible('configuration', mcpOnly)).toBe(false);
    expect(routeVisible('settings', mcpOnly)).toBe(false);

    const settingsOnly = new Set([
      'project:read',
      'settings:global',
      'settings:data_retention',
      'settings:session_timeout',
      'settings:i18n',
    ]);
    expect(routeVisible('settings', settingsOnly)).toBe(true);
    expect(routeVisible('mcp', settingsOnly)).toBe(false);
    expect(routeVisible('system-health', settingsOnly)).toBe(true);
    expect(routeVisible('audit-logs', settingsOnly)).toBe(true);

    const chatbotSettingsOnly = new Set(['project:read', 'chatbot:settings']);
    expect(routeVisible('chatbot-config', chatbotSettingsOnly)).toBe(true);
    expect(routeVisible('model-configuration', chatbotSettingsOnly)).toBe(false);

    const bothSettings = new Set(['project:read', 'chatbot:settings', 'search:settings']);
    expect(routeVisible('model-configuration', bothSettings)).toBe(false);

    const modelConfigOnly = new Set(['project:read', 'model_configuration:manage']);
    expect(routeVisible('model-configuration', modelConfigOnly)).toBe(true);
    expect(routeVisible('chatbot-config', modelConfigOnly)).toBe(false);
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

  it('shows System Health and Audit Logs for project:read-only members', () => {
    const granted = new Set(['project:read']);
    expect(routeVisible('system-health', granted)).toBe(true);
    expect(routeVisible('audit-logs', granted)).toBe(true);
  });
});

describe('CRAWL_SEGMENT_PERMISSIONS', () => {
  it('includes text, qa-pairs, and sitemap segments', () => {
    expect(CRAWL_SEGMENT_PERMISSIONS.domain).toEqual(['crawl:domain']);
    expect(CRAWL_SEGMENT_PERMISSIONS.document).toEqual(['documents:document']);
    expect(CRAWL_SEGMENT_PERMISSIONS.text).toEqual(['documents:text']);
    expect(CRAWL_SEGMENT_PERMISSIONS['qa-pairs']).toEqual(['documents:qa_pairs']);
    expect(CRAWL_SEGMENT_PERMISSIONS.sitemap).toEqual(['crawl:sitemap']);
  });
});

describe('firstAccessibleTabRoute', () => {
  it('falls back to History when primary tabs are denied', () => {
    const canAccess = (route: string) => route === 'history';
    expect(firstAccessibleTabRoute(canAccess)).toBe('history');
  });

  it('returns null when nothing is accessible', () => {
    expect(firstAccessibleTabRoute(() => false)).toBeNull();
  });
});
