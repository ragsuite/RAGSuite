import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
};

export function AuditLogsMobileToolbar({ query, onQueryChange, onOpenFilters, activeFilterCount }: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);

  return (
    <View style={[styles.row, { gap: spacing.xs }]}>
      <View
        style={[
          styles.searchWrap,
          {
            borderColor: focused ? colors.primary : colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
            height: TOUCH_TARGET_MIN,
          },
        ]}>
        <Search size={16} color={focused ? colors.primary : colors.textMuted} />
        <TextInput
          {...searchInputAutofillProps}
          accessibilityLabel={t('audit.searchPlaceholder')}
          placeholder={t('audit.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[
            getToolbarSearchInputStyle(typography.body, TOUCH_TARGET_MIN),
            styles.searchInput,
            { color: colors.text },
            Platform.OS === 'android' ? styles.searchInputAndroid : null,
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={activeFilterCount > 0 ? `${t('common.filter')}, ${activeFilterCount}` : t('common.filter')}
        onPress={onOpenFilters}
        style={({ pressed }) => [
          styles.iconBtn,
          {
            borderRadius: surfaceRadius.button,
            borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
            height: TOUCH_TARGET_MIN,
            width: TOUCH_TARGET_MIN,
          },
        ]}>
        <ActionIcons.filter size={18} color={activeFilterCount > 0 ? colors.primary : colors.text} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchWrap: {
    flex: 1,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 0,
    marginVertical: 0,
  },
  searchInputAndroid: {
    textAlignVertical: 'center',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
});
