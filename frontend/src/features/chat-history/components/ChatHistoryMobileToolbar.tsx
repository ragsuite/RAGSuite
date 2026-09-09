import React from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { HistoryKindTabs } from '@/features/chat-history/components/HistoryKindTabs';
import type { HistoryKind } from '@/features/chat-history/types/chat-history.types';
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

export function ChatHistoryMobileToolbar({
  kind,
  onKindChange,
  query,
  onQueryChange,
  refreshing = false,
  onRefresh,
  exportDisabled,
  onExport,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const searchAutofillProps = useSearchFilterInputProps();

  return (
    <View style={[styles.stack, { gap: spacing.sm }]}>
      <HistoryKindTabs active={kind} onChange={onKindChange} />
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
            {...searchAutofillProps}
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
