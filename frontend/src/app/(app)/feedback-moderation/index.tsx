import React from 'react';

import { FeedbackModerationScreen } from '@/features/feedback-moderation/screens/FeedbackModerationScreen';
import { WorkspaceRouteGuard } from '@/shared/components/navigation/workspace-route-guard';
import { AnimatedScreen } from '@/shared/components/motion';

export default function FeedbackModerationRoute() {
  return (
    <WorkspaceRouteGuard route="feedback-moderation">
      <AnimatedScreen>
        <FeedbackModerationScreen />
      </AnimatedScreen>
    </WorkspaceRouteGuard>
  );
}
