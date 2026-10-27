import React from 'react';

import type { OrgGroup, OrgGroupMember, OrgUser } from '@/features/organization/types/organization.types';

export function GroupFormSheet(_props: {
  visible: boolean;
  group: OrgGroup | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (input: { name: string; description: string; image: string | null }) => Promise<void>;
}) {
  return null;
}

export function GroupMembersSheet(_props: {
  group: OrgGroup | null;
  members: OrgGroupMember[];
  candidates: OrgUser[];
  busy: boolean;
  onClose: () => void;
  onAdd: (userId: number) => Promise<void>;
  onRemove: (userId: number) => Promise<void>;
  onReplace?: (userIds: number[]) => Promise<void>;
}) {
  return null;
}

export function GroupPicker(_props: {
  groups: OrgGroup[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}) {
  return null;
}
