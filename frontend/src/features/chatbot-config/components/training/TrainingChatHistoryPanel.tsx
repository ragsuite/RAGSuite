import React, { useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useNavigation, useRouter } from 'expo-router';
import { ChevronRight, History, MessageSquare, Search } from 'lucide-react-native';

import { ChatHistoryFilterSheet } from '@/features/chatbot-config/components/training/ChatHistoryFilterSheet';
import { ChatHistoryMobileToolbar } from '@/features/chatbot-config/components/training/ChatHistoryMobileToolbar';
import { ChatHistorySessionDetail } from '@/features/chatbot-config/components/training/ChatHistorySessionDetail';
import { MobileMenuGroup } from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { ChatHistoryExportMenu } from '@/features/chat-history/components/ChatHistoryExportMenu';
import { useChatbotConfig } from '@/features/chatbot-config/hooks/useChatbotConfig';
import { useChatbotConfigLayout } from '@/features/chatbot-config/hooks/useChatbotConfigLayout';
import type { ChatConversation } from '@/features/chatbot-config/types/chatbot-config.types';
import { CHATBOT_CONFIG_TOUCH_MIN } from '@/features/chatbot-config/utils/chatbot-config-mobile';
import {
  chatHistorySessionRoute,
  getChatbotConfigNav,
} from '@/features/chatbot-config/utils/chatbot-config-nav';
import { useTranslation } from '@/i18n';
import {
  formatChatHistoryListDate,
  formatChatHistoryRelativeTime,
} from '@/features/chatbot-config/utils/training-overview-display';
import { AppSelectField } from '@/shared/components/app-select-field';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { AppTextField } from '@/shared/components/app-text-field';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { HistoryCollectionDisabledBanner } from '@/shared/components/history-collection-disabled-banner';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { copyText } from '@/shared/utils/copy-text';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { ActionIcons } from '@/shared/constants/action-icons';

type HistoryLayout = 'auto' | 'list' | 'detail';

type Props = {
  layout?: HistoryLayout;
  sessionId?: string;
};

