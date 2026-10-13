import fs from 'node:fs';
import path from 'node:path';

describe('OrganizationMemberSheets Member lock', () => {
  it('locks Member with compact boxed lock after the label when CE / not entitled', () => {
    const filePath = path.join(__dirname, 'OrganizationMemberSheets.tsx');
    const source = fs.readFileSync(filePath, 'utf8');
    expect(source).toContain('trailing: <EnterpriseLockedIconButton size="compact" />');
    expect(source).toContain(
      'const memberLocked = !enterpriseModulesAvailable || !memberRoleAvailable;',
    );
    expect(source).toContain('if (memberLocked && next === ROLE_ADMIN)');
    expect(source).toContain('setIsActive(true)');
    expect(source).not.toContain('leading: <EnterpriseLockedIconButton');
    expect(source).not.toContain('EnterpriseLockedAdornment');
  });
});
