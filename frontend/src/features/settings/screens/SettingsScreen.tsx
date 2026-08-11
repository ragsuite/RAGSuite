import React, { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import { ChevronRight, FileText, Globe, Info, Palette, Scale, ShieldCheck } from 'lucide-react-native';

import { useSession } from '@/features/auth/providers/session-provider';
import { SETTINGS_TAB_PERMISSIONS } from '@/features/organization/utils/workspace-permissions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { useUserProfileSummary } from '@/features/profile/hooks/useUserProfileSummary';
import { GlobalBrandingPanel } from '@/features/settings/components/GlobalBrandingPanel';
import { SettingsI18nPanel, getLocaleLabel } from '@/features/settings/components/SettingsI18nPanel';
import { SettingsRetentionPanel } from '@/features/settings/components/SettingsRetentionPanel';
import { type SettingsTabKey, SettingsTabs } from '@/features/settings/components/SettingsTabs';
import { BRANDING_DEFAULTS } from '@/shared/constants/branding-defaults';
import { useSettings } from '@/features/settings/hooks/useSettings';
import type { SettingsFeedback } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { SectionCard } from '@/shared/components/dashboard/section-card';
import { NavGroupLabel } from '@/shared/components/brand';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppShell } from '@/shared/components/navigation/app-shell-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';
import { ActionIcons } from '@/shared/constants/action-icons';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

type MobileSettingsItem = {
  labelKey: string;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  kind: 'route' | 'link' | 'value' | 'help';
  route?:
    | '/(app)/settings/global-setup'
    | '/(app)/settings/data-retentions'
    | '/(app)/settings/language-region'
    | '/(app)/settings/about-us'
    | '/(app)/settings/terms-of-service'
    | '/(app)/settings/licenses';
  url?: string;
  value?: string;
};

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

function buildMobileSettingsSections(appVersion: string): { titleKey: string; items: MobileSettingsItem[] }[] {
  return [
    {
      titleKey: 'app.settings.workspace',
      items: [
        { labelKey: 'settings.profile', icon: Palette, kind: 'route', route: '/(app)/settings/global-setup' },
        { labelKey: 'settings.data-retention', icon: ShieldCheck, kind: 'route', route: '/(app)/settings/data-retentions' },
        { labelKey: 'settings.i18n', icon: Globe, kind: 'route', route: '/(app)/settings/language-region' },
        { labelKey: 'help.title', icon: ActionIcons.help, kind: 'help' },
      ],
    },
    {
      titleKey: 'app.settings.legal',
      items: [
        { labelKey: 'app.settings.privacyPolicy', icon: FileText, kind: 'link', url: 'https://ragsuite.ai/privacy' },
        { labelKey: 'app.terms.title', icon: Scale, kind: 'route', route: '/(app)/settings/terms-of-service' },
        { labelKey: 'app.licenses.title', icon: FileText, kind: 'route', route: '/(app)/settings/licenses' },
        { labelKey: 'app.about.title', icon: Info, kind: 'route', route: '/(app)/settings/about-us' },
        { labelKey: 'app.settings.appVersion', icon: Info, kind: 'value', value: `v${appVersion}` },
      ],
    },
  ];
}

