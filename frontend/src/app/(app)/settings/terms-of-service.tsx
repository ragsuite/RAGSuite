import React from 'react';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { useTranslation } from '@/i18n';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export default function TermsOfServiceRoute() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('app.terms.title') }} />
      <AppScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.sm, paddingBottom: scrollBottomPadding }}>
        <SectionCard title={t('app.terms.sectionTitle')} subtitle={t('app.terms.sectionSubtitle')}>
          <View style={{ gap: spacing.sm }}>
            <Text style={[typography.body, { color: colors.text }]}>{t('app.terms.body1')}</Text>
            <Text style={[typography.body, { color: colors.text }]}>{t('app.terms.body2')}</Text>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('app.terms.footer')}</Text>
          </View>
        </SectionCard>
      </AppScrollView>
    </>
  );
}
