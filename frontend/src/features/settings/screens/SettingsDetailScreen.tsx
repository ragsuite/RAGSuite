import { Globe, Palette } from 'lucide-react-native';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';

import { GlobalBrandingPanel } from '@/features/settings/components/GlobalBrandingPanel';
import { SettingsI18nPanel, getLocaleLabel } from '@/features/settings/components/SettingsI18nPanel';
import { SettingsRetentionPanel } from '@/features/settings/components/SettingsRetentionPanel';
import { type SettingsTabKey } from '@/features/settings/components/SettingsTabs';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useSettings } from '@/features/settings/hooks/useSettings';
import type { SettingsFeedback } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type Props = {
  tab: SettingsTabKey;
};

export function SettingsDetailScreen({ tab }: Props) {
  const { colors, spacing } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const [intlFeedback, setIntlFeedback] = React.useState<SettingsFeedback>(null);
  const { t, locale } = useTranslation();
  const {
    settings,
    loading,
    refreshing,
    saving,
    error,
    feedback,
    refresh,
    clearFeedback,
    updateRetention,
    updateBranding,
    updateBackgroundTheme,
    applyBrandingPreview,
  } = useSettings();

  const handleSaveLocale = () => {
    setIntlFeedback({
      type: 'success',
      message: `${t('settings.i18n.toast.saved.title')}: ${t('settings.i18n.toast.saved.description', { language: getLocaleLabel(locale) })}`,
    });
  };

  const resolvedFeedback = intlFeedback ?? feedback;

  return (
    <View style={styles.root}>
      <AppKeyboardScreenScroll
        rootStyle={{ backgroundColor: colors.background }}
        contentContainerStyle={[styles.content, { gap: spacing.md, padding: spacing.sm, paddingBottom: scrollBottomPadding }]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <StatePanel loading={loading} error={error} onRetry={() => void refresh()}>
          {tab === 'global' ? (
            <SectionCard title={t('settings.branding.title')} titleLeading={<Palette size={20} color={colors.text} />}>
              <GlobalBrandingPanel
                branding={settings.branding}
                primaryColor={settings.global.primaryColor}
                backgroundTheme={settings.global.backgroundTheme}
                saving={saving}
                onBackgroundThemeChange={(theme) => void updateBackgroundTheme(theme)}
                onSave={(payload) => void updateBranding(payload)}
                onPreviewChange={applyBrandingPreview}
                onReset={() =>
                  void updateBranding({
                    orgName: BRANDING_DEFAULTS.orgName,
                    logoDataUrl: BRANDING_DEFAULTS.logoDataUrl,
                    primaryColor: BRANDING_DEFAULTS.primaryColor,
                  })
                }
              />
            </SectionCard>
          ) : null}

          {tab === 'retention' ? (
            <SectionCard title={t('settings.retention.title')}>
              <SettingsRetentionPanel
                retentionDays={settings.retention.retentionDays}
                autoDelete={settings.retention.autoDelete}
                saving={saving}
                onSave={(payload) => void updateRetention(payload)}
              />
            </SectionCard>
          ) : null}

          {tab === 'intl' ? (
            <SectionCard title={t('settings.i18n.title')} titleLeading={<Globe size={20} color={colors.text} />}>
              <SettingsI18nPanel saving={saving} onSave={handleSaveLocale} />
            </SectionCard>
          ) : null}
        </StatePanel>
      </AppKeyboardScreenScroll>
      {resolvedFeedback ? (
        <ToastFeedbackBridge
          feedback={resolvedFeedback}
          onDismiss={() => {
            setIntlFeedback(null);
            clearFeedback();
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  content: { width: '100%' },
});