export function SettingsScreen() {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const router = useRouter();
  const { openHelp } = useAppShell();
  const { session } = useSession();
  const { profile } = useUserProfileSummary();
  const [activeTab, setActiveTab] = useState<SettingsTabKey>('global');
  const [intlFeedback, setIntlFeedback] = useState<SettingsFeedback>(null);
  const { t, locale } = useTranslation();
  const { contentMaxWidth, horizontalPadding } = useFeatureScreenLayout();
  const isWeb = Platform.OS === 'web';

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
  const { hasPermission } = useActiveProject();

  const canViewSettingsTab = (tab: SettingsTabKey) => {
    const required = SETTINGS_TAB_PERMISSIONS[tab];
    if (!required?.length) return true;
    return required.some((perm) => hasPermission(perm));
  };

  const visibleSettingsTabs = React.useMemo(
    () => (['global', 'retention', 'intl'] as const).filter((tab) => canViewSettingsTab(tab)),
    [hasPermission],
  );

  useEffect(() => {
    if (visibleSettingsTabs.length === 0) return;
    if (!visibleSettingsTabs.includes(activeTab)) {
      setActiveTab(visibleSettingsTabs[0]);
    }
  }, [activeTab, visibleSettingsTabs]);

  const showGlobal = activeTab === 'global' && canViewSettingsTab('global');
  const showRetention = activeTab === 'retention' && canViewSettingsTab('retention');
  const showIntl = activeTab === 'intl' && canViewSettingsTab('intl');

  const handleSaveLocale = () => {
    setIntlFeedback({
      type: 'success',
      message: `${t('settings.i18n.toast.saved.title')}: ${t('settings.i18n.toast.saved.description', { language: getLocaleLabel(locale) })}`,
    });
  };

  const resolvedFeedback = intlFeedback ?? feedback;
  const mobileRoutePermission: Partial<Record<NonNullable<MobileSettingsItem['route']>, string>> = {
    '/(app)/settings/global-setup': 'settings:global',
    '/(app)/settings/data-retentions': 'settings:data_retention',
    '/(app)/settings/language-region': 'settings:i18n',
  };

  const mobileSettingsSections = React.useMemo(() => {
    return buildMobileSettingsSections(APP_VERSION)
      .map((section) => ({
        ...section,
        items: section.items.filter((item) => {
          if (item.kind !== 'route' || !item.route) return true;
          const perm = mobileRoutePermission[item.route];
          return perm ? hasPermission(perm) : true;
        }),
      }))
      .filter((section) => section.items.length > 0);
  }, [hasPermission]);

  return (
    <View style={styles.root}>
      <AppKeyboardScreenScroll
        rootStyle={{ backgroundColor: colors.background }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={[
          styles.content,
          {
            gap: spacing.lg,
            paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.sm) : spacing.sm,
            paddingTop: spacing.md,
            paddingBottom: scrollBottomPadding,
            ...(isWeb && contentMaxWidth
              ? { maxWidth: contentMaxWidth, alignSelf: 'center' as const, width: '100%' }
              : null),
          },
        ]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={() => void refresh()} />}>
        {isWeb ? (
          <>
            <PageSectionHeader title={t('settings.title')} subtitle={t('settings.description')} />
            <SettingsTabs
              activeTab={activeTab}
              visibleTabs={visibleSettingsTabs}
              onChange={(next) => {
                clearFeedback();
                setActiveTab(next);
              }}
            />
          </>
        ) : (
          <>
            <View
              style={[
                styles.profileCard,
                {
                  borderRadius: surfaceRadius.card,
                  borderColor: colors.border,
                  backgroundColor: colors.surface,
                  padding: spacing.md,
                },
              ]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Manage profile"
                onPress={() => router.push('/(app)/profile')}
                style={({ pressed }) => [
                  styles.profileRow,
                  { backgroundColor: pressed ? colors.surfaceMuted : colors.surface, borderRadius: surfaceRadius.button },
                ]}>
                <Image
                  source={{ uri: profile?.user.avatar ?? `https://api.dicebear.com/9.x/initials/png?seed=${encodeURIComponent(session?.user.fullName ?? 'User')}` }}
                  style={[styles.avatar, { borderRadius: surfaceRadius.card, borderColor: colors.border }]}
                  contentFit="cover"
                />
                <View style={styles.profileText}>
                  <Text style={[typography.body, styles.profileName, { color: colors.text }]} numberOfLines={1}>
                    {profile?.user.name ?? session?.user.fullName ?? 'Workspace user'}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]} numberOfLines={1}>
                    {profile?.user.email ?? session?.user.email ?? ''}
                  </Text>
                </View>
              </Pressable>
            </View>

            {mobileSettingsSections.map((section, sectionIndex) => (
              <View key={section.titleKey} style={{ gap: spacing.xs, marginTop: sectionIndex === 0 ? spacing.xs : spacing.md }}>
                <NavGroupLabel style={{ marginBottom: spacing.xxs }}>{t(section.titleKey)}</NavGroupLabel>
                <View style={[styles.mobileMenu, { borderRadius: surfaceRadius.card, borderColor: colors.border, backgroundColor: colors.surface }]}>
                  {section.items.map((item, index) => {
                    const Icon = item.icon;
                    const isLast = index === section.items.length - 1;
                    const isAction = item.kind === 'route' || item.kind === 'link' || item.kind === 'help';
                    const label = t(item.labelKey);
                    return (
                      <View key={`${section.titleKey}-${item.labelKey}`}>
                        <Pressable
                          disabled={!isAction}
                          onPress={() => {
                            if (item.kind === 'route' && item.route) router.push(item.route);
                            if (item.kind === 'link' && item.url) void Linking.openURL(item.url);
                            if (item.kind === 'help') openHelp();
                          }}
                          style={({ pressed }) => [
                            styles.mobileMenuRow,
                            { backgroundColor: pressed && isAction ? colors.surfaceMuted : colors.surface },
                          ]}>
                          <View style={[styles.mobileMenuLabelWrap, { gap: spacing.xs }]}>
                            <View style={[styles.rowIconWrap, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.button }]}>
                              <Icon size={16} color={colors.textMuted} />
                            </View>
                            <Text style={[typography.body, { color: colors.text, fontWeight: '500', flex: 1, flexShrink: 1 }]}>{label}</Text>
                          </View>
                          {item.kind === 'value' ? (
                            <Text style={[typography.caption, { color: colors.textMuted }]}>{item.value}</Text>
                          ) : (
                            <ChevronRight size={16} color={colors.textMuted} />
                          )}
                        </Pressable>
                        {!isLast ? <View style={[styles.insetDivider, { backgroundColor: colors.border, marginLeft: 54 }]} /> : null}
                      </View>
                    );
                  })}
                </View>
              </View>
            ))}
          </>
        )}

        {isWeb ? (
          <StatePanel loading={loading} error={error} onRetry={() => void refresh()}>
            {showGlobal ? (
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

            {showRetention ? (
              <SectionCard title={t('settings.retention.title')}>
                <SettingsRetentionPanel
                  retentionDays={settings.retention.retentionDays}
                  saving={saving}
                  onSave={(days) =>
                    void updateRetention({
                      autoDelete: settings.retention.autoDelete,
                      retentionDays: days,
                    })
                  }
                />
              </SectionCard>
            ) : null}

            {showIntl ? (
              <SectionCard title={t('settings.i18n.title')} titleLeading={<Globe size={20} color={colors.text} />}>
                <SettingsI18nPanel saving={saving} onSave={handleSaveLocale} />
              </SectionCard>
            ) : null}
          </StatePanel>
        ) : null}
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
  profileCard: { borderWidth: 1 },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  profileText: { flex: 1, minWidth: 0, gap: 2 },
  profileName: {  },
  avatar: { width: 48, height: 48, borderWidth: 1 },
  mobileMenu: { borderWidth: 1, overflow: 'hidden' },
  mobileMenuRow: { minHeight: 56, paddingHorizontal: 14, paddingVertical: 11, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mobileMenuLabelWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 },
  rowIconWrap: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  insetDivider: { height: StyleSheet.hairlineWidth },
});
