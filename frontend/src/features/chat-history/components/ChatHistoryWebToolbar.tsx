import React, { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { useChatHistoryLayout } from '@/features/chat-history/utils/chat-history-layout';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type Props = {
  query: string;
  onQueryChange: (value: string) => void;
  exportDisabled?: boolean;
  onExport: (format: 'csv' | 'json') => void;
};

export function ChatHistoryWebToolbar({ query, onQueryChange, exportDisabled, onExport }: Props) {
  const { colors, spacing, surfaceRadius, isWebParitySurfaces, typography } = useAppTheme();
  const controlRadius = surfaceRadius.input;
  const { t } = useTranslation();
  const { isToolbarStacked } = useChatHistoryLayout();
  const [focused, setFocused] = useState(false);

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
        {...searchInputAutofillProps}
        accessibilityLabel={t('history.searchPlaceholder')}
        placeholder={t('history.searchPlaceholder')}
        placeholderTextColor={colors.textMuted}
        value={query}
        onChangeText={onQueryChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
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

  const exportButton = (
    <View style={isToolbarStacked ? styles.exportStacked : styles.exportInline}>
      <ChatHistoryExportMenu disabled={exportDisabled} onExport={onExport} />
    </View>
  );

  if (isToolbarStacked) {
    return (
      <View style={[styles.stack, { gap: spacing.sm }]}>
        {searchField}
        {exportButton}
      </View>
    );
  }

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      {searchField}
      {exportButton}
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
  exportInline: {
    flexShrink: 0,
  },
  exportStacked: {
    alignSelf: 'flex-end',
  },
});
