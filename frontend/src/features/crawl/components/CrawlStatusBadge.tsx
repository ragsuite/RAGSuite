import React from 'react';

import { StatusBadge, type StatusBadgeTone } from '@/shared/components/status-badge';

type Props = {
  label: string;
  tone?: 'default' | 'primary' | 'success' | 'muted' | 'danger' | 'warning' | 'fileType';
  preserveCase?: boolean;
};

const toneMap: Record<NonNullable<Props['tone']>, StatusBadgeTone> = {
  default: 'default',
  primary: 'active',
  success: 'success',
  muted: 'muted',
  danger: 'danger',
  warning: 'warning',
  fileType: 'danger',
};

export function CrawlStatusBadge({ label, tone = 'default', preserveCase = false }: Props) {
  return <StatusBadge label={label} tone={toneMap[tone]} preserveCase={preserveCase} />;
}
