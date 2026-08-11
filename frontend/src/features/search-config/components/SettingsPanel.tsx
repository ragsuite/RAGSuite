import React from 'react';
import { StyleSheet, View } from 'react-native';

import { SearchConfigMobileMenu } from '@/features/search-config/components/SearchConfigMobileMenu';
import { SearchConfigSettingsContent } from '@/features/search-config/components/SearchConfigSettingsContent';
import { SearchConfigSettingsNav } from '@/features/search-config/components/SearchConfigSettingsNav';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

export function SettingsPanel() {
  const { t } = useTranslation();
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const { isCompact, isNativeMobile, showSettingsSidebar } = useSearchConfigLayout();
  const { settingsSection } = useSearchConfig();

  if (isCompact && isNativeMobile) {
    return (
      <View
        style={[
          styles.workspace,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.card,
            backgroundColor: colors.surface,
            padding: spacing.md,
            gap: spacing.md,
          },
        ]}
        accessibilityLabel={t('search.settings.title')}>
        <SearchConfigMobileMenu />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.workspace,
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.md,
          gap: spacing.md,
        },
      ]}
      accessibilityLabel={t('search.settings.title')}>
      <View style={[styles.layout, { gap: spacing.lg }]}>
        {showSettingsSidebar ? <SearchConfigSettingsNav /> : null}
        <View style={[styles.content, { gap: spacing.md }]}>
          <SearchConfigSettingsContent section={settingsSection} />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  workspace: { borderWidth: 1 },
  layout: { flexDirection: 'row', alignItems: 'flex-start' },
  content: { flex: 1, minWidth: 0 },
});
