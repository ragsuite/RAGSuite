import React from 'react';

import {
  EnterpriseLockedPreview,
  OrganizationMembersMock,
  OrganizationSsoMock,
} from '@/platform/ee-locked';
import { useTranslation } from '@/i18n';

type Props = {
  panel?: 'users' | 'sso' | string;
};

/** CE locked teaser — org / teams / RBAC / SSO live in EE `organization` + `sso`. */
export function OrganizationScreen({ panel = 'users' }: Props) {
  const { t } = useTranslation();
  const isSso = panel === 'sso';

  return (
    <EnterpriseLockedPreview
      featureName={
        isSso
          ? t('enterprise.locked.features.sso', { defaultValue: 'SSO / SAML / OIDC' })
          : t('enterprise.locked.features.organization', {
              defaultValue: 'Organisation & RBAC',
            })
      }
      message={
        isSso
          ? t('enterprise.locked.messages.sso', {
              defaultValue:
                'SSO / SAML / OIDC is available in RAGSuite Enterprise. Use Projects for workspace admin in Community.',
            })
          : t('enterprise.locked.messages.organization', {
              defaultValue:
                'Organisation administration, teams, and RBAC are available in RAGSuite Enterprise. Use Projects for workspace admin in Community.',
            })
      }>
      {isSso ? <OrganizationSsoMock /> : <OrganizationMembersMock />}
    </EnterpriseLockedPreview>
  );
}
