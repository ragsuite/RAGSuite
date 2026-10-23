import {
  ROUTE_PERMISSION_REQUIREMENTS,
  CRAWL_SEGMENT_PERMISSIONS,
  SEARCH_TAB_WRITE_PERMISSIONS,
  firstAccessibleTabRoute,
  moduleAccess,
  permissionGranted,
  routeVisible,
  usesWorkspacePermissionScope,
} from './workspace-permissions';

describe('routeVisible / ROUTE_PERMISSION_REQUIREMENTS', () => {
  it('gates model-configuration, mcp, profile, system-health, and audit-logs', () => {
    expect(ROUTE_PERMISSION_REQUIREMENTS['model-configuration']).toEqual(['model_configuration:read']);
    expect(ROUTE_PERMISSION_REQUIREMENTS.mcp).toEqual(['mcp:read']);
    expect(ROUTE_PERMISSION_REQUIREMENTS['system-health']).toEqual(['system_health:read']);
    expect(ROUTE_PERMISSION_REQUIREMENTS['audit-logs']).toEqual(['audit_logs:read']);
    expect(ROUTE_PERMISSION_REQUIREMENTS.configuration).toEqual(['mcp:read']);
    expect(ROUTE_PERMISSION_REQUIREMENTS.profile).toEqual(['profile:read']);
  });

  it('each Project access switch unlocks only its own module', () => {
    const mcpOnly = new Set(['project:read', 'mcp:write']);
    expect(routeVisible('mcp', mcpOnly)).toBe(true);
    expect(routeVisible('system-health', mcpOnly)).toBe(false);
    expect(routeVisible('audit-logs', mcpOnly)).toBe(false);
    expect(routeVisible('configuration', mcpOnly)).toBe(true);
    expect(routeVisible('settings', mcpOnly)).toBe(false);

    const settingsOnly = new Set([
      'project:read',
      'settings_global:write',
      'settings_data_retention:write',
      'settings_session_timeout:write',
      'settings_i18n:write',
    ]);
    expect(routeVisible('settings', settingsOnly)).toBe(true);
    expect(routeVisible('mcp', settingsOnly)).toBe(false);

    const chatbotSettingsOnly = new Set(['project:read', 'chatbot_settings:write']);
    expect(routeVisible('chatbot-config', chatbotSettingsOnly)).toBe(true);
    expect(routeVisible('model-configuration', chatbotSettingsOnly)).toBe(false);

    const bothSettings = new Set(['project:read', 'chatbot:settings', 'search:settings']);
    expect(routeVisible('model-configuration', bothSettings)).toBe(false);

    const modelConfigOnly = new Set(['project:read', 'model_configuration:read']);
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

  it('legacy api_keys grants still open MCP; read does not write', () => {
    const readOnly = new Set(['project:read', 'api_keys:read']);
    expect(routeVisible('mcp', readOnly)).toBe(true);
    expect(permissionGranted(readOnly, 'mcp:read')).toBe(true);
    expect(permissionGranted(readOnly, 'mcp:write')).toBe(false);

    const write = new Set(['project:read', 'api_keys:write']);
    expect(routeVisible('mcp', write)).toBe(true);
    expect(permissionGranted(write, 'mcp:write')).toBe(true);
  });

  it('legacy chatbot:settings still opens chatbot-config and implies write', () => {
    const granted = new Set(['project:read', 'chatbot:settings']);
    expect(routeVisible('chatbot-config', granted)).toBe(true);
    expect(permissionGranted(granted, 'chatbot_settings:write')).toBe(true);
    expect(permissionGranted(granted, 'chatbot_settings:read')).toBe(true);
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

  it('hides System Health, Audit Logs, and Profile for project:read-only members', () => {
    const granted = new Set(['project:read']);
    expect(routeVisible('system-health', granted)).toBe(false);
    expect(routeVisible('audit-logs', granted)).toBe(false);
    expect(routeVisible('profile', granted)).toBe(false);
  });

  it('shows Profile, System Health, and Audit when the matching read grant is present', () => {
    expect(routeVisible('profile', new Set(['project:read', 'profile:read']))).toBe(true);
    expect(routeVisible('system-health', new Set(['project:read', 'system_health:read']))).toBe(true);
    expect(routeVisible('audit-logs', new Set(['project:read', 'audit_logs:read']))).toBe(true);
    expect(routeVisible('compliance', new Set(['project:read', 'audit_logs:read']))).toBe(true);
  });

  it('scopes profile to the active project like MCP, not workspace union', () => {
    expect(usesWorkspacePermissionScope('profile')).toBe(false);
    expect(usesWorkspacePermissionScope('profile:read')).toBe(false);
    expect(usesWorkspacePermissionScope('mcp:read')).toBe(false);
    expect(usesWorkspacePermissionScope('settings')).toBe(true);
  });

  it('moduleAccess reports write implying read', () => {
    const granted = new Set(['project:read', 'model_configuration:write']);
    expect(moduleAccess(granted, 'model_configuration')).toEqual({ canRead: true, canWrite: true });
    expect(moduleAccess(new Set(['project:read', 'model_configuration:read']), 'model_configuration')).toEqual({
      canRead: true,
      canWrite: false,
    });
  });

  it('read does not grant write; none grants neither', () => {
    expect(moduleAccess(new Set(['project:read', 'feedback:read']), 'feedback')).toEqual({
      canRead: true,
      canWrite: false,
    });
    expect(moduleAccess(new Set(['project:read']), 'feedback')).toEqual({ canRead: false, canWrite: false });
    expect(moduleAccess(new Set(['project:read', 'search_use:read']), 'search_use')).toEqual({
      canRead: true,
      canWrite: false,
    });
    expect(moduleAccess(new Set(['project:read', 'search_use:write']), 'search_use')).toEqual({
      canRead: true,
      canWrite: true,
    });
  });

  it('Search Setup write tab requires search_use:write', () => {
    expect(SEARCH_TAB_WRITE_PERMISSIONS.training).toEqual(['search_use:write']);
  });

  it('standalone AI Voice Pilot stays on voice_pilot, not chatbot_settings', () => {
    const settings = new Set(['project:read', 'chatbot_settings:read']);
    expect(routeVisible('chatbot-config', settings)).toBe(true);
    expect(routeVisible('ai-voice-pilot', settings)).toBe(false);
    expect(ROUTE_PERMISSION_REQUIREMENTS['ai-voice-pilot']).toEqual(['voice_pilot:read']);
  });
});

describe('CRAWL_SEGMENT_PERMISSIONS', () => {
  it('includes text, qa-pairs, and sitemap segments', () => {
    expect(CRAWL_SEGMENT_PERMISSIONS.domain).toEqual(['crawl_domain:read']);
    expect(CRAWL_SEGMENT_PERMISSIONS.document).toEqual(['documents:read']);
    expect(CRAWL_SEGMENT_PERMISSIONS.text).toEqual(['documents_text:read']);
    expect(CRAWL_SEGMENT_PERMISSIONS['qa-pairs']).toEqual(['documents_qa:read']);
    expect(CRAWL_SEGMENT_PERMISSIONS.sitemap).toEqual(['crawl_sitemap:read']);
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
