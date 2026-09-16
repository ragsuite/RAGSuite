import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { HistoryKindTabs } from '@/features/chat-history/components/HistoryKindTabs';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
import {
  CHAT_HISTORY_WEB_TOOLBAR_HEIGHT,
  useChatHistoryLayout,
} from '@/features/chat-history/utils/chat-history-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { ListTimeRangeMenu } from '@/shared/components/list-time-range-menu';
import { ActionIcons } from '@/shared/constants/action-icons';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import type { ListTimeRange } from '@/shared/utils/list-time-range';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { useSearchFilterInputProps } from '@/shared/utils/search-input-autofill';

type Props = {
  kind: HistoryKind;
  onKindChange: (kind: HistoryKind) => void;
  query: string;
  onQueryChange: (value: string) => void;
  timeRange: ListTimeRange;
  onTimeRangeChange: (value: ListTimeRange) => void;
  refreshing?: boolean;
  onRefresh: () => void;
  exportDisabled?: boolean;
  onExport: (format: 'csv' | 'json') => void;
};

export function ChatHistoryWebToolbar({
  kind,
  onKindChange,
  query,
  onQueryChange,
  timeRange,
  onTimeRangeChange,
  refreshing = false,
  onRefresh,
  exportDisabled,
  onExport,
}: Props) {
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const controlRadius = surfaceRadius.input;
  const { t } = useTranslation();
  const { isToolbarStacked } = useChatHistoryLayout();
  const [focused, setFocused] = useState(false);
  const searchAutofillProps = useSearchFilterInputProps({
    onFocus: () => setFocused(true),
    onBlur: () => setFocused(false),
  });
  const controlHeight = CHAT_HISTORY_WEB_TOOLBAR_HEIGHT;

  const kindTabs = (
    <HistoryKindTabs active={kind} onChange={onKindChange} controlHeight={controlHeight} />
  );

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchWrapStacked : styles.searchWrapInline,
        {
          height: controlHeight,
          minHeight: controlHeight,
          borderColor: focused ? colors.primary : colors.border,
          borderRadius: controlRadius,
          backgroundColor: colors.surface,
          paddingHorizontal: spacing.sm,
        },
      ]}>
      <Search size={16} color={focused ? colors.primary : colors.textMuted} />
      <TextInput
        {...searchAutofillProps}
        accessibilityLabel={t('history.searchPlaceholder')}
        placeholder={t('history.searchPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={onQueryChange}
        returnKeyType="search"
        clearButtonMode="while-editing"
        style={[
          getToolbarSearchInputStyle(typography.body, controlHeight),
          styles.searchInput,
          { color: colors.text },
        ]}
      />
    </View>
  );

  const timeRangeControl = (
    <ListTimeRangeMenu
      timeRange={timeRange}
      onTimeRangeChange={onTimeRangeChange}
      fullWidth={isToolbarStacked}
      controlHeight={controlHeight}
    />
  );

  const actions = (
    <View
      style={[
        styles.actions,
        isToolbarStacked ? styles.actionsStacked : styles.actionsInline,
        { gap: spacing.sm, height: controlHeight },
      ]}>
      {isToolbarStacked ? null : timeRangeControl}
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
      <ChatHistoryExportMenu
        disabled={exportDisabled}
        onExport={onExport}
        controlHeight={controlHeight}
      />
    </View>
  );

  if (isToolbarStacked) {
    return (
      <View style={[styles.stack, { gap: spacing.sm }]}>
        {kindTabs}
        {searchField}
        {timeRangeControl}
        {actions}
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm, minHeight: controlHeight }]}>
      {kindTabs}
      {searchField}
      {actions}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    width: '100%',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  searchWrapInline: {
    flex: 1,
    minWidth: 0,
  },
  searchWrapStacked: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
  },
  actionsInline: {},
  actionsStacked: {
    width: '100%',
    justifyContent: 'flex-end',
  },
});
