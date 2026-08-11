import { Redirect, useLocalSearchParams } from 'expo-router';
import React from 'react';

/** Back-compat: old invite emails used /invite/setup?token=… — forward to sign-in. */
export default function InviteSetupRedirect() {
  const params = useLocalSearchParams<{ token?: string | string[] }>();
  const token = Array.isArray(params.token) ? params.token[0] : params.token;

  if (!token?.trim()) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return (
    <Redirect
      href={{
        pathname: '/(auth)/sign-in',
        params: { invite: token.trim() },
      }}
    />
  );
}
