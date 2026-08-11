import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { SEARCH_CONFIG_TOUCH_MIN } from '@/features/search-config/utils/search-config-mobile';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  selectAllDisabled?: boolean;
};

export function SearchHistoryMobileToolbar({
  search,
  onSearchChange,
  onOpenFilters,
  activeFilterCount,
  allSelected,
  onToggleSelectAll,
  selectAllDisabled}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <View
          style={[
            styles.searchWrap,
            {
              borderRadius: surfaceRadius.input,
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              paddingHorizontal: spacing.sm},
          ]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            {...searchInputAutofillProps}
            accessibilityLabel={t('search.history.search.a11y')}
            placeholder={t('search.history.search.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            returnKeyType="search"
            style={[getToolbarSearchInputStyle(typography.body), styles.searchInput, { color: colors.text }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0
              ? t('search.history.filtersActive', { count: activeFilterCount })
              : t('search.history.filters')
          }
          onPress={onOpenFilters}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              borderRadius: surfaceRadius.button,
              borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface},
          ]}>
          <ActionIcons.filter size={18} color={activeFilterCount > 0 ? colors.primary : colors.text} />
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: allSelected, disabled: selectAllDisabled }}
        accessibilityLabel={t('search.history.selectAllVisible')}
        disabled={selectAllDisabled}
        onPress={onToggleSelectAll}
        style={({ pressed }) => [
          styles.selectAll,
          {
            minHeight: SEARCH_CONFIG_TOUCH_MIN,
            opacity: selectAllDisabled ? 0.5 : pressed ? 0.85 : 1},
        ]}>
        <AppCheckboxMark checked={allSelected} />
        <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
          {t('search.history.selectAll')}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchWrap: { flex: 1, flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: 8, minHeight: 44 },
  searchInput: { flex: 1 },
  iconBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1},
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
