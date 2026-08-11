import { Redirect } from 'expo-router';

import { SplashScreen } from '@/features/auth/screens/splash-screen';
import { useSession } from '@/features/auth/providers/session-provider';

export default function IndexRoute() {
  const { isBooting, isAuthenticated, session } = useSession();

  if (isBooting) {
    return <SplashScreen />;
  }

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (session && !session.user.hasCompletedOnboarding) {
    return <Redirect href="/(app)/onboarding" />;
  }

  return <Redirect href="/(app)/(tabs)" />;
}
