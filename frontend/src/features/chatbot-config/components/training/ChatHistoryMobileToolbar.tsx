import React from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Search } from 'lucide-react-native';

import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  search: string;
  onSearchChange: (value: string) => void;
  onOpenFilters: () => void;
  activeFilterCount: number;
  visibleCount: number;
  selectedCount: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  selectAllDisabled?: boolean;
  exportDisabled?: boolean;
  onExport?: (format: 'csv' | 'json') => void;
};

export function ChatHistoryMobileToolbar({
  search,
  onSearchChange,
  onOpenFilters,
  activeFilterCount,
  visibleCount,
  selectedCount,
  allSelected,
  onToggleSelectAll,
  selectAllDisabled,
  exportDisabled,
  onExport}: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={styles.row}>
        <View
          style={[
            styles.searchWrap,
            {
              borderRadius: surfaceRadius.input,
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              paddingHorizontal: spacing.sm},
          ]}>
          <Search size={16} color={colors.textMuted} />
          <TextInput
            {...searchInputAutofillProps}
            accessibilityLabel={t('chatbot.history.search.a11y')}
            placeholder={t('chatbot.history.search.placeholder')}
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={onSearchChange}
            autoCapitalize="none"
            returnKeyType="search"
            style={[getToolbarSearchInputStyle(typography.body), styles.searchInput, { color: colors.text }]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={
            activeFilterCount > 0
              ? t('chatbot.history.filtersActive', { count: activeFilterCount })
              : t('chatbot.history.filters')
          }
          accessibilityHint={t('chatbot.history.filtersHint')}
          onPress={onOpenFilters}
          style={({ pressed }) => [
            styles.iconBtn,
            {
              borderRadius: surfaceRadius.button,
              borderColor: activeFilterCount > 0 ? colors.primary : colors.border,
              backgroundColor: pressed ? colors.surfaceMuted : colors.surface},
          ]}>
          <ActionIcons.filter size={18} color={activeFilterCount > 0 ? colors.primary : colors.text} />
          {activeFilterCount > 0 ? (
            <View
              style={[
                styles.badge,
                { backgroundColor: colors.primary, borderRadius: surfaceRadius.button },
              ]}>
              <Text style={[typography.caption, { color: colors.textOnPrimary, fontWeight: '500', fontSize: 10 }]}>
                {activeFilterCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
        {onExport ? <ChatHistoryExportMenu disabled={exportDisabled} onExport={onExport} /> : null}
      </View>

      <View style={[styles.actionsRow, { gap: spacing.sm }]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected, disabled: selectAllDisabled }}
          accessibilityLabel={t('chatbot.history.selectAllVisible')}
          disabled={selectAllDisabled}
          onPress={onToggleSelectAll}
          style={({ pressed }) => [
            styles.selectAll,
            {
              minHeight: CHATBOT_CONFIG_TOUCH_MIN,
              opacity: selectAllDisabled ? 0.5 : pressed ? 0.85 : 1},
          ]}>
          <AppCheckboxMark checked={allSelected} />
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
            {t('chatbot.history.selectAll')}
          </Text>
        </Pressable>
        <Text style={[typography.caption, { color: colors.textMuted, flex: 1, textAlign: 'right' }]}>
          {t(visibleCount === 1 ? 'chatbot.history.conversationCount' : 'chatbot.history.conversationsCount', {
            count: visibleCount})}
          {selectedCount > 0 ? ` · ${t('chatbot.history.selectedCount', { count: selectedCount })}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  actionsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
    minHeight: CHATBOT_CONFIG_TOUCH_MIN},
  searchInput: { flex: 1 },
  iconBtn: {
    width: CHATBOT_CONFIG_TOUCH_MIN,
    height: CHATBOT_CONFIG_TOUCH_MIN,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1},
  badge: {
    position: 'absolute',
    top: 6,
    right: 6,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4},
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
