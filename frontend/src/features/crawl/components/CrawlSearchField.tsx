import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { CRAWL_MOBILE_TOUCH_MIN, useCrawlCompactLayout } from '@/features/crawl/utils/crawl-mobile';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  accessibilityLabel: string;
  onSubmitEditing?: () => void;
};

export function CrawlSearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  onSubmitEditing,
}: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const controlRadius = surfaceRadius.input;
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const isCompact = useCrawlCompactLayout();
  const controlHeight = isCompact ? CRAWL_MOBILE_TOUCH_MIN : TOOLBAR_CONTROL_HEIGHT;

  return (
    <View
      style={[
        styles.wrap,
        {
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: controlRadius,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.sm,
          gap: spacing.xs,
          minHeight: controlHeight,
          height: controlHeight,
        },
      ]}>
      <View accessible={false}>
        <ActionIcons.search size={16} color={focused ? colors.primary : colors.textMuted} />
      </View>
      <TextInput
        {...searchInputAutofillProps}
        accessibilityLabel={accessibilityLabel}
        accessibilityHint={t('crawl.search.filterHint')}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onSubmitEditing={onSubmitEditing}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          getToolbarSearchInputStyle(typography.body, controlHeight),
          styles.input,
          { color: colors.text },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderWidth: 1,
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  input: {
    flex: 1,
  },
});
