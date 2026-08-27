import { Shield } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { TrustCenterTabs } from '@/features/trust-center/components/TrustCenterTabs';
import { TrustDocumentView } from '@/features/trust-center/components/TrustDocumentView';
import { TrustExportActions } from '@/features/trust-center/components/TrustExportActions';
import {
  getTrustDocument,
  resolveTrustLocale,
  type TrustCenterTabId,
} from '@/features/trust-center/content';
import { useTrustCenterPrintStyles } from '@/features/trust-center/hooks/useTrustCenterPrintStyles';
import { useTranslation } from '@/i18n';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { useToast } from '@/shared/toast/use-toast';

export function TrustCenterScreen() {
  const { t, locale } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const { toast } = useToast();
  const isWeb = Platform.OS === 'web';
  const [activeTab, setActiveTab] = useState<TrustCenterTabId>('overview');

  useTrustCenterPrintStyles();

  const trustLocale = resolveTrustLocale(locale);
  const document = useMemo(
    () => getTrustDocument(activeTab, locale),
    [activeTab, locale],
  );

  return (
    <AppScrollView
      style={[styles.root, { backgroundColor: colors.background }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.sm) : spacing.sm,
          paddingTop: isWeb ? spacing.md : spacing.sm,
          gap: spacing.md,
          width: '100%',
          paddingBottom: scrollBottomPadding,
          ...(isWeb ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const } : null),
        },
      ]}>
      <View
        // @ts-expect-error web data attribute — hide chrome when printing
        dataSet={isWeb ? { trustChrome: 'true' } : undefined}
        style={{ gap: spacing.md }}>
        <PageSectionHeader
          title={t('trustCenter.title')}
          subtitle={t('trustCenter.subtitle')}
          leading={<Shield size={22} color={colors.text} strokeWidth={2.1} />}
        />

        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>
          {t('trustCenter.disclaimer.banner')}
        </Text>

        <TrustCenterTabs activeTab={activeTab} onChange={setActiveTab} />

        <TrustExportActions
          document={document}
          locale={trustLocale}
          onFeedback={(message, variant = 'success') => {
            toast({ description: message, variant });
          }}
        />
      </View>

      <TrustDocumentView document={document} />
    </AppScrollView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
  },
});
