import { Database, Globe, Palette, Timer } from 'lucide-react-native';
import React from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';

import { GlobalBrandingPanel } from '@/features/settings/components/GlobalBrandingPanel';
import { SettingsI18nPanel, getLocaleLabel } from '@/features/settings/components/SettingsI18nPanel';
import { SettingsPanelCard } from '@/features/settings/components/SettingsPanelCard';
import { SettingsRetentionPanel } from '@/features/settings/components/SettingsRetentionPanel';
import { SettingsSessionTimeoutPanel } from '@/features/settings/components/SettingsSessionTimeoutPanel';
import { type SettingsTabKey } from '@/features/settings/components/SettingsTabs';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useSettings } from '@/features/settings/hooks/useSettings';
import type { SettingsFeedback } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { InfoHintButton } from '@/shared/components/info-hint-button';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type Props = {
  tab: SettingsTabKey;
};

export function SettingsDetailScreen({ tab }: Props) {
  const { colors, spacing, brandedBackgroundStyle } = useAppTheme();
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
    updateBranding,
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
        rootStyle={brandedBackgroundStyle}
        contentContainerStyle={[styles.content, { gap: spacing.md, padding: spacing.sm, paddingBottom: scrollBottomPadding }]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => void refresh()} />}>
        <StatePanel loading={loading} error={error} onRetry={() => void refresh()}>
          {tab === 'global' ? (
            <SettingsPanelCard
              icon={Palette}
              title={t('settings.branding.title')}
              subtitle={t('settings.branding.subtitle')}>
              <GlobalBrandingPanel
                branding={settings.branding}
                primaryColor={settings.global.primaryColor}
                saving={saving}
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
            </SettingsPanelCard>
          ) : null}

          {tab === 'retention' ? (
            <SettingsPanelCard
              icon={Database}
              title={t('settings.retention.title')}
              subtitle={t('settings.retention.subtitle')}
              trailing={
                <InfoHintButton
                  title={t('settings.retention.autoDelete.hintTitle')}
                  body={t('settings.retention.autoDelete.hintBody')}
                  accessibilityLabel={t('settings.retention.autoDelete.hintTitle')}
                />
              }>
              <SettingsRetentionPanel />
            </SettingsPanelCard>
          ) : null}

          {tab === 'intl' ? (
            <SettingsPanelCard
              icon={Globe}
              title={t('settings.i18n.title')}
              subtitle={t('settings.i18n.subtitle')}>
              <SettingsI18nPanel saving={saving} onSave={handleSaveLocale} />
            </SettingsPanelCard>
          ) : null}

          {tab === 'session' ? (
            <SettingsPanelCard
              icon={Timer}
              title={t('settings.sessionTimeout.title')}
              subtitle={t('settings.sessionTimeout.subtitle')}
              trailing={
                <InfoHintButton
                  title={t('settings.sessionTimeout.hintTitle')}
                  body={t('settings.sessionTimeout.note.others')}
                  accessibilityLabel={t('settings.sessionTimeout.hintTitle')}
                />
              }>
              <SettingsSessionTimeoutPanel />
            </SettingsPanelCard>
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
