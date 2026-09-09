import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { HistoryKindTabs } from '@/features/chat-history/components/HistoryKindTabs';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
import { useChatHistoryLayout } from '@/features/chat-history/utils/chat-history-layout';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { ActionIcons } from '@/shared/constants/action-icons';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { useSearchFilterInputProps } from '@/shared/utils/search-input-autofill';

type Props = {
  kind: HistoryKind;
  onKindChange: (kind: HistoryKind) => void;
  query: string;
  onQueryChange: (value: string) => void;
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

  const kindTabs = <HistoryKindTabs active={kind} onChange={onKindChange} />;

  const searchField = (
    <View
      style={[
        styles.searchWrap,
        isToolbarStacked ? styles.searchWrapStacked : styles.searchWrapInline,
        {
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
          getToolbarSearchInputStyle(typography.body, APP_CHROME_CONTROL_HEIGHT),
          styles.searchInput,
          { color: colors.text },
        ]}
      />
    </View>
  );

  const actions = (
    <View
      style={[
        styles.actions,
        isToolbarStacked ? styles.actionsStacked : styles.actionsInline,
        { gap: spacing.sm },
      ]}>
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
      <ChatHistoryExportMenu disabled={exportDisabled} onExport={onExport} />
    </View>
  );

  if (isToolbarStacked) {
    return (
      <View style={[styles.stack, { gap: spacing.sm }]}>
        {kindTabs}
        {searchField}
        {actions}
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {kindTabs}
      {searchField}
      {actions}
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
    height: APP_CHROME_CONTROL_HEIGHT,
    minHeight: APP_CHROME_CONTROL_HEIGHT,
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
    minWidth: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  actionsInline: {
    flexShrink: 0,
  },
  actionsStacked: {
    alignSelf: 'flex-end',
  },
});
