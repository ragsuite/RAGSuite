import React, { useEffect, useState } from 'react';

import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import type { OrgUser, OrganizationRole } from '@/features/organization/types/organization.types';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedIconButton } from '@/platform/ee-locked/EnterpriseLockedIconButton';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';

const ROLE_ADMIN: OrganizationRole = 'org_admin';

function roleOptions(t: (key: string) => string, memberLocked: boolean) {
  if (!memberLocked) {
    return [
      { key: 'org_admin' as const, label: t('org.members.role.orgAdmin') },
      { key: 'member' as const, label: t('org.members.role.member') },
    ];
  }
  return [
    { key: 'org_admin' as const, label: t('org.members.role.orgAdmin') },
    {
      key: 'member' as const,
      label: t('org.members.role.member'),
      disabled: true,
      trailing: <EnterpriseLockedIconButton size="compact" />,
    },
  ];
}

export function InviteMemberSheet({
  visible,
  busy,
  onClose,
  onSubmit,
}: {
  visible: boolean;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    username: string;
    email: string;
    role: OrganizationRole;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { enterpriseModulesAvailable, memberRoleAvailable } = useOrgAdminAccess();
  const memberLocked = !enterpriseModulesAvailable || !memberRoleAvailable;
  const defaultRole: OrganizationRole = memberLocked ? ROLE_ADMIN : 'member';
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(defaultRole);

  useEffect(() => {
    if (!visible) {
      setUsername('');
      setEmail('');
      setRole(memberLocked ? ROLE_ADMIN : 'member');
    }
  }, [visible, memberLocked]);

  return (
    <ConfigurationSheet
      visible={visible}
      title={t('org.members.inviteTitle')}
      subtitle={t('org.members.inviteSubtitle')}
      titleIcon={ActionIcons.invite}
      onClose={onClose}
      footer={
        <AppButton
          fullWidth
          label={t('org.members.inviteSubmit')}
          loading={busy}
          disabled={!username.trim() || !email.trim()}
          onPress={() =>
            void onSubmit({
              username,
              email,
              role,
            })
          }
        />
      }>
      <AppTextField label={t('org.members.field.username')} value={username} onChangeText={setUsername} />
      <AppTextField
        label={t('org.members.field.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />
      <AppSelectField
        label={t('org.members.field.role')}
        value={role}
        onChange={(v) => {
          if (memberLocked && v === 'member') return;
          setRole(v as OrganizationRole);
        }}
        options={roleOptions(t, memberLocked)}
      />
    </ConfigurationSheet>
  );
}

export function EditMemberSheet({
  user,
  busy,
  onClose,
  onSubmit,
}: {
  user: OrgUser | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: {
    username?: string;
    email?: string;
    role?: OrganizationRole;
    isActive?: boolean;
  }) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { enterpriseModulesAvailable, memberRoleAvailable } = useOrgAdminAccess();
  const memberLocked = !enterpriseModulesAvailable || !memberRoleAvailable;
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(ROLE_ADMIN);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (user) {
      setUsername(user.username);
      setEmail(user.email);
      setRole(user.role === 'member' ? 'member' : ROLE_ADMIN);
      setIsActive(user.isActive);
    }
  }, [user]);

  return (
    <ConfigurationSheet
      visible={Boolean(user)}
      title={t('org.members.editTitle')}
      subtitle={user?.email}
      onClose={onClose}
      footer={
        <AppButton
          fullWidth
          label={t('common.save')}
          loading={busy}
          onPress={() => void onSubmit({ username, email, role, isActive })}
        />
      }>
      <AppTextField label={t('org.members.field.username')} value={username} onChangeText={setUsername} />
      <AppTextField label={t('org.members.field.email')} value={email} onChangeText={setEmail} autoCapitalize="none" />
      <AppSelectField
        label={t('org.members.field.role')}
        value={role}
        onChange={(v) => {
          if (memberLocked && v === 'member') return;
          const next = v as OrganizationRole;
          setRole(next);
          // CE: promoting to Admin restores access — keep status Active with the role change.
          if (memberLocked && next === ROLE_ADMIN) {
            setIsActive(true);
          }
        }}
        options={roleOptions(t, memberLocked)}
      />
      <AppSelectField
        label={t('org.members.field.active')}
        value={isActive ? '1' : '0'}
        onChange={(v) => setIsActive(v === '1')}
        options={[
          { key: '1', label: t('org.members.status.active') },
          { key: '0', label: t('org.members.status.inactive') },
        ]}
      />
    </ConfigurationSheet>
  );
}
