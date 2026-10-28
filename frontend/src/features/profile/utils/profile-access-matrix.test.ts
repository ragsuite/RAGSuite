import { buildAccessMatrix } from '@/features/profile/utils/profile-access-matrix';

describe('buildAccessMatrix', () => {
  it('keeps mixed Chatbot leaf levels instead of collapsing them', () => {
    const matrix = buildAccessMatrix([
      {
        id: 'p1',
        name: 'Acme',
        permissions: ['chatbot_chat:read', 'chatbot_settings:write'],
      },
    ]);
    const training = matrix.columns.findIndex((column) => column.key === 'widgets.chatbot.training');
    const settings = matrix.columns.findIndex((column) => column.key === 'widgets.chatbot.settings');
    const integrations = matrix.columns.findIndex((column) => column.key === 'widgets.chatbot.integrations');
    expect(training).toBeGreaterThanOrEqual(0);
    expect(matrix.rows).toHaveLength(1);
    expect(matrix.rows[0].cells[training]).toBe('read');
    expect(matrix.rows[0].cells[settings]).toBe('write');
    expect(matrix.rows[0].cells[integrations]).toBe('none');
    expect(matrix.projectCount).toBe(1);
    expect(matrix.grantedModuleCount).toBe(2);
    expect(matrix.rows[0].grantedLeafCount).toBe(2);
    expect(matrix.rows[0].isAdmin).toBe(false);
    const chatbot = matrix.rows[0].groups.find((group) => group.labelKey === 'widgets.tabs.chatbot');
    expect(chatbot?.leaves.map((leaf) => [leaf.key, leaf.level])).toEqual([
      ['widgets.chatbot.training', 'read'],
      ['widgets.chatbot.settings', 'write'],
    ]);
    expect(matrix.rows[0].groups.some((group) => group.labelKey === 'nav.dashboard')).toBe(false);
  });

  it('returns no rows when the member has zero projects', () => {
    const matrix = buildAccessMatrix([]);
    expect(matrix.rows).toEqual([]);
    expect(matrix.projectCount).toBe(0);
    expect(matrix.grantedModuleCount).toBe(0);
    expect(matrix.columns.length).toBeGreaterThan(0);
    expect(matrix.columns.some((column) => column.key === 'profile')).toBe(false);
  });

  it('marks every leaf as Admin when the project grant is project:admin', () => {
    const matrix = buildAccessMatrix([
      {
        id: 'p1',
        name: 'Acme',
        permissions: ['project:admin'],
      },
    ]);
    expect(matrix.rows[0].cells.every((cell) => cell === 'admin')).toBe(true);
    expect(matrix.rows[0].isAdmin).toBe(true);
    expect(matrix.rows[0].grantedLeafCount).toBe(matrix.columns.length);
    expect(matrix.grantedModuleCount).toBe(matrix.columns.length);
    expect(matrix.rows[0].groups.every((group) => group.leaves.length > 0)).toBe(true);
    expect(matrix.rows[0].groups.reduce((sum, group) => sum + group.leaves.length, 0)).toBe(
      matrix.columns.length,
    );
  });
});
