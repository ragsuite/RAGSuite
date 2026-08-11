import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
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

export function ChatHistoryMobileToolbar({ query, onQueryChange, exportDisabled, onExport }: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();

  return (
    <View style={[styles.row, { gap: spacing.sm }]}>
      <View
        style={[
          styles.searchWrap,
          {
            borderRadius: surfaceRadius.input,
            borderColor: colors.border,
            backgroundColor: colors.surface,
            paddingHorizontal: spacing.sm,
          },
        ]}>
        <Search size={16} color={colors.textMuted} />
        <TextInput
          {...searchInputAutofillProps}
          accessibilityLabel={t('history.searchPlaceholder')}
          placeholder={t('history.searchPlaceholder')}
          placeholderTextColor={colors.textMuted}
          value={query}
          onChangeText={onQueryChange}
          autoCapitalize="none"
          returnKeyType="search"
          style={[
            getToolbarSearchInputStyle(typography.body, APP_CHROME_CONTROL_HEIGHT),
            styles.searchInput,
            { color: colors.text },
          ]}
        />
      </View>
      <ChatHistoryExportMenu disabled={exportDisabled} onExport={onExport} />
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
    height: APP_CHROME_CONTROL_HEIGHT,
    minHeight: APP_CHROME_CONTROL_HEIGHT,
  },
  searchInput: {
    flex: 1,
  },
});
