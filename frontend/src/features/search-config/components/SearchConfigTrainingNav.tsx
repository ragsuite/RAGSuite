import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LayoutList, MessageSquare, Settings } from 'lucide-react-native';

import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import type { TrainingSubTab } from '@/features/search-config/types/search-config.types';
import { getSearchConfigNav } from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import { NavGroupLabel } from '@/shared/components/brand';
import { CONFIG_SIDEBAR_WIDTH } from '@/shared/constants/layout';
import { getWebParityNavItemStyle, getWebParityNavPressableStyle, getWebParityTabLabelStyle } from '@/shared/components/surfaces/web-parity-tab-styles';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { webSticky } from '@/shared/utils/web-sticky';

const TRAINING_ICONS: Record<TrainingSubTab, React.ComponentType<{ size?: number; color?: string }>> = {
  overview: LayoutList,
  'active-config': Settings,
  history: MessageSquare,
};

export function SearchConfigTrainingNav() {
  const { t } = useTranslation();
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const { trainingSubTab, setTrainingSubTab } = useSearchConfig();
  const { TRAINING_SUB_TABS } = getSearchConfigNav(t);

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
        },
      ]}
      accessibilityRole="tablist"
      accessibilityLabel="Training sections">
      <NavGroupLabel
        style={{ paddingHorizontal: spacing.xs, paddingTop: spacing.xxs, paddingBottom: spacing.xxs }}>
        {t('search.training.title')}
      </NavGroupLabel>
      {TRAINING_SUB_TABS.map((tab) => {
        const active = trainingSubTab === tab.key;
        const Icon = TRAINING_ICONS[tab.key];
        return (
          <Pressable
            key={tab.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={tab.label}
            onPress={() => setTrainingSubTab(tab.key)}
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
            <Icon size={16} color={isWebParitySurfaces ? colors.text : active ? colors.primary : colors.textMuted} />
            <Text
              style={[
                typography.body,
                styles.itemLabel,
                getWebParityTabLabelStyle(
                  isWebParitySurfaces ? colors.text : active ? colors.primary : colors.text,
                  typography.body,
                  { fontSize: 14 },
                ),
              ]}>
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  nav: { width: CONFIG_SIDEBAR_WIDTH, flexShrink: 0, borderWidth: 1, gap: 2 },
  item: { flexDirection: 'row', alignItems: 'center' },
  itemLabel: { flex: 1 },
});

