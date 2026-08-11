import React from 'react';
import { View } from 'react-native';

import { HelpSection } from '@/features/settings/components/HelpSection';
import { useSettings } from '@/features/settings/hooks/useSettings';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function HelpSettingsScreen() {
  const { colors, spacing } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { settings } = useSettings();
  const { t } = useTranslation();
  const { openHelp } = useAppShell();

  return (
    <AppKeyboardScreenScroll
      rootStyle={{ backgroundColor: colors.background }}
      contentContainerStyle={{ padding: spacing.sm, paddingBottom: scrollBottomPadding }}>
      <SectionCard title={t('help.title')} subtitle={t('help.settings.subtitle')}>
        <View style={{ gap: spacing.sm }}>
          <AppButton label={t('help.gettingStarted.title')} size="compact" onPress={openHelp} />
          <HelpSection docsUrl={settings.help.docsUrl} supportEmail={settings.help.supportEmail} />
        </View>
      </SectionCard>
    </AppKeyboardScreenScroll>
  );
}