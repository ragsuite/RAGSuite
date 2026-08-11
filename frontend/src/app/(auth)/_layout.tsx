import { Redirect, Stack, useLocalSearchParams, usePathname } from 'expo-router';
import React from 'react';

import { useSession } from '@/features/auth/providers/session-provider';
import { resolvePostAuthHref } from '@/features/auth/utils/post-auth-redirect';
import { isPendingSsoCallback } from '@/features/auth/utils/sso-callback';
import { RouteErrorBoundary } from '@/shared/components/error/route-error-boundary';

export default function AuthLayout() {
  const { session, isAuthenticated, isBooting } = useSession();
  const pathname = usePathname();
  const params = useLocalSearchParams<{ success?: string }>();
  const ssoCallbackPending =
    isPendingSsoCallback() ||
    (pathname.includes('login/callback') && (params.success === '1' || params.success === 'true'));

  if (!isBooting && isAuthenticated && session && !ssoCallbackPending) {
    return <Redirect href={resolvePostAuthHref(session)} />;
  }

  return (
    <RouteErrorBoundary pageName="Auth">
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
        <Stack.Screen name="invite/setup" />
        <Stack.Screen name="login/callback" />
        <Stack.Screen name="check-email" />
        <Stack.Screen name="forgot-password" />
        <Stack.Screen name="reset-password" />
        <Stack.Screen name="verify-2fa" />
        <Stack.Screen name="verify-email" />
      </Stack>
    </RouteErrorBoundary>
  );
}
