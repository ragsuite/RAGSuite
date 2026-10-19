import {
  enabledKeysFromPermissions,
  leafPermissionRows,
  permissionsFromEnabledKeys,
  toggleNodeLeafKeys,
} from './project-permission-modules';
import type { OrgProjectPermission } from '@/features/organization/types/organization.types';

function allPermissions(): OrgProjectPermission[] {
  return permissionsFromEnabledKeys(new Set(leafPermissionRows().map((l) => l.key)));
}

function toggle(perms: OrgProjectPermission[], key: string, next: boolean) {
  return permissionsFromEnabledKeys(
    toggleNodeLeafKeys(enabledKeysFromPermissions(perms), key, next),
  );
}

describe('project permission toggling', () => {
  it('turns off Chatbot Settings and Search Settings independently', () => {
    const chat = toggle(allPermissions(), 'widgets.chatbot.settings', false);
    expect(chat).not.toContain('chatbot:settings');
    expect(chat).toContain('search:settings');
    expect(chat).toContain('model_configuration:manage');

    const search = toggle(allPermissions(), 'widgets.search.settings', false);
    expect(search).not.toContain('search:settings');
    expect(search).toContain('chatbot:settings');
    expect(search).toContain('model_configuration:manage');
  });

  it('Model Configuration is independent of the Settings switches', () => {
    const off = toggle(allPermissions(), 'model_configuration', false);
    expect(off).not.toContain('model_configuration:manage');
    expect(off).toContain('chatbot:settings');
    expect(off).toContain('search:settings');

    let perms: OrgProjectPermission[] = ['project:read'];
    perms = toggle(perms, 'widgets.chatbot.settings', true);
    expect(enabledKeysFromPermissions(perms).has('model_configuration')).toBe(false);
    perms = toggle(perms, 'model_configuration', true);
    expect(enabledKeysFromPermissions(perms).has('model_configuration')).toBe(true);
    expect(perms).not.toContain('search:settings');
  });

  it('turns off Widgets, Chatbot and Search groups without touching Model Configuration', () => {
    const widgets = toggle(allPermissions(), 'widgets', false);
    for (const p of [
      'chat:use',
      'chatbot:settings',
      'chatbot:integrations',
      'search:use',
      'search:settings',
      'search:integrations',
    ]) {
      expect(widgets).not.toContain(p);
    }
    expect(widgets).toContain('model_configuration:manage');
    expect(toggle(allPermissions(), 'widgets.chatbot', false)).toContain('search:settings');
    expect(toggle(allPermissions(), 'widgets.search', false)).toContain('chatbot:settings');
  });

  it('keeps Setup/Search Test linked and Integrations independent', () => {
    const next = toggle(allPermissions(), 'widgets.chatbot.integrations', false);
    expect(next).not.toContain('chatbot:integrations');
    expect(next).toContain('chatbot:settings');
    expect(toggle(allPermissions(), 'widgets.search.search_test', false)).not.toContain('search:use');
  });

  it('Admin Assistant is a single main switch granting use and settings', () => {
    const on = toggle(['project:read'], 'ai_assistant', true);
    expect(on).toContain('ai_assistant:use');
    expect(on).toContain('ai_assistant:settings');
    const keys = enabledKeysFromPermissions(on);
    expect(keys.has('ai_assistant')).toBe(true);
    expect(keys.has('ai_assistant.use')).toBe(false);
    expect(keys.has('ai_assistant.settings')).toBe(false);

    const off = toggle(on, 'ai_assistant', false);
    expect(off).not.toContain('ai_assistant:use');
    expect(off).not.toContain('ai_assistant:settings');
  });

  it('Sources switches are independent', () => {
    let perms: OrgProjectPermission[] = [
      'project:read',
      'crawl:domain',
      'crawl:sitemap',
      'documents:document',
      'documents:text',
      'documents:qa_pairs',
    ];
    perms = toggle(perms, 'crawl.domain', false);
    expect(perms).not.toContain('crawl:domain');
    expect(perms).toContain('crawl:sitemap');
    expect(perms).toContain('documents:document');

    perms = toggle(allPermissions(), 'crawl.documents', false);
    expect(perms).not.toContain('documents:document');
    expect(perms).toContain('documents:text');
    expect(perms).toContain('documents:qa_pairs');

    perms = toggle(allPermissions(), 'crawl.text', false);
    expect(perms).not.toContain('documents:text');
    expect(perms).toContain('documents:document');

    perms = toggle(allPermissions(), 'crawl.qa-pairs', false);
    expect(perms).not.toContain('documents:qa_pairs');
    expect(perms).toContain('documents:document');

    perms = toggle(allPermissions(), 'crawl.sitemap', false);
    expect(perms).not.toContain('crawl:sitemap');
    expect(perms).toContain('crawl:domain');
  });
});
