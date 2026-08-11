import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Cpu, FileText, Globe, LayoutDashboard, LayoutTemplate, Palette, Search, Code2, FlaskConical } from 'lucide-react-native';

import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { SettingsSection } from '@/features/search-config/types/search-config.types';
import { getSearchConfigNav } from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { CONFIG_SIDEBAR_WIDTH } from '@/shared/constants/layout';
import { getWebParityNavItemStyle, getWebParityNavPressableStyle, getWebParityTabLabelStyle } from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSticky } from '@/shared/utils/web-sticky';
import { ActionIcons } from '@/shared/constants/action-icons';

const SECTION_ICONS: Record<SettingsSection, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutDashboard,
  model: Cpu,
  domains: Globe,
  citation: FileText,
  'search-box': Search,
  'search-customization': Palette,
  predefined: ActionIcons.help,
  integrations: Code2,
  'search-test': FlaskConical,
};

export function SearchConfigSettingsNav() {
  const { t } = useTranslation();
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const { settingsSection, setSettingsSection } = useSearchConfig();
  const { SETTINGS_NAV_SECTIONS, SETTINGS_SECTION_META } = getSearchConfigNav(t);

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
      accessibilityLabel="Settings sections">
      <View style={{ gap: spacing.xxs }}>
        <NavGroupLabel style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.xxs }}>
          {t('search.settings.title')}
        </NavGroupLabel>
        {SETTINGS_NAV_SECTIONS.map((section: SettingsSection) => {
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
              accessibilityLabel={`${meta.navTitle ?? meta.title} settings`}
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
                ]}
                numberOfLines={1}>
                {meta.navTitle ?? meta.title}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { width: CONFIG_SIDEBAR_WIDTH, flexShrink: 0, borderWidth: 1 },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemLabel: { flex: 1 },
});
