import { Languages, Moon, Sun } from 'lucide-react-native';
import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { LocaleFlag } from '@/i18n/locale-flag';
import { useTranslation } from '@/i18n';
import { AdaptivePickerSheet } from '@/shared/components/adaptive/adaptive-picker-sheet';
import { NavGroupLabel } from '@/shared/components/brand';
import { DrawerActionRow } from '@/shared/components/navigation/drawer-action-row';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  onPrimaryBackground?: boolean;
  onNeutralSidebar?: boolean;
};

export function DrawerPreferencesSection({
  onPrimaryBackground = false,
  onNeutralSidebar = false,
}: Props) {
  const { spacing, typography, colors, mode } = useAppTheme();
  const { toggleTheme } = useSettings();
  const { locale, setLocale, availableLocales, t } = useTranslation();
  const [languageOpen, setLanguageOpen] = useState(false);
  const themeIsDark = mode === 'dark';

  const currentLocale = useMemo(
    () => availableLocales.find((item) => item.code === locale),
    [availableLocales, locale],
  );

  const languageOptions = useMemo(
    () =>
      availableLocales.map((item) => ({
        key: item.code,
        label: item.name,
        leading: <LocaleFlag code={item.code} size={20} />,
      })),
    [availableLocales],
  );

  const sectionTitleColor = onPrimaryBackground
    ? 'rgba(255,255,255,0.58)'
    : colors.textMuted;

  return (
    <>
      <View style={[styles.section, { gap: spacing.xs, paddingHorizontal: spacing.xs }]}>
        <NavGroupLabel style={{ color: sectionTitleColor }}>{t('drawer.preferences')}</NavGroupLabel>

        <View style={{ gap: spacing.xxs }}>
          <DrawerActionRow
            label={t('drawer.language')}
            icon={Languages}
            value={<LocaleFlag code={locale} size={18} />}
            valueLabel={currentLocale?.name}
            onPress={() => setLanguageOpen(true)}
            onPrimaryBackground={onPrimaryBackground}
            onNeutralSidebar={onNeutralSidebar}
            accessibilityLabel={t('settings.i18n.defaultLanguage')}
            testID="button-language-selector-drawer"
          />

          <DrawerActionRow
            label={t('drawer.appearance')}
            icon={themeIsDark ? Sun : Moon}
            valueLabel={themeIsDark ? t('theme.dark') : t('theme.light')}
            showChevron={false}
            onPress={() => void toggleTheme()}
            onPrimaryBackground={onPrimaryBackground}
            onNeutralSidebar={onNeutralSidebar}
            accessibilityLabel={t('theme.toggle')}
            testID="button-drawer-theme-toggle"
          />
        </View>
      </View>

      <AdaptivePickerSheet
        visible={languageOpen}
        title={t('settings.i18n.defaultLanguage')}
        value={locale}
        options={languageOptions}
        indicatorPosition="left"
        onSelect={(value) => setLocale(value)}
        onClose={() => setLanguageOpen(false)}
      />
    </>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
  },
});
