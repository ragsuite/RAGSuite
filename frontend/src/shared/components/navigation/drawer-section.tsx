import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { isDrawerItemActive, type AppRouteName } from '@/config/navigation';
import type { LocalizedDrawerNavItem, LocalizedDrawerNavSection } from '@/i18n/use-localized-navigation';
import { DrawerItem } from '@/shared/components/navigation/drawer-item';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  section: LocalizedDrawerNavSection;
  activeRoute: AppRouteName;
  onSelect: (item: LocalizedDrawerNavItem) => void;
  onPrimaryBackground?: boolean;
  onNeutralSidebar?: boolean;
};

export function DrawerSection({
  section,
  activeRoute,
  onSelect,
  onPrimaryBackground = false,
  onNeutralSidebar = true,
}: Props) {
  const { colors, spacing, typography } = useAppTheme();

  return (
    <View style={[styles.section, { gap: spacing.xs, paddingHorizontal: spacing.xxs }]}>
      <Text style={[typography.eyebrow, styles.title, { color: colors.textSoft }]}>{section.title}</Text>
      <View style={{ gap: spacing.xxs }}>
        {section.items.map((item) => (
          <DrawerItem
            key={item.route}
            label={item.label}
            icon={item.icon}
            isActive={isDrawerItemActive(item, activeRoute)}
            enterpriseLocked={item.enterpriseLocked}
            onPress={() => onSelect(item)}
            onPrimaryBackground={onPrimaryBackground}
            onNeutralSidebar={onNeutralSidebar}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    width: '100%',
  },
  title: {
    fontSize: 11,
    paddingHorizontal: 4,
  },
});
