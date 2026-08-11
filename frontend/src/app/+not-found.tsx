import { useRouter } from 'expo-router';
import React, { useCallback } from 'react';
import { StyleSheet, View } from 'react-native';

import { ErrorStateCard } from '@/shared/components/error/error-state-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useTranslation } from '@/i18n';

export default function NotFoundRoute() {
  const router = useRouter();
  const { colors } = useAppTheme();
  const { t } = useTranslation();

  const goHome = useCallback(() => {
    router.replace('/(app)/(tabs)');
  }, [router]);

  const goBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }
    goHome();
  }, [goHome, router]);

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ErrorStateCard
        variant="notFound"
        onPrimary={goHome}
        primaryLabel={t('errors.notFound.cta.home')}
        onSecondary={goBack}
        secondaryLabel={t('errors.notFound.cta.back')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});
