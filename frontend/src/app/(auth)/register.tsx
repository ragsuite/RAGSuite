import { Redirect } from 'expo-router';
import React from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { usePublicAuthConfig } from '@/features/auth/hooks/use-public-auth-config';
import { useSession } from '@/features/auth/providers/session-provider';
import { RegisterScreen } from '@/features/auth/screens/register-screen';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export default function RegisterRoute() {
  const { session, isAuthenticated, isBooting } = useSession();
  const { config, isLoading: isConfigLoading } = usePublicAuthConfig();
  const { colors } = useAppTheme();

  if (!isBooting && isAuthenticated) {
    if (session && !session.user.hasCompletedOnboarding) {
      return <Redirect href="/(app)/onboarding" />;
    }
    return <Redirect href="/(app)/(tabs)" />;
  }

  if (isBooting || isConfigLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  // First-time setup only (fresh DB / no active org admin). After that, use invites.
  if (!config.registrationEnabled) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  return <RegisterScreen />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
