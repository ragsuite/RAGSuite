import {
  PROJECT_PERMISSION_MODULES,
  enabledKeysFromPermissions,
  leafLevelFromPermissions,
  leafPermissionRows,
  permissionsFromEnabledKeys,
  sanitizeProjectPermissions,
  setNodeAccessLevel,
} from './project-permission-modules';
import type { OrgProjectPermission } from '@/features/organization/types/organization.types';

function allPermissions(): OrgProjectPermission[] {
  return permissionsFromEnabledKeys(new Set(leafPermissionRows().map((l) => l.key)));
}

function toggle(perms: OrgProjectPermission[], key: string, next: boolean) {
  return setNodeAccessLevel(perms, key, next ? 'write' : 'none');
}

describe('project permission toggling', () => {
  it('turns off Chatbot Settings and Search Settings independently', () => {
    const chat = toggle(allPermissions(), 'widgets.chatbot.settings', false);
    expect(chat).not.toContain('chatbot_settings:write');
    expect(chat).toContain('search_settings:write');
    expect(chat).toContain('model_configuration:write');

    const search = toggle(allPermissions(), 'widgets.search.settings', false);
    expect(search).not.toContain('search_settings:write');
    expect(search).toContain('chatbot_settings:write');
    expect(search).toContain('model_configuration:write');
  });

  it('Model Configuration is independent of the Settings switches', () => {
    const off = toggle(allPermissions(), 'model_configuration', false);
    expect(off).not.toContain('model_configuration:write');
    expect(off).toContain('chatbot_settings:write');
    expect(off).toContain('search_settings:write');

    let perms: OrgProjectPermission[] = ['project:read'];
    perms = toggle(perms, 'widgets.chatbot.settings', true);
    expect(enabledKeysFromPermissions(perms).has('model_configuration')).toBe(false);
    perms = toggle(perms, 'model_configuration', true);
    expect(enabledKeysFromPermissions(perms).has('model_configuration')).toBe(true);
    expect(perms).not.toContain('search_settings:write');
  });

  it('turns off Widgets, Chatbot and Search groups without touching Model Configuration', () => {
    const widgets = toggle(allPermissions(), 'widgets', false);
    for (const p of [
      'chatbot_chat:write',
      'chatbot_settings:write',
      'chatbot_integrations:write',
      'search_use:write',
      'search_settings:write',
      'search_integrations:write',
    ]) {
      expect(widgets).not.toContain(p);
    }
    expect(widgets).toContain('model_configuration:write');
    expect(toggle(allPermissions(), 'widgets.chatbot', false)).toContain('search_settings:write');
    expect(toggle(allPermissions(), 'widgets.search', false)).toContain('chatbot_settings:write');
  });

  it('keeps Integrations independent of Settings', () => {
    const next = toggle(allPermissions(), 'widgets.chatbot.integrations', false);
    expect(next).not.toContain('chatbot_integrations:write');
    expect(next).toContain('chatbot_settings:write');
  });

  it('Admin Assistant write includes read', () => {
    const on = toggle(['project:read'], 'ai_assistant', true);
    expect(on).toContain('ai_assistant:write');
    expect(on).not.toContain('ai_assistant:read');
    expect(leafLevelFromPermissions(on, 'ai_assistant')).toBe('write');

    const readOnly = setNodeAccessLevel(['project:read'], 'ai_assistant', 'read');
    expect(readOnly).toContain('ai_assistant:read');
    expect(readOnly).not.toContain('ai_assistant:write');
    expect(leafLevelFromPermissions(readOnly, 'ai_assistant')).toBe('read');
  });

  it('Sources switches are independent', () => {
    let perms: OrgProjectPermission[] = [
      'project:read',
      'crawl_domain:write',
      'crawl_sitemap:write',
      'documents:write',
      'documents_text:write',
      'documents_qa:write',
    ];
    perms = toggle(perms, 'crawl.domain', false);
    expect(perms).not.toContain('crawl_domain:write');
    expect(perms).toContain('crawl_sitemap:write');
    expect(perms).toContain('documents:write');

    perms = toggle(allPermissions(), 'crawl.documents', false);
    expect(perms).not.toContain('documents:write');
    expect(perms).toContain('documents_text:write');
    expect(perms).toContain('documents_qa:write');
  });

  it('exposes MCP, System Health, and Audit Logs, and omits Connectors and Profile', () => {
    const keys = leafPermissionRows().map((row) => row.key);
    expect(keys).toContain('mcp');
    expect(keys).not.toContain('profile');
    expect(keys).toContain('system_health');
    expect(keys).toContain('audit_logs');
    expect(keys).not.toContain('api_keys');
    expect(keys.some((key) => key.includes('connector'))).toBe(false);
  });

  it('read-only leaves store :read when on and drop it when off', () => {
    for (const [key, perm] of [
      ['analytics', 'analytics:read'],
      ['compare_models', 'compare:read'],
    ] as const) {
      const on = setNodeAccessLevel(['project:read'], key, 'read');
      expect(on).toContain(perm);
      expect(leafLevelFromPermissions(on, key)).toBe('read');

      const off = setNodeAccessLevel(on, key, 'none');
      expect(off).not.toContain(perm);
      expect(leafLevelFromPermissions(off, key)).toBe('none');
    }
  });

  it('enabling Search does not promote existing Chatbot read grants to write', () => {
    let perms: OrgProjectPermission[] = ['project:read'];
    for (const key of [
      'widgets.chatbot.training',
      'widgets.chatbot.settings',
      'widgets.chatbot.integrations',
    ]) {
      perms = setNodeAccessLevel(perms, key, 'read');
    }

    perms = toggle(perms, 'widgets.search', true);

    expect(leafLevelFromPermissions(perms, 'widgets.chatbot.training')).toBe('read');
    expect(leafLevelFromPermissions(perms, 'widgets.chatbot.settings')).toBe('read');
    expect(leafLevelFromPermissions(perms, 'widgets.chatbot.integrations')).toBe('read');
    expect(leafLevelFromPermissions(perms, 'widgets.search.training')).toBe('write');
    expect(leafLevelFromPermissions(perms, 'widgets.search.settings')).toBe('write');
    expect(leafLevelFromPermissions(perms, 'widgets.search.integrations')).toBe('write');
    expect(leafLevelFromPermissions(perms, 'model_configuration')).toBe('none');
  });

  it('disabling Search does not promote remaining Chatbot read grants to write', () => {
    let perms: OrgProjectPermission[] = ['project:read'];
    for (const key of [
      'widgets.chatbot.training',
      'widgets.chatbot.settings',
      'widgets.chatbot.integrations',
    ]) {
      perms = setNodeAccessLevel(perms, key, 'read');
    }
    perms = toggle(perms, 'widgets.search', true);
    perms = toggle(perms, 'widgets.search', false);

    expect(leafLevelFromPermissions(perms, 'widgets.chatbot.training')).toBe('read');
    expect(leafLevelFromPermissions(perms, 'widgets.search.training')).toBe('none');
    expect(leafLevelFromPermissions(perms, 'widgets.search.settings')).toBe('none');
    expect(leafLevelFromPermissions(perms, 'widgets.search.integrations')).toBe('none');
  });

  it('Search Setup chips store search_use:write when Write is selected', () => {
    const write = setNodeAccessLevel(['project:read'], 'widgets.search.training', 'write');
    expect(write).toContain('search_use:write');
    expect(write).not.toContain('search_use:read');
    expect(leafLevelFromPermissions(write, 'widgets.search.training')).toBe('write');

    const readOnly = setNodeAccessLevel(write, 'widgets.search.training', 'read');
    expect(readOnly).toContain('search_use:read');
    expect(readOnly).not.toContain('search_use:write');
    expect(leafLevelFromPermissions(readOnly, 'widgets.search.training')).toBe('read');
  });

  it('System Health and Audit hideShow ON stores write and OFF drops it', () => {
    expect(PROJECT_PERMISSION_MODULES.find((node) => node.id === 'system_health')?.hideShow).toBe(true);
    expect(PROJECT_PERMISSION_MODULES.find((node) => node.id === 'audit_logs')?.hideShow).toBe(true);
    for (const [key, perm] of [
      ['system_health', 'system_health:write'],
      ['audit_logs', 'audit_logs:write'],
    ] as const) {
      const on = setNodeAccessLevel(['project:read'], key, 'write');
      expect(on).toContain(perm);
      expect(leafLevelFromPermissions(on, key)).toBe('write');
      const off = setNodeAccessLevel(on, key, 'none');
      expect(off).not.toContain(perm);
      expect(leafLevelFromPermissions(off, key)).toBe('none');
    }
  });

  it('History hideShow ON stores history:write and OFF drops it', () => {
    expect(PROJECT_PERMISSION_MODULES.find((node) => node.id === 'history')?.hideShow).toBe(true);

    const on = setNodeAccessLevel(['project:read'], 'history', 'write');
    expect(on).toContain('history:write');
    expect(on).not.toContain('history:read');
    expect(leafLevelFromPermissions(on, 'history')).toBe('write');

    const off = setNodeAccessLevel(on, 'history', 'none');
    expect(off).not.toContain('history:write');
    expect(off).not.toContain('history:read');
    expect(leafLevelFromPermissions(off, 'history')).toBe('none');
  });

  it('rewrites legacy API Keys grants onto MCP', () => {
    expect(sanitizeProjectPermissions(['api_keys:read'])).toEqual(['mcp:read', 'project:read']);
    expect(sanitizeProjectPermissions(['api_keys:write'])).toEqual(['mcp:write', 'project:read']);
    expect(sanitizeProjectPermissions(['api_keys:manage'])).toEqual(['mcp:write', 'project:read']);
  });

  it('rewrites legacy profile and compliance grants', () => {
    expect(sanitizeProjectPermissions(['profile:general'])).toEqual(['profile:write', 'project:read']);
    expect(sanitizeProjectPermissions(['profile:security'])).toEqual(['profile:write', 'project:read']);
    expect(sanitizeProjectPermissions(['compliance:view_receipts'])).toEqual([
      'audit_logs:read',
      'project:read',
    ]);
  });
});
