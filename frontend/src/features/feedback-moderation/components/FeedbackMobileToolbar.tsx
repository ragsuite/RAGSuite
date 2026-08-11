import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { FeedbackExportMenu } from '@/features/feedback-moderation/components/FeedbackExportMenu';
import { FeedbackVoteFilterMenu } from '@/features/feedback-moderation/components/FeedbackVoteFilterMenu';
import type { FeedbackVoteFilter } from '@/features/feedback-moderation/types/feedback-moderation.types';
import { useTranslation } from '@/i18n';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  voteFilter: FeedbackVoteFilter;
  onVoteFilterChange: (value: FeedbackVoteFilter) => void;
  exportDisabled?: boolean;
  exporting?: boolean;
  onExport: (format: 'csv' | 'json') => void;
};

export function FeedbackMobileToolbar({
  query,
  onQueryChange,
  voteFilter,
  onVoteFilterChange,
  exportDisabled,
  exporting,
  onExport,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
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
          accessibilityLabel={t('feedbackModeration.searchPlaceholder')}
          placeholder={t('feedbackModeration.searchPlaceholder')}
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
      <FeedbackVoteFilterMenu value={voteFilter} onChange={onVoteFilterChange} iconOnly />
      <FeedbackExportMenu disabled={exportDisabled} exporting={exporting} onExport={onExport} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
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
    paddingVertical: 0,
    marginVertical: 0,
  },
  searchInputAndroid: {
    textAlignVertical: 'center',
  },
});