export function TrainingChatHistoryPanel({ layout = 'auto', sessionId }: Props) {
  const { t } = useTranslation();
  const { HISTORY_TIME_RANGE_OPTIONS } = getChatbotConfigNav(t);
  const { colors, spacing, typography, radius, surfaceRadius } = useAppTheme();
  const { confirm } = useConfirm();
  const router = useRouter();
  const navigation = useNavigation();
  const { showHistorySplit, isCompact } = useChatbotConfigLayout();
  const isListOnly = layout === 'list' || (layout === 'auto' && isCompact);
  const isDetailOnly = layout === 'detail';
  const useSplitLayout = layout === 'auto' && showHistorySplit && !isListOnly;
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);

  const {
    loading,
    bundle,
    filteredConversations,
    selectedConversation,
    selectedSessionId,
    selectedSessionIds,
    historySearch,
    historyTimeRange,
    saving,
    setSelectedSessionId,
    setHistorySearch,
    setHistoryTimeRange,
    toggleSessionSelection,
    selectAllVisibleSessions,
    clearSessionSelection,
    handleDeleteConversation,
    handleDeleteSelectedConversations,
    handleClearChatHistory,
    handleExportChatHistory,
    notify,
  } = useChatbotConfig();

  /** Badge on filter icon — non-default time range only (search is inline on mobile). */
  const activeFilterCount = historyTimeRange !== 'all' ? 1 : 0;
  const isEmpty = !bundle?.conversations?.length;
  const historyCollectionDisabled = bundle?.privacySettings?.storeHistoryEnabled === false;

  useEffect(() => {
    if (!isDetailOnly || !sessionId) return;
    setSelectedSessionId(sessionId);
  }, [isDetailOnly, sessionId, setSelectedSessionId]);

  const detailConversation = useMemo(() => {
    if (!isDetailOnly || !sessionId || !bundle?.conversations) return selectedConversation;
    return bundle.conversations.find((c) => c.sessionId === sessionId) ?? selectedConversation;
  }, [bundle?.conversations, isDetailOnly, selectedConversation, sessionId]);

  const openConversation = (conversation: ChatConversation) => {
    if (isListOnly) {
      router.push(chatHistorySessionRoute(conversation.sessionId));
      return;
    }
    setSelectedSessionId(conversation.sessionId);
  };

  const visibleIds = useMemo(
    () => filteredConversations.map((c) => c.sessionId),
    [filteredConversations],
  );
  const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedSessionIds.includes(id));
  const selectedCount = selectedSessionIds.length;

  useEffect(() => {
    if (isDetailOnly || isListOnly || !useSplitLayout) return;
    if (!filteredConversations.length) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !filteredConversations.some((c) => c.sessionId === selectedSessionId)) {
      setSelectedSessionId(filteredConversations[0].sessionId);
    }
  }, [
    filteredConversations,
    isDetailOnly,
    isListOnly,
    selectedSessionId,
    setSelectedSessionId,
    useSplitLayout,
  ]);

  const handleExport = async (format: 'csv' | 'json') => {
    try {
      const payload = await handleExportChatHistory(format);
      const ok = await copyText(payload);
      notify(
        ok ? `Exported ${format.toUpperCase()} to clipboard.` : 'Export failed.',
        ok ? 'success' : 'error',
      );
    } catch {
      notify(t('errors.export.failed'), 'error');
    }
  };

  const confirmDeleteAll = () => {
    void (async () => {
      const confirmed = await confirm({
        title: t('chatbot.history.confirm.deleteAll.title'),
        message: t('chatbot.history.confirm.deleteAll.message'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('chatbot.history.deleteAll'),
        destructive: true,
      });
      if (!confirmed) return;
      void handleClearChatHistory();
    })();
  };

  const confirmDeleteSelected = () => {
    void (async () => {
      const confirmed = await confirm({
        title: t('chatbot.history.confirm.deleteSelected.title'),
        message: t('chatbot.history.confirm.deleteSelected.message', { count: selectedSessionIds.length }),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;
      void handleDeleteSelectedConversations();
    })();
  };

  const confirmDeleteConversation = (targetSessionId: string, onDeleted?: () => void) => {
    void (async () => {
      const confirmed = await confirm({
        title: t('chatbot.history.confirm.deleteOne.title'),
        message: t('api-keys.delete.fallbackDescription'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;
      await handleDeleteConversation(targetSessionId);
      onDeleted?.();
    })();
  };

  const exportMenu = (
    <ChatHistoryExportMenu
      disabled={loading || saving || historyCollectionDisabled}
      onExport={(format) => void handleExport(format)}
    />
  );

  const deleteAllButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('chatbot.history.deleteAll.a11y')}
      disabled={isEmpty || saving || historyCollectionDisabled}
      onPress={confirmDeleteAll}
      style={({ pressed }) => {
        const disabled = isEmpty || saving;
        return [
          styles.deleteAllBtn,
          {
            minHeight: APP_CHROME_CONTROL_HEIGHT,
            borderRadius: surfaceRadius.button,
            borderColor: disabled ? colors.border : colors.danger,
            backgroundColor: disabled
              ? colors.surface
              : pressed
                ? colors.danger
                : colors.dangerBackground,
            opacity: disabled ? 0.55 : 1,
            paddingHorizontal: spacing.xs,
          },
        ];
      }}>
      {({ pressed }) => {
        const disabled = isEmpty || saving;
        const foreground = disabled ? colors.textMuted : pressed ? colors.textOnPrimary : colors.danger;
        return (
          <>
            <ActionIcons.delete size={15} color={foreground} />
            <Text style={[typography.caption, { color: foreground, fontWeight: '500', fontSize: 12 }]}>
              {t('chatbot.history.deleteAll')}
            </Text>
          </>
        );
      }}
    </Pressable>
  );

  const headerActions = historyCollectionDisabled
    ? null
    : selectedCount > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('chatbot.history.deleteSelected.a11y', { count: selectedCount })}
        disabled={saving}
        onPress={confirmDeleteSelected}
        style={({ pressed }) => [
          styles.deleteAllBtn,
          {
            minHeight: APP_CHROME_CONTROL_HEIGHT,
            borderRadius: surfaceRadius.button,
            backgroundColor: pressed ? colors.danger : colors.dangerBackground,
            opacity: saving ? 0.5 : 1,
            paddingHorizontal: spacing.xs,
          },
        ]}>
        <ActionIcons.delete size={15} color={colors.danger} />
        <Text style={[typography.caption, { color: colors.danger, fontWeight: '500', fontSize: 12 }]}>
          {t('chatbot.history.deleteSelected', { count: selectedCount })}
        </Text>
      </Pressable>
    ) : (
      <View style={styles.historyActions}>
        {exportMenu}
        {deleteAllButton}
      </View>
    );

  useLayoutEffect(() => {
    if (!isListOnly) {
      navigation.setOptions({ headerRight: undefined });
      return;
    }
    navigation.setOptions({
      headerRight: () => (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginRight: spacing.xs }}>
          {!historyCollectionDisabled ? exportMenu : null}
          {!historyCollectionDisabled ? (
          <ChatHistoryHeaderDeleteButton
            disabled={filteredConversations.length === 0 || saving}
            onPress={confirmDeleteAll}
          />
          ) : null}
        </View>
      ),
    });
  }, [filteredConversations.length, isListOnly, navigation, saving, exportMenu, spacing.sm, spacing.xs]);

  useLayoutEffect(() => {
    if (!isDetailOnly) return;
    const title = detailConversation?.title ?? t('chatbot.history.conversationTitle');
    navigation.setOptions({
      title,
      headerRight: detailConversation && !historyCollectionDisabled
        ? () => (
            <ChatHistoryHeaderDeleteButton
              accessibilityLabel={t('chatbot.history.deleteConversationA11y')}
              disabled={saving}
              onPress={() =>
                confirmDeleteConversation(detailConversation.sessionId, () => router.back())
              }
            />
          )
        : undefined,
    });
  }, [detailConversation, isDetailOnly, navigation, router, saving]);

  if (isDetailOnly) {
    return (
      <View style={{ flex: 1 }}>
        <StatePanel
          isEmpty={!detailConversation}
          emptyLabel={t('chatbot.history.conversationNotFound')}
          emptyDescription={t('chatbot.history.conversationNotFoundDescription')}>
          {detailConversation ? (
            <ChatHistorySessionDetail
              conversation={detailConversation}
              fullHeight
              showHeader={false}
              onNotify={notify}
            />
          ) : (
            <MessageSquare size={28} color={colors.textMuted} />
          )}
        </StatePanel>
      </View>
    );
  }

  const sessionCheckbox = (checked: boolean, onPress: () => void, label: string) => (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={8}
      style={styles.checkboxHit}>
      <AppCheckboxMark checked={checked} />
    </Pressable>
  );

  const splitFilters = (
    <View style={[styles.filterHeader, { gap: spacing.xxs, padding: spacing.xxs, borderBottomColor: colors.border }]}>
      <View
        style={[
          styles.searchWrap,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surface,
          },
        ]}>
        <Search size={13} color={colors.textMuted} />
        <TextInput
          {...searchInputAutofillProps}
          accessibilityLabel={t('chatbot.history.search.a11y')}
          placeholder={t('chatbot.history.search.placeholder')}
          placeholderTextColor={colors.textMuted}
          value={historySearch}
          onChangeText={setHistorySearch}
          autoCapitalize="none"
          style={[getToolbarSearchInputStyle(typography.body), styles.searchInput, { color: colors.text }]}
        />
      </View>
      <View style={[styles.filterRow, { gap: spacing.sm }]}>
        <View style={styles.timeRangeWrap}>
          <AppSelectField
            label=""
            accessibilityLabel={t('chatbot.history.timeRange.label')}
            variant="inline"
            pickerTitle={t('chatbot.history.timeRange.label')}
            value={historyTimeRange}
            options={HISTORY_TIME_RANGE_OPTIONS}
            onChange={setHistoryTimeRange}
            controlHeight={APP_CHROME_CONTROL_HEIGHT}
          />
        </View>
        {!historyCollectionDisabled ? (
        <Pressable
          onPress={() => (allSelected ? clearSessionSelection() : selectAllVisibleSessions(visibleIds))}
          style={({ pressed }) => [
            styles.selectAll,
            { opacity: pressed ? 0.85 : 1, minHeight: 32 },
          ]}>
          {sessionCheckbox(
            allSelected,
            () => (allSelected ? clearSessionSelection() : selectAllVisibleSessions(visibleIds)),
            t('chatbot.history.selectAllVisible'),
          )}
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>
            {t('chatbot.history.selectAll')}
          </Text>
        </Pressable>
        ) : null}
      </View>
    </View>
  );

  const stackedFilters = (
    <View style={{ gap: spacing.sm }}>
      <AppTextField
        label={t('chatbot.history.search.a11y')}
        placeholder={t('chatbot.history.search.placeholder')}
        value={historySearch}
        onChangeText={setHistorySearch}
        autoCapitalize="none"
      />
      <View style={styles.filterRow}>
        {!historyCollectionDisabled ? (
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: allSelected }}
          accessibilityLabel={t('chatbot.history.selectAllVisible')}
          onPress={() => (allSelected ? clearSessionSelection() : selectAllVisibleSessions(visibleIds))}
          style={({ pressed }) => [
            styles.selectAll,
            { minHeight: CHATBOT_CONFIG_TOUCH_MIN, opacity: pressed ? 0.8 : 1 },
          ]}>
          {sessionCheckbox(
            allSelected,
            () => (allSelected ? clearSessionSelection() : selectAllVisibleSessions(visibleIds)),
            t('chatbot.history.selectAllVisible'),
          )}
          <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{t('chatbot.history.selectAll')}</Text>
        </Pressable>
        ) : null}
        <View style={styles.timeRangeWrap}>
          <AppSelectField
            label={t('chatbot.history.timeRange.label')}
            variant="field"
            pickerTitle={t('chatbot.history.timeRange.label')}
            value={historyTimeRange}
            options={HISTORY_TIME_RANGE_OPTIONS}
            onChange={setHistoryTimeRange}
          />
        </View>
      </View>
    </View>
  );

  const mobileListControls = isListOnly ? (
    <>
      <ChatHistoryMobileToolbar
        search={historySearch}
        onSearchChange={setHistorySearch}
        onOpenFilters={() => setFilterSheetVisible(true)}
        activeFilterCount={activeFilterCount}
        visibleCount={filteredConversations.length}
        selectedCount={selectedSessionIds.length}
        allSelected={allSelected}
        selectAllDisabled={visibleIds.length === 0}
        exportDisabled={loading || saving}
        onExport={(format) => void handleExport(format)}
        onToggleSelectAll={() =>
          allSelected ? clearSessionSelection() : selectAllVisibleSessions(visibleIds)
        }
      />
      <ChatHistoryFilterSheet
        visible={filterSheetVisible}
        onClose={() => setFilterSheetVisible(false)}
        timeRange={historyTimeRange}
        onTimeRangeChange={setHistoryTimeRange}
      />
      {selectedSessionIds.length > 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('chatbot.history.deleteSelected.a11y', { count: selectedCount })}
          onPress={confirmDeleteSelected}
          style={{ minHeight: CHATBOT_CONFIG_TOUCH_MIN, justifyContent: 'center' }}>
          <Text style={[typography.caption, { color: colors.danger, fontWeight: '500' }]}>
            Delete selected ({selectedSessionIds.length})
          </Text>
        </Pressable>
      ) : null}
    </>
  ) : null;

  const splitBody = useSplitLayout ? (
    <View
      style={[
        styles.splitShell,
        { borderColor: colors.border, borderRadius: surfaceRadius.card, backgroundColor: colors.surface },
      ]}>
      {isEmpty ? (
        <View style={[styles.emptyStateShell, { padding: spacing.md }]}>
          <EmptyStateView
            title={t('chatbot.history.empty')}
            icon={MessageSquare}
            variant="inline"
          />
        </View>
      ) : (
      <View style={styles.splitRow}>
        <View style={[styles.masterPane, { borderRightColor: colors.border }]}>
          {splitFilters}
          <AppScrollView
            style={[styles.sessionList, Platform.OS === 'web' ? styles.sessionListWeb : null]}
            contentContainerStyle={[
              styles.sessionListContent,
              filteredConversations.length === 0 ? styles.sessionListEmpty : null,
            ]}>
            {loading && filteredConversations.length === 0 ? (
              <ChatHistoryListSkeleton count={4} cardLayout />
            ) : filteredConversations.length === 0 ? (
              <EmptyStateView
                title={t('chatbot.history.filterEmpty.title')}
                description={t('chatbot.history.filterEmpty.body')}
                icon={MessageSquare}
                variant="inline"
                compact
              />
            ) : (
              filteredConversations.map((conversation) => (
                <ConversationRow
                  key={conversation.sessionId}
                  conversation={conversation}
                  selected={selectedSessionId === conversation.sessionId}
                  checked={selectedSessionIds.includes(conversation.sessionId)}
                  onSelect={() => openConversation(conversation)}
                  onToggleCheck={() => toggleSessionSelection(conversation.sessionId)}
                  showCheckbox={!historyCollectionDisabled}
                  cardLayout
                />
              ))
            )}
          </AppScrollView>
        </View>

        <View style={styles.detailPane}>
          {selectedConversation ? (
            <ChatHistorySessionDetail
              conversation={selectedConversation}
              fullHeight
              onNotify={notify}
              onDelete={
            historyCollectionDisabled
              ? undefined
              : () => confirmDeleteConversation(selectedConversation.sessionId)
          }
            />
          ) : (
            <EmptyStateView
              title={t('chatbot.history.selectConversation')}
              icon={MessageSquare}
              variant="inline"
              compact
            />
          )}
        </View>
      </View>
      )}
    </View>
  ) : (
    <View style={{ gap: spacing.md }}>
      {stackedFilters}
      <StatePanel
        isEmpty={!loading && filteredConversations.length === 0}
        emptyLabel={t('chatbot.history.filterEmpty.title')}
        emptyDescription={t('chatbot.history.filterEmpty.body')}>
        {loading && filteredConversations.length === 0 ? (
          <ChatHistoryListSkeleton count={4} />
        ) : (
          <MobileMenuGroup>
            {filteredConversations.map((conversation, index) => (
              <ConversationRow
                key={conversation.sessionId}
                conversation={conversation}
                selected={selectedSessionId === conversation.sessionId}
                checked={selectedSessionIds.includes(conversation.sessionId)}
                onSelect={() => openConversation(conversation)}
                onToggleCheck={() => toggleSessionSelection(conversation.sessionId)}
                showCheckbox={!historyCollectionDisabled}
                showChevron
                isLast={index === filteredConversations.length - 1}
              />
            ))}
          </MobileMenuGroup>
        )}
      </StatePanel>
      {selectedConversation ? (
        <ChatHistorySessionDetail
          conversation={selectedConversation}
          onNotify={notify}
          onDelete={
            historyCollectionDisabled
              ? undefined
              : () => confirmDeleteConversation(selectedConversation.sessionId)
          }
        />
      ) : null}
    </View>
  );

  if (isListOnly) {
    return (
      <View style={{ gap: spacing.sm, flex: 1 }}>
        {mobileListControls}
        <StatePanel
          isEmpty={!loading && filteredConversations.length === 0}
          emptyLabel="No conversations match your filters."
          emptyDescription="Try a different search or time range.">
          {loading && filteredConversations.length === 0 ? (
            <ChatHistoryListSkeleton count={6} />
          ) : (
            <MobileMenuGroup>
              {filteredConversations.map((conversation, index) => (
                <ConversationRow
                  key={conversation.sessionId}
                  conversation={conversation}
                  checked={selectedSessionIds.includes(conversation.sessionId)}
                  onSelect={() => openConversation(conversation)}
                  onToggleCheck={() => toggleSessionSelection(conversation.sessionId)}
                  showCheckbox={!historyCollectionDisabled}
                  showChevron
                  isLast={index === filteredConversations.length - 1}
                />
              ))}
            </MobileMenuGroup>
          )}
        </StatePanel>
      </View>
    );
  }

  return (
    <SearchConfigPanelCard
      icon={History}
      title={t('chatbot.history.title')}
      subtitle={t('chatbot.history.description')}
      trailing={headerActions}>
      {historyCollectionDisabled ? (
        <View style={{ marginBottom: spacing.md }}>
          <HistoryCollectionDisabledBanner messageKey="chatbot.history.collectionDisabledLegacy" />
        </View>
      ) : null}
      {splitBody}
    </SearchConfigPanelCard>
  );
}

