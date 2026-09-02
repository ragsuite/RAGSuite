import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Code2, Cpu, Globe, LayoutDashboard, Palette, Search, Shield, ThumbsUp } from 'lucide-react-native';

import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import type { SettingsSection } from '@/features/chatbot-config/types/chatbot-config.types';
import { getChatbotConfigNav } from '@/features/chatbot-config/utils/chatbot-config-nav';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { CONFIG_SIDEBAR_WIDTH } from '@/shared/constants/layout';
import { getWebParityNavItemStyle, getWebParityNavPressableStyle, getWebParityTabLabelStyle } from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSticky } from '@/shared/utils/web-sticky';

const SECTION_ICONS: Record<SettingsSection, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutDashboard,
  model: Cpu,
  'widget-config': Search,
  'widget-customization': Palette,
  domains: Globe,
  privacy: Shield,
  feedback: ThumbsUp,
  integrations: Code2,
  'web-integration': Code2,
  'mobile-integration': Code2,
};

export function ChatbotConfigSettingsNav() {
  const { t } = useTranslation();
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const { settingsSection, setSettingsSection } = useChatbotConfig();
  const { SETTINGS_NAV_GROUPS, SETTINGS_SECTION_META } = getChatbotConfigNav(t);

  return (
    <View
      style={[
        styles.nav,
        webSticky(12),
        {
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
          backgroundColor: colors.surface,
          padding: spacing.xs,
          gap: spacing.sm,
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Chatbot settings sections">
      {SETTINGS_NAV_GROUPS.map((group) => (
        <View key={group.label} style={{ gap: spacing.xxs }}>
          <NavGroupLabel style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.xxs }}>
            {group.label}
          </NavGroupLabel>
          {group.sections.map((section) => {
            const active = settingsSection === section;
            const meta = SETTINGS_SECTION_META[section];
            const Icon = SECTION_ICONS[section];
            const textColor = isWebParitySurfaces
              ? getWebParityNavItemStyle({
                  active,
                  pressed: false,
                  colors,
                  surfaceRadius,
                  brandRadius: radius.sm,
                  useWebParity: true,
                }).textColor
              : active
                ? colors.primary
                : colors.text;
            const iconColor = isWebParitySurfaces ? textColor : active ? colors.primary : colors.textMuted;
            return (
              <Pressable
                key={section}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`${meta.title} settings`}
                onPress={() => setSettingsSection(section)}
                style={({ pressed, hovered }) => {
                  const chrome = getWebParityNavItemStyle({
                    active,
                    pressed,
                    hovered,
                    colors,
                    surfaceRadius,
                    brandRadius: radius.sm,
                    useWebParity: isWebParitySurfaces,
                  });
                  return [
                  styles.item,
                  getWebParityNavPressableStyle(chrome),
                  {
                    paddingHorizontal: spacing.sm,
                    gap: spacing.xs,
                  },
                ];
                }}>
                <Icon size={16} color={iconColor} />
                <Text
                  style={[
                    typography.body,
                    styles.itemLabel,
                    getWebParityTabLabelStyle(textColor, typography.body, { fontSize: 14 }),
                  ]}>
                  {meta.title}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { width: CONFIG_SIDEBAR_WIDTH, flexShrink: 0, borderWidth: 1 },
  item: { flexDirection: 'row', alignItems: 'center' },
  itemLabel: { flex: 1 },
});
