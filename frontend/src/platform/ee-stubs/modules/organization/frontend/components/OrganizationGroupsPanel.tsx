import React from 'react';

import type { OrgProject } from '@/features/organization/types/organization.types';

type FeedbackFn = (message: string, type?: 'success' | 'error') => void;

export function OrganizationGroupsPanel(_props: {
  projects: OrgProject[];
  createOpen?: boolean;
  onCreateOpenChange?: (open: boolean) => void;
  showCreateAction?: boolean;
  onFeedback: FeedbackFn;
  onChanged?: () => void;
}) {
  return null;
}