function ChatHistoryListSkeleton({
  count,
  cardLayout,
}: {
  count: number;
  cardLayout?: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius, surfaceRadius } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }} accessibilityLabel={t('common.a11y.loadingConversations')}>
      {Array.from({ length: count }, (_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonRow,
            cardLayout && styles.skeletonCard,
            {
              borderColor: colors.border,
              borderRadius: cardLayout ? surfaceRadius.card : radius.md,
              backgroundColor: colors.surface,
              padding: spacing.sm,
              gap: spacing.sm,
            },
          ]}>
          <View style={[styles.skeletonLine, { width: '88%', backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
          <View style={[styles.skeletonLine, { width: '55%', backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]} />
        </View>
      ))}
    </View>
  );
}

function ConversationRow({
  conversation,
  selected = false,
  checked,
  onSelect,
  onToggleCheck,
  showChevron = false,
  showCheckbox = true,
  isLast = false,
  cardLayout = false,
}: {
  conversation: ChatConversation;
  selected?: boolean;
  checked: boolean;
  onSelect: () => void;
  onToggleCheck: () => void;
  showChevron?: boolean;
  showCheckbox?: boolean;
  isLast?: boolean;
  cardLayout?: boolean;
}) {
  const { colors, spacing, typography, radius, surfaceRadius } = useAppTheme();

  if (cardLayout) {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ selected }}
        onPress={onSelect}
        style={({ pressed, hovered }) => [
          styles.sessionCard,
          {
            borderColor: selected ? colors.primary : colors.border,
            borderRadius: surfaceRadius.button,
            backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
          },
        ]}>
        <View style={styles.rowBetween}>
          <Text
            style={[typography.caption, { color: colors.text, fontWeight: '500', flex: 1, lineHeight: 18 }]}
            numberOfLines={1}>
            {conversation.title}
          </Text>
          {showCheckbox ? (
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
              accessibilityLabel={`Select ${conversation.title}`}
              onPress={onToggleCheck}
              hitSlop={8}
              style={styles.checkboxHit}>
              <AppCheckboxMark checked={checked} />
            </Pressable>
          ) : null}
        </View>
        <Text style={[typography.caption, { color: colors.textMuted }]}>
          {formatChatHistoryListDate(conversation.lastMessageAt)}
        </Text>
        <View style={styles.rowBetween}>
          <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>
            {formatChatHistoryRelativeTime(conversation.lastMessageAt)}
          </Text>
          <View style={styles.msgCount}>
            <MessageSquare size={12} color={colors.textMuted} />
            <Text style={[typography.caption, { color: colors.textMuted, fontWeight: '500', fontSize: 11 }]}>
              {conversation.messageCount}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  }

  return (
    <View>
      <View
        style={[
          styles.conversationRow,
          {
            backgroundColor: selected ? colors.surfaceMuted : colors.surface,
            paddingHorizontal: 14,
            paddingVertical: spacing.sm,
          },
        ]}>
        {showCheckbox ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked }}
            accessibilityLabel={`Select ${conversation.title}`}
            onPress={onToggleCheck}
            hitSlop={8}
            style={styles.checkboxHit}>
            <AppCheckboxMark checked={checked} />
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected }}
          onPress={onSelect}
          style={{ flex: 1, gap: 4 }}>
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500', lineHeight: 18 }]} numberOfLines={1}>
            {conversation.title}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]} numberOfLines={2}>
            {conversation.previewText}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {formatChatHistoryListDate(conversation.lastMessageAt)} · {formatChatHistoryRelativeTime(conversation.lastMessageAt)}
          </Text>
        </Pressable>
        {showChevron ? <ChevronRight size={16} color={colors.textMuted} /> : null}
      </View>
      {!isLast ? <View style={[styles.divider, { backgroundColor: colors.border, marginLeft: 42 }]} /> : null}
    </View>
  );
}

