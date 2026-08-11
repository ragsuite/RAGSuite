import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { FeedbackExportMenu } from '@/features/feedback-moderation/components/FeedbackExportMenu';
import { FeedbackVoteFilterMenu } from '@/features/feedback-moderation/components/FeedbackVoteFilterMenu';
import type { FeedbackVoteFilter } from '@/features/feedback-moderation/types/feedback-moderation.types';
import {
  FEEDBACK_WEB_FILTER_WIDTH,
  FEEDBACK_WEB_TOOLBAR_HEIGHT,
  useFeedbackLayout,
} from '@/features/feedback-moderation/utils/feedback-layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { focusFieldShellStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
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

export function FeedbackWebToolbar({
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
  const { isToolbarStacked } = useFeedbackLayout();
  const [focused, setFocused] = useState(false);

  const controlHeight = FEEDBACK_WEB_TOOLBAR_HEIGHT;

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchStacked : styles.searchInline,
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
          getToolbarSearchInputStyle(typography.body, controlHeight),
          styles.searchInput,
          { color: colors.text },
          Platform.OS === 'web' ? styles.searchInputWeb : null,
          webSuppressInputOutline(),
        ]}
      />
    </View>
  );

  const actions = (
    <View style={[styles.actions, isToolbarStacked ? styles.actionsStacked : null, { gap: spacing.sm }]}>
      <FeedbackVoteFilterMenu
        value={voteFilter}
        onChange={onVoteFilterChange}
        controlHeight={controlHeight}
        triggerWidth={FEEDBACK_WEB_FILTER_WIDTH}
      />
      <FeedbackExportMenu
        disabled={exportDisabled}
        exporting={exporting}
        onExport={onExport}
        controlHeight={controlHeight}
        showLabel
      />
    </View>
  );

  const inner = isToolbarStacked ? (
    <View style={[styles.stack, { gap: spacing.sm }]}>
      {searchField}
      {actions}
    </View>
  ) : (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {searchField}
      {actions}
    </View>
  );

  return <View style={styles.flatShell}>{inner}</View>;
}

const styles = StyleSheet.create({
  flatShell: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  stack: {
    width: '100%',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
    minWidth: 0,
  },
  searchInline: {
    flex: 1,
  },
  searchStacked: {
    width: '100%',
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
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionsStacked: {
    width: '100%',
    justifyContent: 'flex-end',
  },
});
