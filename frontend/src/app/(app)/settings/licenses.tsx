import React from 'react';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { useTranslation } from '@/i18n';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

const LICENSE_ITEMS = [
  { name: 'React Native', license: 'MIT' },
  { name: 'Expo', license: 'MIT' },
  { name: 'Expo Router', license: 'MIT' },
  { name: 'Lucide React Native', license: 'ISC' },
];

export default function LicensesRoute() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();

  return (
    <>
      <Stack.Screen options={{ title: t('app.licenses.title') }} />
      <AppScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.sm, paddingBottom: scrollBottomPadding }}>
        <SectionCard title={t('app.licenses.sectionTitle')} subtitle={t('app.licenses.sectionSubtitle')}>
          <View style={{ gap: spacing.xs }}>
            {LICENSE_ITEMS.map((item) => (
              <View key={item.name} style={{ gap: 2 }}>
                <Text style={[typography.body, { color: colors.text }]}>{item.name}</Text>
                <Text style={[typography.caption, { color: colors.textMuted }]}>{item.license}</Text>
              </View>
            ))}
          </View>
        </SectionCard>
      </AppScrollView>
    </>
  );
}
