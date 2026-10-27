import React from 'react';

import type { OrgGroup } from '@/features/organization/types/organization.types';

export function GroupFormSheet(_props: {
  visible: boolean;
  group: OrgGroup | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string; image: string | null }) => Promise<void>;
}) {
  return null;
}
