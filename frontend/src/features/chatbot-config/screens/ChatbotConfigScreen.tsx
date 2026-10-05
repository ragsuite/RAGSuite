import React, { useEffect, useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Code2, MessageSquare, Settings } from 'lucide-react-native';

import { ChatbotConfigSkeleton } from '@/features/chatbot-config/components/ChatbotConfigSkeleton';
import { IntegrationsScriptsPanel } from '@/features/chatbot-config/components/settings/IntegrationsScriptsPanel';
import { SettingsPanel } from '@/features/chatbot-config/components/SettingsPanel';
import { TrainingPanel } from '@/features/chatbot-config/components/TrainingPanel';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { ChatbotConfigPrimaryTab } from '@/features/chatbot-config/types/chatbot-config.types';
import {
  clearChatbotPrimaryTabRequest,
  clearChatbotSettingsSectionRequest,
  peekChatbotPrimaryTabRequest,
  peekChatbotSettingsSectionRequest,
} from '@/features/chatbot-config/utils/chatbot-pending-primary-tab';
import { CHATBOT_TAB_PERMISSIONS } from '@/features/organization/utils/workspace-permissions';
import { useActiveProject } from '@/features/projects/providers/active-project-provider';
import { WidgetsHeader } from '@/features/widgets';
import { useTranslation } from '@/i18n';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { getWebParityTabLabelStyle, getWebParityTabPressableStyle, getWebParityTabStyle, WEB_PARITY_TAB_HEIGHT_PRIMARY } from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

function ChatbotConfigContent() {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces, mode } = useAppTheme();
  const {
    loading,
    refreshing,
    error,
    feedback,
    primaryTab,
    setPrimaryTab,
    setSettingsSection,
    navigationKey,
    refresh,
    clearFeedback,
  } = useChatbotConfig();
  const { hasPermission } = useActiveProject();

  const canViewTab = (tab: ChatbotConfigPrimaryTab) => {
    const required = CHATBOT_TAB_PERMISSIONS[tab];
    if (!required?.length) return true;
    return required.some((perm) => hasPermission(perm));
  };

  const visibleTabs = useMemo(
    () =>
      [
        { key: 'training' as const, label: t('chatbot.tabs.training'), icon: MessageSquare },
        { key: 'settings' as const, label: t('chatbot.tabs.settings'), icon: Settings },
        {
          key: 'integrations' as const,
          label: t('chatbot.tabs.integrationsCompact'),
          icon: Code2,
        },
      ].filter((tab) => canViewTab(tab.key)),
    [hasPermission, t],
  );

  useEffect(() => {
    const requestedTab = peekChatbotPrimaryTabRequest();
    const requestedSection = peekChatbotSettingsSectionRequest();
    if (requestedTab && canViewTab(requestedTab)) {
      setPrimaryTab(requestedTab);
      clearChatbotPrimaryTabRequest();
    }
    if (requestedSection) {
      setSettingsSection(requestedSection);
      clearChatbotSettingsSectionRequest();
    }
  }, [hasPermission, setPrimaryTab, setSettingsSection, visibleTabs]);

  useEffect(() => {
    if (visibleTabs.length === 0) return;
    if (!visibleTabs.some((tab) => tab.key === primaryTab)) {
      setPrimaryTab(visibleTabs[0].key);
    }
  }, [primaryTab, setPrimaryTab, visibleTabs]);

  const { isWeb, isCompact, contentMaxWidth, horizontalPadding } = useChatbotConfigLayout();
  const resolvedHorizontalPadding = horizontalPadding ?? spacing.sm;

  const showSkeleton = loading;
  const showErrorOnly = Boolean(error) && !showSkeleton;

  const tabRadius = surfaceRadius.button;

  const header = (
    <View style={[styles.headerStack, { gap: spacing.xs }]}>
      <WidgetsHeader active="chatbot-config" compact={isCompact} />
      <View style={[styles.primaryTabRow, { gap: spacing.xs }]}>
        {visibleTabs.map((tab) => {
          const active = primaryTab === tab.key;
          const Icon = tab.icon;
          return (
            <Pressable
              key={tab.key}
              accessibilityRole="tab"
              accessibilityState={{ selected: active }}
              accessibilityLabel={t('chatbot.primaryTab.a11y', { label: tab.label })}
              onPress={() => setPrimaryTab(tab.key)}
              style={({ pressed, hovered }) => {
                const chrome = getWebParityTabStyle({
                  active,
                  pressed,
                  hovered,
                  colors,
                  surfaceRadius,
                  brandRadius: tabRadius,
                  useWebParity: isWebParitySurfaces,
                  colorMode: mode,
                });
                return [
                  styles.primaryTabBtn,
                  getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                  {
                    paddingHorizontal: spacing.sm,
                    gap: spacing.xs,
                  },
                ];
              }}>
              <Icon
                size={14}
                color={
                  getWebParityTabStyle({
                    active,
                    pressed: false,
                    colors,
                    surfaceRadius,
                    brandRadius: tabRadius,
                    useWebParity: isWebParitySurfaces,
                    colorMode: mode,
                  }).textColor
                }
              />
              <Text
                style={[
                  typography.caption,
                  getWebParityTabLabelStyle(
                    getWebParityTabStyle({
                      active,
                      pressed: false,
                      colors,
                      surfaceRadius,
                      brandRadius: tabRadius,
                      useWebParity: isWebParitySurfaces,
                      colorMode: mode,
                    }).textColor,
                    typography.caption,
                  ),
                ]}>
                {tab.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        key={navigationKey}
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={resolvedHorizontalPadding}
        topPadding={isWeb ? spacing.md + spacing.xs : spacing.sm}
        bottomPaddingExtra={Platform.OS === 'web' ? 0 : 56}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        stickyHeaderDivider
        stickyHeaderBottomPadding={spacing.xs}
        stickyContentTopPadding={spacing.sm}
        header={header}>
        {showSkeleton ? (
          <ChatbotConfigSkeleton />
        ) : showErrorOnly ? (
          <StatePanel error={error} onRetry={() => void refresh()}>
            {null}
          </StatePanel>
        ) : (
          <>
            {primaryTab === 'training' && canViewTab('training') ? <TrainingPanel /> : null}
            {primaryTab === 'settings' && canViewTab('settings') ? <SettingsPanel /> : null}
            {primaryTab === 'integrations' && canViewTab('integrations') ? <IntegrationsScriptsPanel /> : null}
          </>
        )}
      </FeatureScreenScroll>

      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
    </View>
  );
}

export function ChatbotConfigScreen() {
  return <ChatbotConfigContent />;
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  headerStack: { width: '100%' },
  primaryTabRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  primaryTabBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
});
