import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { useNavigation, useRouter } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { ChevronRight, History, MessageSquare, Search } from 'lucide-react-native';

import { MobileMenuGroup } from '@/features/chatbot-config/components/ChatbotConfigMobileMenuPrimitives';
import { SearchConfigPanelCard } from '@/features/search-config/components/SearchConfigPanelCard';
import { SearchHistoryFilterSheet } from '@/features/search-config/components/training/SearchHistoryFilterSheet';
import { SearchHistoryMobileToolbar } from '@/features/search-config/components/training/SearchHistoryMobileToolbar';
import { SearchHistorySessionDetail } from '@/features/search-config/components/training/SearchHistorySessionDetail';
import { useSearchConfig } from '@/features/search-config/hooks/useSearchConfig';
import { useSearchConfigLayout } from '@/features/search-config/hooks/useSearchConfigLayout';
import type { SearchHistoryEntry, SearchHistoryTimeRange } from '@/features/search-config/types/search-config.types';
import {
  getSearchConfigNav,
  searchHistorySessionRoute,
} from '@/features/search-config/utils/search-config-nav';
import { useTranslation } from '@/i18n';
import {
  formatSearchHistoryListDate,
  getSearchHistoryCreatedAt,
  getSearchHistoryEmptyCopy,
  getSearchHistoryFilterEmptyCopy,
  getSearchHistorySelectSessionCopy,
  getSearchHistorySessionNotFoundCopy,
  sortSearchHistoryMessages,
} from '@/features/search-config/utils/search-history-display';
import { AppSelectField } from '@/shared/components/app-select-field';
import { APP_CHROME_CONTROL_HEIGHT } from '@/shared/constants/layout';
import { AppButton } from '@/shared/components/app-button';
import { AppCheckboxMark } from '@/shared/components/app-checkbox-mark';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { HistoryCollectionDisabledBanner } from '@/shared/components/history-collection-disabled-banner';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';
import { copyText } from '@/shared/utils/copy-text';
import { ActionIcons } from '@/shared/constants/action-icons';

type SessionGroup = {
  sessionId: string;
  title: string;
  latestAt: string;
  messages: SearchHistoryEntry[];
};

type HistoryLayout = 'auto' | 'list' | 'detail';

type Props = {
  layout?: HistoryLayout;
  sessionId?: string;
};

function withinTimeRange(iso: string, range: SearchHistoryTimeRange) {
  if (range === 'all') return true;
  const diff = Date.now() - new Date(iso).getTime();
  if (range === 'today') return diff <= 24 * 60 * 60 * 1000;
  if (range === '7d') return diff <= 7 * 24 * 60 * 60 * 1000;
  if (range === '30d') return diff <= 30 * 24 * 60 * 60 * 1000;
  return diff <= 365 * 24 * 60 * 60 * 1000;
}

function buildSessions(history: SearchHistoryEntry[] | undefined): SessionGroup[] {
  if (!history?.length) return [];
  const grouped = new Map<string, SearchHistoryEntry[]>();
  history.forEach((item) => {
    const key = item.session_id || 'unknown';
    const list = grouped.get(key) ?? [];
    list.push(item);
    grouped.set(key, list);
  });

  return Array.from(grouped.entries())
    .map(([sessionId, messages]) => {
      const orderedMessages = sortSearchHistoryMessages(messages);
      const first = orderedMessages[0];
      const last = orderedMessages[orderedMessages.length - 1];
      return {
        sessionId,
        title: first?.user_message || 'Search session',
        latestAt: getSearchHistoryCreatedAt(last ?? first),
        messages: orderedMessages,
      };
    })
    .sort((a, b) => new Date(b.latestAt).getTime() - new Date(a.latestAt).getTime());
}

function SearchHistoryEmptyState({
  label,
  description,
  icon: Icon = History,
  compact,
  actionLabel,
  onAction,
}: {
  label: string;
  description?: string;
  icon?: LucideIcon;
  compact?: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <EmptyStateView
      title={label}
      description={description}
      icon={Icon}
      compact={compact}
      actionLabel={actionLabel}
      onAction={onAction}
      variant="inline"
    />
  );
}

