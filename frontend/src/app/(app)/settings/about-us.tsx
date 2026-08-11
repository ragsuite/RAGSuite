import React from 'react';
import { Stack } from 'expo-router';
import { Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import Constants from 'expo-constants';

import { getProductEdition } from '@/config/product-edition';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import { useTranslation } from '@/i18n';
import { EditionBadge } from '@/shared/components/brand';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export default function AboutUsRoute() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();
  const { enterpriseModulesAvailable } = useOrgAdminAccess();
  const productEdition = getProductEdition({
    enterpriseAttached: enterpriseModulesAvailable,
  });

  return (
    <>
      <Stack.Screen options={{ title: t('app.about.title') }} />
      <AppScrollView contentContainerStyle={{ gap: spacing.md, padding: spacing.sm, paddingBottom: scrollBottomPadding }}>
        <SectionCard title={t('app.about.productName')} subtitle={t('app.about.productSubtitle')}>
          <View style={{ gap: spacing.sm }}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
              <EditionBadge variant={productEdition} />
              <EditionBadge variant="beta" />
            </View>
            <Text style={[typography.body, { color: colors.text }]}>{t('app.about.description')}</Text>
            <Text style={[typography.caption, typography.numeric, { color: colors.textMuted }]}>
              {t('app.about.version', { version: Constants.expoConfig?.version ?? '1.0.0' })}
            </Text>
          </View>
        </SectionCard>
      </AppScrollView>
    </>
  );
}
