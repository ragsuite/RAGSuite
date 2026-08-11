import { Redirect } from 'expo-router';
import React from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { Verify2FAScreen } from '@/features/auth/screens/verify-2fa-screen';

export default function Verify2FARoute() {
  const { session, isAuthenticated, isBooting } = useSession();

  if (!isBooting && isAuthenticated) {
    if (session && !session.user.hasCompletedOnboarding) {
      return <Redirect href="/(app)/onboarding" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <Verify2FAScreen />;
}