function ChatHistoryHeaderDeleteButton({
  onPress,
  disabled,
  accessibilityLabel = 'Delete all chat history',
}: {
  onPress: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      disabled={disabled}
      onPress={onPress}
      hitSlop={8}
      style={({ pressed }) => ({
        marginRight: spacing.xs,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
        padding: 8,
      })}>
      <ActionIcons.delete size={20} color={colors.danger} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  splitShell: {
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'column',
    height: 420,
    minHeight: 420,
    maxHeight: 420,
  },
  emptyStateShell: { flex: 1, minHeight: 260, justifyContent: 'center' },
  splitRow: { flexDirection: 'row', flex: 1, minHeight: 0, alignItems: 'stretch' },
  masterPane: {
    width: 272,
    borderRightWidth: StyleSheet.hairlineWidth,
    minWidth: 240,
    maxWidth: 300,
    minHeight: 0,
    flexDirection: 'column',
    overflow: 'hidden',
  },
  detailPane: { flex: 1, minWidth: 0, minHeight: 0, alignSelf: 'stretch', overflow: 'hidden', padding: 4 },
  filterHeader: { borderBottomWidth: StyleSheet.hairlineWidth },
  searchWrap: { borderWidth: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 32, paddingHorizontal: 6 },
  searchInput: { flex: 1, paddingVertical: 4 },
  filterRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  timeRangeWrap: { flex: 1, minWidth: 140 },
  selectAll: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  checkboxHit: { padding: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

  sessionList: { flex: 1, minHeight: 0 },
  sessionListWeb: { overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  sessionListContent: { padding: 6, gap: 4 },
  sessionListEmpty: { flexGrow: 1, justifyContent: 'center', minHeight: 100 },
  sessionCard: { borderWidth: 1, padding: 6, gap: 2 },
  msgCount: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  emptyList: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 24 },
  emptyDetail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    gap: 8,
    paddingHorizontal: 16,
  },
  conversationRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  skeletonRow: { borderWidth: 1 },
  skeletonCard: { borderWidth: 1 },
  skeletonLine: { height: 10 },
  divider: { height: StyleSheet.hairlineWidth },
  historyActions: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 0 },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    flexShrink: 0,
  },
});
