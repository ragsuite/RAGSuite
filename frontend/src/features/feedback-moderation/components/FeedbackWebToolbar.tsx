import { Search } from 'lucide-react-native';
import React, { useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import { HistoryKindTabs } from '@/features/chat-history/components/HistoryKindTabs';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
import { FeedbackExportMenu } from '@/features/feedback-moderation/components/FeedbackExportMenu';
import { FeedbackVoteFilterMenu } from '@/features/feedback-moderation/components/FeedbackVoteFilterMenu';
import type { FeedbackVoteFilter } from '@/features/feedback-moderation/types/feedback-moderation.types';
import {
  FEEDBACK_WEB_FILTER_WIDTH,
  FEEDBACK_WEB_TOOLBAR_HEIGHT,
  useFeedbackLayout,
} from '@/features/feedback-moderation/utils/feedback-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { ListTimeRangeMenu } from '@/shared/components/list-time-range-menu';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { ListTimeRange } from '@/shared/utils/list-time-range';
import { focusFieldShellStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  kind: HistoryKind;
  onKindChange: (kind: HistoryKind) => void;
  query: string;
  onQueryChange: (value: string) => void;
  voteFilter: FeedbackVoteFilter;
  onVoteFilterChange: (value: FeedbackVoteFilter) => void;
  timeRange: ListTimeRange;
  onTimeRangeChange: (value: ListTimeRange) => void;
  refreshing?: boolean;
  onRefresh: () => void;
  exportDisabled?: boolean;
  exporting?: boolean;
  onExport: (format: 'csv' | 'json') => void;
};

export function FeedbackWebToolbar({
  kind,
  onKindChange,
  query,
  onQueryChange,
  voteFilter,
  onVoteFilterChange,
  timeRange,
  onTimeRangeChange,
  refreshing = false,
  onRefresh,
  exportDisabled,
  exporting,
  onExport,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const { isToolbarStacked } = useFeedbackLayout();
  const [focused, setFocused] = useState(false);

  const controlHeight = FEEDBACK_WEB_TOOLBAR_HEIGHT;
  const kindTabs = (
    <HistoryKindTabs active={kind} onChange={onKindChange} controlHeight={controlHeight} />
  );

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchStacked : styles.searchInline,
        {
          height: controlHeight,
          minHeight: controlHeight,
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

  const filterControls = (
    <>
      <ListTimeRangeMenu
        timeRange={timeRange}
        onTimeRangeChange={onTimeRangeChange}
        fullWidth={isToolbarStacked}
        controlHeight={controlHeight}
        inlineMinWidth={FEEDBACK_WEB_FILTER_WIDTH}
      />
      <FeedbackVoteFilterMenu
        value={voteFilter}
        onChange={onVoteFilterChange}
        fullWidth={isToolbarStacked}
        controlHeight={controlHeight}
        triggerWidth={FEEDBACK_WEB_FILTER_WIDTH}
      />
    </>
  );

  const actionControls = (
    <>
      <AppButton
        label={t('common.retry')}
        accessibilityLabel={t('common.retry')}
        iconOnly
        icon={ActionIcons.refresh}
        variant="outline"
        size="compact"
        loading={refreshing}
        onPress={onRefresh}
      />
      <FeedbackExportMenu
        disabled={exportDisabled}
        exporting={exporting}
        onExport={onExport}
        controlHeight={controlHeight}
      />
    </>
  );

  if (isToolbarStacked) {
    return (
      <View style={[styles.stack, { gap: spacing.sm }]}>
        {kindTabs}
        {searchField}
        <View style={[styles.filtersStacked, { gap: spacing.sm }]}>{filterControls}</View>
        <View style={[styles.actions, styles.actionsStacked, { gap: spacing.sm, height: controlHeight }]}>
          {actionControls}
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm, minHeight: controlHeight }]}>
      {kindTabs}
      {searchField}
      <View style={[styles.filtersInline, { gap: spacing.sm, height: controlHeight }]}>
        {filterControls}
      </View>
      <View style={[styles.actions, { gap: spacing.sm, height: controlHeight }]}>
        {actionControls}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
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
  filtersInline: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  filtersStacked: {
    width: '100%',
  },
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
