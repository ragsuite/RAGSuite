import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useProjectsLayout } from '@/features/projects/utils/projects-layout';
import { useTranslation } from '@/i18n';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { AppButton } from '@/shared/components/app-button';
import { focusFieldShellStyle, focusRingStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  activeFilterCount: number;
  onOpenFilters: () => void;
  onCreate: () => void;
  canCreate?: boolean;
};

export function ProjectsMobileToolbar({
  query,
  onQueryChange,
  activeFilterCount,
  onOpenFilters,
  onCreate,
  canCreate = true,
}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { isNativeMobile, isToolbarCompact } = useProjectsLayout();
  const [focused, setFocused] = useState(false);
  const isFiltered = activeFilterCount > 0;
  const controlHeight = isNativeMobile ? TOUCH_TARGET_MIN : 40;
  /** Native app: icon-only create. Narrow web compact toolbar also icon-only. */
  const createIconOnly = isNativeMobile || isToolbarCompact;

  return (
    <View style={[styles.row, { gap: spacing.xs, width: '100%' }]}>
      <View
        style={[
          styles.searchWrap,
          {
            height: controlHeight,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
            ...focusFieldShellStyle(focused, colors.primary, colors.border),
          },
        ]}>
        <Search size={16} color={focused ? colors.primary : colors.textMuted} />
        <TextInput
          {...searchInputAutofillProps}
          accessibilityLabel={t('projects.search.placeholder')}
          placeholder={t('projects.search.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          returnKeyType="search"
          clearButtonMode="while-editing"
          style={[
            getToolbarSearchInputStyle(typography.body, controlHeight),
            styles.searchInput,
            { color: colors.text },
            Platform.OS === 'web' ? styles.searchInputWeb : null,
            webSuppressInputOutline(),
            Platform.OS === 'android' ? styles.searchInputAndroid : null,
          ]}
        />
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={
          isFiltered
            ? `${t('common.filter')} (${activeFilterCount})`
            : t('common.filter')
        }
        onPress={onOpenFilters}
        style={({ pressed, focused }) => [
          styles.iconBtn,
          {
            width: controlHeight,
            height: controlHeight,
            borderRadius: surfaceRadius.button,
            borderColor: isFiltered ? colors.primary : colors.border,
            backgroundColor: pressed ? colors.surfaceMuted : colors.surface,
          },
          focusRingStyle(focused, colors.primary),
        ]}>
        <ActionIcons.filter size={18} color={isFiltered ? colors.primary : colors.text} />
      </Pressable>

      {canCreate ? (
        <AppButton
          label={t('projects.actions.create')}
          icon={ActionIcons.add}
          iconOnly={createIconOnly}
          variant="cta"
          size={isNativeMobile ? 'compact' : 'dense'}
          onPress={onCreate}
        />
      ) : null}
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
    minWidth: 0,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    paddingVertical: 0,
    marginVertical: 0,
  },
  searchInputWeb: {
    outlineStyle: 'none',
    outlineWidth: 0,
  } as object,
  searchInputAndroid: {
    textAlignVertical: 'center',
  },
  iconBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    flexShrink: 0,
  },
});
