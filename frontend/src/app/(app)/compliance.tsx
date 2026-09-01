import React from 'react';

import { ComplianceScreen } from '@/features/compliance/screens/ComplianceScreen';
import { AnimatedScreen } from '@/shared/components/motion';

export default function ComplianceRoute() {
  return (
    <AnimatedScreen>
      <ComplianceScreen />
    </AnimatedScreen>
  );
}
