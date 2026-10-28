import React, { useEffect, useState } from 'react';

import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import type {
  InviteOrgUserInput,
  OrgUser,
  OrganizationRole,
  UpdateOrgUserInput,
} from '@/features/organization/types/organization.types';
import { ContactLocationForm } from '@/features/profile/components/ContactLocationForm';
import { PersonalInfoForm } from '@/features/profile/components/PersonalInfoForm';
import { ProfileHeader } from '@/features/profile/components/ProfileHeader';
import { useMemberProfileFields } from '@/features/profile/hooks/use-member-profile-fields';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedIconButton } from '@/platform/ee-locked/EnterpriseLockedIconButton';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { ActionIcons } from '@/shared/constants/action-icons';
import { isValidEmailAddress, liveEmailInvalid } from '@/shared/utils/email';

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
  onSubmit: (input: InviteOrgUserInput) => Promise<OrgUser | void>;
}) {
  const { t } = useTranslation();
  const { enterpriseModulesAvailable, memberRoleAvailable } = useOrgAdminAccess();
  const memberLocked = !enterpriseModulesAvailable || !memberRoleAvailable;
  const defaultRole: OrganizationRole = memberLocked ? ROLE_ADMIN : 'member';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<OrganizationRole>(defaultRole);

  useEffect(() => {
    if (!visible) {
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole(memberLocked ? ROLE_ADMIN : 'member');
    }
  }, [visible, memberLocked]);

  const emailValid = isValidEmailAddress(email);
  const namesValid = firstName.trim().length > 0 && lastName.trim().length > 0;

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
          disabled={!emailValid || !namesValid}
          onPress={() =>
            void (async () => {
              const created = await onSubmit({
                firstName,
                lastName,
                email,
                role,
              });
              if (created) onClose();
            })()
          }
        />
      }>
      <AppTextField
        label={t('org.members.field.firstName')}
        value={firstName}
        onChangeText={setFirstName}
        autoComplete="given-name"
        required
      />
      <AppTextField
        label={t('org.members.field.lastName')}
        value={lastName}
        onChangeText={setLastName}
        autoComplete="family-name"
        required
      />
      <AppTextField
        label={t('org.members.field.email')}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        required
        error={liveEmailInvalid(email) ? t('auth.validation.email') : undefined}
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
  onSubmit: (input: UpdateOrgUserInput) => Promise<void>;
}) {
  const { t } = useTranslation();
  const { enterpriseModulesAvailable, memberRoleAvailable } = useOrgAdminAccess();
  const memberLocked = !enterpriseModulesAvailable || !memberRoleAvailable;
  const fields = useMemberProfileFields(user);
  const [role, setRole] = useState<OrganizationRole>(ROLE_ADMIN);
  const [isActive, setIsActive] = useState(true);

  useEffect(() => {
    if (!user) return;
    setRole(user.role === 'member' ? 'member' : ROLE_ADMIN);
    setIsActive(user.isActive);
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
          onPress={() => {
            void (async () => {
              const payload = fields.validate();
              if (!payload) return;
              await onSubmit({
                ...payload,
                role,
                isActive,
              });
            })();
          }}
        />
      }>
      {user ? (
        <ProfileHeader
          compact
          name={fields.displayName}
          role={role === ROLE_ADMIN ? t('org.members.role.orgAdmin') : t('org.members.role.member')}
          jobTitle={fields.jobTitle}
          joinedAt={user.createdAt}
          avatar={fields.avatar}
          onAvatarPress={fields.pickAvatar}
        />
      ) : null}
      <PersonalInfoForm
        embedded
        firstName={fields.firstName}
        lastName={fields.lastName}
        username={user?.username ?? ''}
        email={user?.email ?? ''}
        jobTitle={fields.jobTitle}
        onChange={fields.personalOnChange}
        errors={fields.errors}
        afterEmail={
          <>
            <AppSelectField
              label={t('org.members.field.role')}
              value={role}
              onChange={(v) => {
                if (memberLocked && v === 'member') return;
                const next = v as OrganizationRole;
                setRole(next);
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
          </>
        }
      />
      <ContactLocationForm
        embedded
        phone={fields.phone}
        country={fields.country}
        timezone={fields.timezone}
        bio={fields.bio}
        onCountryChange={fields.onCountryChange}
        onChange={fields.contactOnChange}
        errors={fields.errors}
      />
    </ConfigurationSheet>
  );
}
