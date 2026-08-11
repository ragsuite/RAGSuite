import React from 'react';

import { AuditLogsScreen } from '@/features/audit-logs/screens/AuditLogsScreen';
import { AnimatedScreen } from '@/shared/components/motion';

export default function AuditLogsRoute() {
  return (
    <AnimatedScreen>
      <AuditLogsScreen />
    </AnimatedScreen>
  );
}
