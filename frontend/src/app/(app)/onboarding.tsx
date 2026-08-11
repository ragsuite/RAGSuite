import { Redirect } from 'expo-router';
import React from 'react';

import { useNeedsOnboarding } from '@/features/auth/hooks/use-needs-onboarding';
import { OnboardingScreen } from '@/features/onboarding/screens/onboarding-screen';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

/** Onboarding route — URL must stay `/onboarding` until setup is complete. */
export default function OnboardingRoute() {
  const needsOnboarding = useNeedsOnboarding();

  if (!needsOnboarding) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  return (
    <RouteErrorBoundary pageName="Onboarding">
      <OnboardingScreen />
    </RouteErrorBoundary>
  );
}
