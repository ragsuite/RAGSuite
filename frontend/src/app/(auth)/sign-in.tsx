import { Redirect } from 'expo-router';
import React from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { SignInScreen } from '@/features/auth/screens/sign-in-screen';

export default function SignInRoute() {
  const { session, isAuthenticated, isBooting } = useSession();

  if (!isBooting && isAuthenticated) {
    if (session && !session.user.hasCompletedOnboarding) {
      return <Redirect href="/(app)/onboarding" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  return <SignInScreen />;
}