export function TrainingSearchHistoryPanel({ layout = 'auto', sessionId }: Props) {
  const { t } = useTranslation();
  const { SEARCH_HISTORY_TIME_RANGE_OPTIONS } = getSearchConfigNav(t);
  const searchHistoryEmpty = getSearchHistoryEmptyCopy(t);
  const searchHistoryFilterEmpty = getSearchHistoryFilterEmptyCopy(t);
  const searchHistorySelectSession = getSearchHistorySelectSessionCopy(t);
  const searchHistorySessionNotFound = getSearchHistorySessionNotFoundCopy(t);
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { confirm } = useConfirm();
  const router = useRouter();
  const navigation = useNavigation();
  const { isCompact, showHistorySplit } = useSearchConfigLayout();
  const isListOnly = layout === 'list' || (layout === 'auto' && isCompact);
  const isDetailOnly = layout === 'detail';
  const useSplit = layout === 'auto' && showHistorySplit && !isListOnly;
  const {
    bundle,
    saving,
    handleClearSearchHistory,
    handleDeleteSearchHistorySessions,
    handleRefreshSearchHistory,
    notify,
    setPrimaryTab,
  } = useSearchConfig();
  const history = bundle?.searchHistory;
  const isEmpty = !history?.length;
  const historyCollectionDisabled = bundle?.privacySettings?.storeHistoryEnabled === false;
  const [query, setQuery] = useState('');
  const [timeRange, setTimeRange] = useState<SearchHistoryTimeRange>('all');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[]>([]);
  const copyingRef = useRef(false);

  useEffect(() => {
    void handleRefreshSearchHistory();
  }, [handleRefreshSearchHistory]);

  const sessions = useMemo(() => buildSessions(history), [history]);

  const filteredSessions = useMemo(() => {
    const text = query.trim().toLowerCase();
    return sessions.filter((session) => {
      const matchesText =
        !text ||
        session.title.toLowerCase().includes(text) ||
        session.messages.some(
          (m) =>
            m.user_message.toLowerCase().includes(text) ||
            m.assistant_response.toLowerCase().includes(text),
        );
      return matchesText && withinTimeRange(session.latestAt, timeRange);
    });
  }, [sessions, query, timeRange]);

  useEffect(() => {
    if (isDetailOnly || isListOnly) return;
    if (!filteredSessions.length) {
      setSelectedSessionId(null);
      return;
    }
    if (!selectedSessionId || !filteredSessions.some((s) => s.sessionId === selectedSessionId)) {
      setSelectedSessionId(filteredSessions[0].sessionId);
    }
  }, [filteredSessions, isDetailOnly, isListOnly, selectedSessionId]);

  const selectedSession =
    filteredSessions.find((session) => session.sessionId === selectedSessionId) ?? null;

  const detailSession = useMemo(() => {
    if (!isDetailOnly || !sessionId) return selectedSession;
    return sessions.find((session) => session.sessionId === sessionId) ?? selectedSession;
  }, [isDetailOnly, selectedSession, sessionId, sessions]);

  const visibleIds = filteredSessions.map((session) => session.sessionId);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedSessionIds.includes(id));
  const selectedCount = selectedSessionIds.length;
  const activeFilterCount = timeRange !== 'all' ? 1 : 0;

  const openSession = (targetSessionId: string) => {
    if (isListOnly) {
      router.push(searchHistorySessionRoute(targetSessionId));
      return;
    }
    setSelectedSessionId(targetSessionId);
  };

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedSessionIds((current) => current.filter((id) => !visibleIds.includes(id)));
      return;
    }
    setSelectedSessionIds((current) => Array.from(new Set([...current, ...visibleIds])));
  };

  const toggleSession = (targetSessionId: string) => {
    setSelectedSessionIds((current) =>
      current.includes(targetSessionId)
        ? current.filter((id) => id !== targetSessionId)
        : [...current, targetSessionId],
    );
  };

  const confirmDeleteAll = () => {
    void (async () => {
      const confirmed = await confirm({
        title: t('search.history.deleteAll'),
        message: t('search.history.deleteAll.confirm'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('search.history.deleteAll'),
        destructive: true,
      });
      if (!confirmed) return;
      void handleClearSearchHistory();
      setSelectedSessionIds([]);
      setSelectedSessionId(null);
    })();
  };

  const confirmDeleteSelected = () => {
    void (async () => {
      const confirmed = await confirm({
        title: t('search.history.confirm.deleteSelected.title'),
        message: t('search.history.confirm.deleteSelected.message', { count: selectedCount }),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;
      const ids = [...selectedSessionIds];
      await handleDeleteSearchHistorySessions(ids);
      setSelectedSessionIds((current) => current.filter((id) => !ids.includes(id)));
      if (selectedSessionId && ids.includes(selectedSessionId)) {
        setSelectedSessionId(null);
      }
    })();
  };

  const confirmDeleteSession = (targetSessionId: string, onDeleted?: () => void) => {
    void (async () => {
      const confirmed = await confirm({
        title: t('search.history.confirm.deleteOne.title'),
        message: t('api-keys.delete.fallbackDescription'),
        cancelLabel: t('common.cancel'),
        confirmLabel: t('common.delete'),
        destructive: true,
      });
      if (!confirmed) return;
      await handleDeleteSearchHistorySessions([targetSessionId]);
      setSelectedSessionIds((current) => current.filter((id) => id !== targetSessionId));
      if (selectedSessionId === targetSessionId) setSelectedSessionId(null);
      onDeleted?.();
    })();
  };

  const copyMessage = async (text: string) => {
    if (copyingRef.current) return;
    copyingRef.current = true;
    try {
      const ok = await copyText(text);
      notify(ok ? t('search.history.copySuccess') : t('search.history.copyFailed'), ok ? 'success' : 'error');
    } finally {
      copyingRef.current = false;
    }
  };

  useLayoutEffect(() => {
    if (!isDetailOnly) return;
    navigation.setOptions({
      title: detailSession?.title ?? 'Search session',
      headerRight: detailSession && !historyCollectionDisabled
        ? () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Delete session"
              disabled={saving}
              onPress={() => confirmDeleteSession(detailSession.sessionId, () => router.back())}
              hitSlop={8}
              style={{ padding: 8, opacity: saving ? 0.45 : 1 }}>
              <ActionIcons.delete size={20} color={colors.danger} />
            </Pressable>
          )
        : undefined,
    });
  }, [colors.danger, detailSession, isDetailOnly, navigation, router, saving]);

  const headerAction = historyCollectionDisabled
    ? null
    : selectedCount > 0 ? (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Delete selected sessions, ${selectedCount}`}
        disabled={saving}
        onPress={confirmDeleteSelected}
        style={({ pressed }) => [
          styles.deleteSelectedBtn,
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
          Delete Selected ({selectedCount})
        </Text>
      </Pressable>
    ) : (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Delete all search history"
        disabled={isEmpty || saving}
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
                {t('search.history.deleteAll')}
              </Text>
            </>
          );
        }}
      </Pressable>
    );

  const sessionCheckbox = (checked: boolean, onPress: () => void, label: string) => {
    if (historyCollectionDisabled) return null;
    return (
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
  };

  const listPaneEmptyLabel = searchHistoryFilterEmpty.title;
  const listPaneEmptyDescription = searchHistoryFilterEmpty.body;

  const openSearchTest = () => {
    if (layout === 'list' || layout === 'detail') {
      router.push('/(app)/search-config/search-test');
      return;
    }
    setPrimaryTab('search-test');
  };

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
          value={query}
          onChangeText={setQuery}
          placeholder={t('search.history.search.placeholder')}
          placeholderTextColor={colors.textMuted}
          style={[getToolbarSearchInputStyle(typography.body), styles.searchInput, { color: colors.text }]}
        />
      </View>
      <View style={[styles.filterRow, { gap: spacing.sm }]}>
        <View style={styles.timeRangeWrap}>
          <AppSelectField
            label=""
            accessibilityLabel="Time range"
            variant="inline"
            pickerTitle="Time range"
            value={timeRange}
            options={SEARCH_HISTORY_TIME_RANGE_OPTIONS}
            onChange={setTimeRange}
            controlHeight={APP_CHROME_CONTROL_HEIGHT}
          />
        </View>
        {!historyCollectionDisabled ? (
        <Pressable
          onPress={toggleSelectAll}
          style={({ pressed }) => [
            styles.selectAllRow,
            { opacity: pressed ? 0.85 : 1, minHeight: 32 },
          ]}>
          {sessionCheckbox(allVisibleSelected, toggleSelectAll, 'Select all visible sessions')}
          <Text style={[typography.caption, { color: colors.text, fontWeight: '500' }]}>{t('search.history.selectAll')}</Text>
        </Pressable>
        ) : null}
      </View>
    </View>
  );

  const listBody = useSplit ? (
    <View
      style={[
        styles.splitShell,
        { borderColor: colors.border, borderRadius: surfaceRadius.card, backgroundColor: colors.surface },
      ]}>
      {isEmpty ? (
        <View style={[styles.emptyStateShell, { padding: spacing.md }]}>
          <SearchHistoryEmptyState
            label={searchHistoryEmpty.title}
            description={searchHistoryEmpty.body}
            icon={History}
            actionLabel={searchHistoryEmpty.action}
            onAction={openSearchTest}
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
              filteredSessions.length === 0 ? styles.sessionListEmpty : null,
            ]}>
              {filteredSessions.length === 0 ? (
                <SearchHistoryEmptyState
                  label={listPaneEmptyLabel}
                  description={listPaneEmptyDescription}
                  icon={MessageSquare}
                  compact
                />
              ) : (
                filteredSessions.map((session) => {
                const selected = session.sessionId === selectedSessionId;
                const checked = selectedSessionIds.includes(session.sessionId);
                return (
                  <Pressable
                    key={session.sessionId}
                    onPress={() => openSession(session.sessionId)}
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
                        style={[typography.caption, { color: colors.text, fontWeight: '500', flex: 1, lineHeight: 20 }]}
                        numberOfLines={1}>
                        {session.title}
                      </Text>
                      {sessionCheckbox(checked, () => toggleSession(session.sessionId), `Select ${session.title}`)}
                    </View>
                    <Text style={[typography.caption, { color: colors.textMuted }]}>
                      {formatSearchHistoryListDate(session.latestAt)}
                    </Text>
                    <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>
                      Number of searches: {session.messages.length}
                    </Text>
                  </Pressable>
                );
              })
            )}
          </AppScrollView>
        </View>

        <View style={styles.detailPane}>
          {selectedSession ? (
            <SearchHistorySessionDetail
              messages={selectedSession.messages}
              fullHeight
              onDelete={
                historyCollectionDisabled
                  ? undefined
                  : () => confirmDeleteSession(selectedSession.sessionId)
              }
              onCopy={(text) => void copyMessage(text)}
            />
          ) : (
            <EmptyStateView
              title={searchHistorySelectSession.title}
              description={searchHistorySelectSession.body}
              icon={MessageSquare}
              variant="inline"
            />
          )}
        </View>
      </View>
      )}
    </View>
  ) : isEmpty ? (
    <View style={isListOnly ? styles.mobileEmptyWrap : undefined}>
      <SearchHistoryEmptyState
        label={searchHistoryEmpty.title}
        description={searchHistoryEmpty.body}
        actionLabel={searchHistoryEmpty.action}
        onAction={openSearchTest}
      />
    </View>
  ) : filteredSessions.length === 0 ? (
    <SearchHistoryEmptyState
      label={listPaneEmptyLabel}
      description={listPaneEmptyDescription}
      icon={MessageSquare}
    />
  ) : (
    <MobileMenuGroup>
      {filteredSessions.map((session, index) => {
        const checked = selectedSessionIds.includes(session.sessionId);
        const isLast = index === filteredSessions.length - 1;
        return (
          <View key={session.sessionId}>
            <View
              style={[
                styles.mobileRow,
                {
                  borderColor: colors.border,
                  borderRadius: surfaceRadius.button,
                  backgroundColor: colors.surface,
                  padding: spacing.xs,
                },
              ]}>
              <View style={styles.rowBetween}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => openSession(session.sessionId)}
                  style={{ flex: 1, gap: 2 }}>
                  <Text style={[typography.caption, { color: colors.text, fontWeight: '500', lineHeight: 18 }]} numberOfLines={1}>
                    {session.title}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted }]}>
                    {formatSearchHistoryListDate(session.latestAt)}
                  </Text>
                  <Text style={[typography.caption, { color: colors.textMuted, fontSize: 11 }]}>
                    Number of searches: {session.messages.length}
                  </Text>
                </Pressable>
                <View style={styles.mobileRowActions}>
                  {sessionCheckbox(checked, () => toggleSession(session.sessionId), `Select ${session.title}`)}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${session.title}`}
                    onPress={() => openSession(session.sessionId)}
                    hitSlop={8}>
                    <ChevronRight size={16} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            </View>
            {!isLast ? <View style={{ height: spacing.xs }} /> : null}
          </View>
        );
      })}
    </MobileMenuGroup>
  );

  if (isDetailOnly) {
    return (
      <View style={{ flex: 1 }}>
        <StatePanel
          isEmpty={!detailSession}
          emptyLabel={searchHistorySessionNotFound.title}
          emptyDescription={searchHistorySessionNotFound.body}>
          {detailSession ? (
            <SearchHistorySessionDetail
              messages={detailSession.messages}
              showHeader={false}
              fullHeight
              onCopy={(text) => void copyMessage(text)}
            />
          ) : (
            <History size={28} color={colors.textMuted} />
          )}
        </StatePanel>
      </View>
    );
  }

  if (isListOnly) {
    return (
      <View style={{ gap: spacing.sm, flex: 1 }}>
        {historyCollectionDisabled ? (
          <HistoryCollectionDisabledBanner messageKey="search.history.collectionDisabledLegacy" />
        ) : null}
        <View style={[styles.toolbar, { gap: spacing.sm }]}>
          <View style={styles.toolbarStats}>
            <Text style={[typography.caption, { color: colors.textMuted }]}>{t('search.history.sessions')}</Text>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{sessions.length}</Text>
          </View>
          {headerAction}
        </View>
        <SearchHistoryMobileToolbar
          search={query}
          onSearchChange={setQuery}
          onOpenFilters={() => setFilterSheetVisible(true)}
          activeFilterCount={activeFilterCount}
          allSelected={allVisibleSelected}
          onToggleSelectAll={toggleSelectAll}
          selectAllDisabled={visibleIds.length === 0 || historyCollectionDisabled}
        />
        <SearchHistoryFilterSheet
          visible={filterSheetVisible}
          onClose={() => setFilterSheetVisible(false)}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
        />
        {listBody}
      </View>
    );
  }

  return (
    <SearchConfigPanelCard
      icon={History}
      title={t('search.training.searchHistory.title')}
      subtitle={t('search.history.description')}
      trailing={headerAction}>
      {historyCollectionDisabled ? (
        <View style={{ marginBottom: spacing.md }}>
          <HistoryCollectionDisabledBanner messageKey="search.history.collectionDisabledLegacy" />
        </View>
      ) : null}
      {listBody}
    </SearchConfigPanelCard>
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
  selectAllRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sessionList: { flex: 1, minHeight: 0 },
  sessionListWeb: { overflowY: 'auto', WebkitOverflowScrolling: 'touch' },
  sessionListContent: { padding: 6, gap: 4 },
  sessionListEmpty: { flexGrow: 1, justifyContent: 'center', minHeight: 100 },
  sessionCard: { borderWidth: 1, padding: 6, gap: 2 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  mobileRow: { borderWidth: 1 },
  mobileRowActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  mobileEmptyWrap: { flex: 1, justifyContent: 'center', minHeight: 240 },
  checkboxHit: { padding: 2 },

  emptyState: { alignItems: 'center', justifyContent: 'center', width: '100%' },
  emptyStateCompact: { paddingVertical: 8 },
  emptyDetail: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    gap: 8,
    paddingHorizontal: 16,
  },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toolbarStats: { gap: 2 },
  deleteAllBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1 },
  deleteSelectedBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
