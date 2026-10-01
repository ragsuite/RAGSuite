import { useRouter } from "expo-router";
import { ChevronLeft, MessageSquare, Search } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppPaginatedScreenList } from "@/shared/components/app-paginated-screen-list";
import { AppKeyboardAvoiding } from "@/shared/components/app-keyboard-avoiding";
import { AppScrollView } from "@/shared/components/app-scroll-view";

import { ChatHistorySessionHeader } from "@/features/chat-history/components/ChatHistorySessionHeader";
import { ChatHistorySessionsPane } from "@/features/chat-history/components/ChatHistorySessionsPane";
import { SessionEmptyPanel } from "@/features/chat-history/components/SessionEmptyPanel";
import { SessionMasterDetailShell } from "@/features/chat-history/components/SessionMasterDetailShell";
import { ChatHistoryLoadMore } from "@/features/chat-history/components/ChatHistoryLoadMore";
import { ChatHistoryMobileToolbar } from "@/features/chat-history/components/ChatHistoryMobileToolbar";
import { ChatHistoryQueryDetailPanel } from "@/features/chat-history/components/ChatHistoryQueryDetailPanel";
import { ChatHistoryQueryRow } from "@/features/chat-history/components/ChatHistoryQueryRow";
import { ChatHistorySkeleton } from "@/features/chat-history/components/ChatHistorySkeleton";
import { ChatHistoryWebToolbar } from "@/features/chat-history/components/ChatHistoryWebToolbar";
import { useChatHistory } from "@/features/chat-history/hooks/useChatHistory";
import { useChatSessions } from "@/features/chat-history/hooks/useChatSessions";
import type { HistorySessionSummaryItem } from "@/features/chat-history/types/chat-history.types";
import {
  exportChatHistory,
  historyKindToMessageType,
} from "@/features/chat-history/services/chat-history.service";
import type {
  ChatQueryListItem,
  HistoryKind,
} from "@/features/chat-history/types/chat-history.types";
import { chatQueryDetailRoute } from "@/features/chat-history/utils/chat-history-nav";
import { cacheChatQueryListItem } from "@/features/chat-history/utils/chat-query-cache";
import { deliverChatHistoryListExport } from "@/features/chat-history/utils/chat-history-export";
import { useChatHistoryLayout } from "@/features/chat-history/utils/chat-history-layout";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { useTranslation } from "@/i18n";
import { SidePanelOverlay } from "@/shared/components/adaptive/side-panel-overlay";
import { overlayTokens } from "@/shared/constants/overlay-tokens";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { ListPaginationFooter } from "@/shared/components/list-pagination-footer";
import { PageSectionHeader } from "@/shared/components/surfaces/page-section-header";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { useScrollBottomPadding } from "@/shared/hooks/use-scroll-bottom-padding";
import { useStableToast } from "@/shared/toast/use-toast-ref";

export function ChatHistoryScreen() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();
  const toast = useStableToast();
  const router = useRouter();
  const { activeProjectId } = useActiveProject();
  const {
    isWeb,
    isNativeMobile: isMobileApp,
    isCompactWeb,
    useFilterSheet,
    contentMaxWidth,
    horizontalPadding,
  } = useChatHistoryLayout();

  const [kind, setKind] = useState<HistoryKind>("chatbot");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(null);

  const useCardRows = isMobileApp || isCompactWeb;
  const useWebPagedList = isWeb && !useCardRows;
  const useSessionDrillDown = isMobileApp || isCompactWeb;
  const useFixedSplit = useWebPagedList;

  useEffect(() => {
    setSelectedSessionId(null);
    setSelectedMessageId(null);
  }, [activeProjectId]);

  const onKindChange = useCallback((next: HistoryKind) => {
    setKind(next);
    setSelectedSessionId(null);
    setSelectedMessageId(null);
  }, []);

  const {
    items,
    total,
    query,
    setQuery,
    timeRange,
    setTimeRange,
    dateFrom,
    loading,
    loadingMore,
    refreshing,
    error,
    reload,
    refresh,
    loadMore,
    hasMore,
    emptyLabel,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
  } = useChatHistory({
    paginationMode: useWebPagedList ? "paged" : "append",
    kind,
    sessionId: selectedSessionId,
  });

  const sessionsState = useChatSessions({
    kind,
    query,
    timeRange,
  });

  const selectedSession = useMemo(
    () =>
      sessionsState.items.find((s) => s.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessionsState.items],
  );

  useEffect(() => {
    if (useSessionDrillDown || sessionsState.loading) {
      return;
    }
    if (sessionsState.items.length === 0) {
      if (selectedSessionId) {
        setSelectedSessionId(null);
        setSelectedMessageId(null);
      }
      return;
    }
    const stillValid =
      selectedSessionId != null &&
      sessionsState.items.some((s) => s.sessionId === selectedSessionId);
    if (!stillValid) {
      setSelectedSessionId(sessionsState.items[0].sessionId);
      setSelectedMessageId(null);
    }
  }, [
    selectedSessionId,
    sessionsState.items,
    sessionsState.loading,
    useSessionDrillDown,
  ]);

  const filtersActive = query.trim().length > 0 || timeRange !== "all";
  const sessionsEmpty =
    !sessionsState.loading && sessionsState.items.length === 0;
  const sessionsEmptyCopy = useMemo(() => {
    if (filtersActive) {
      return {
        title: t("history.filterEmpty.title"),
        body: t("history.filterEmpty.body"),
        icon: kind === "search" ? Search : MessageSquare,
      };
    }
    if (kind === "search") {
      return {
        title: t("history.emptyStateSearch.title"),
        body: t("history.emptyStateSearch.body"),
        icon: Search,
      };
    }
    return {
      title: t("history.emptyState.title"),
      body: t("history.emptyState.body"),
      icon: MessageSquare,
    };
  }, [filtersActive, kind, t]);

  const onSelectSession = useCallback((item: HistorySessionSummaryItem) => {
    setSelectedSessionId(item.sessionId);
    setSelectedMessageId(null);
  }, []);

  const onBackToSessions = useCallback(() => {
    setSelectedSessionId(null);
    setSelectedMessageId(null);
  }, []);

  const showSessionsOnly = useSessionDrillDown && !selectedSessionId;
  const showSkeleton =
    !showSessionsOnly && loading && items.length === 0 && Boolean(selectedSessionId);
  const listIsEmpty =
    Boolean(selectedSessionId) && !loading && !error && items.length === 0;

  const tableShellStyle = isWeb
    ? {
        borderColor: colors.border,
        borderBottomWidth: StyleSheet.hairlineWidth,
        backgroundColor: colors.surface,
      }
    : null;

  const onSelectQuery = useCallback(
    (item: ChatQueryListItem) => {
      cacheChatQueryListItem(item);
      if (isMobileApp) {
        router.push(chatQueryDetailRoute(item.messageId, kind));
        return;
      }
      setSelectedMessageId(item.messageId);
    },
    [isMobileApp, kind, router],
  );

  const closeDetailPanel = useCallback(() => {
    setSelectedMessageId(null);
  }, []);

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      try {
        const payload = await exportChatHistory({
          fmt: format,
          q: query.trim() || undefined,
          dateFrom,
          sessionId: selectedSessionId ?? undefined,
          messageType: historyKindToMessageType(kind),
        });
        if (!payload.trim()) {
          toast({
            description: t("history.toast.exportListFailed"),
            variant: "error",
          });
          return;
        }
        const ok = await deliverChatHistoryListExport({
          content: payload,
          format,
          kind,
        });
        toast({
          description: ok
            ? t("history.toast.exportListDone")
            : t("history.toast.exportListFailed"),
          variant: ok ? "success" : "error",
        });
      } catch {
        toast({
          description: t("history.toast.exportListFailed"),
          variant: "error",
        });
      }
    },
    [dateFrom, kind, query, selectedSessionId, t, toast],
  );

  const sessionsPane = (
    <ChatHistorySessionsPane
      items={sessionsState.items}
      loading={sessionsState.loading}
      emptyLabel={sessionsState.emptyLabel}
      selectedSessionId={selectedSessionId}
      onSelect={onSelectSession}
      kind={kind}
      fillHeight={useFixedSplit}
    />
  );

  const sessionBackHeader =
    useSessionDrillDown && selectedSessionId ? (
      <Pressable
        accessibilityRole="button"
        onPress={onBackToSessions}
        style={({ pressed }) => [
          styles.backRow,
          {
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
            opacity: pressed ? 0.7 : 1,
          },
        ]}>
        <ChevronLeft size={20} color={colors.primary} />
        <Text style={[typography.body, { color: colors.primary, fontWeight: "600" }]}>
          {t("history.sessions.back")}
        </Text>
      </Pressable>
    ) : null;

  const renderListRow = useCallback(
    (item: ChatQueryListItem) => (
      <View key={item.id} style={tableShellStyle}>
        <ChatHistoryQueryRow
          item={item}
          variant="list"
          selected={selectedMessageId === item.messageId}
          onPress={onSelectQuery}
        />
      </View>
    ),
    [onSelectQuery, selectedMessageId, tableShellStyle],
  );

  const renderItem = useCallback(
    ({ item }: { item: ChatQueryListItem }) => {
      if (useCardRows) {
        return (
          <ChatHistoryQueryRow item={item} variant="card" onPress={onSelectQuery} />
        );
      }
      return renderListRow(item);
    },
    [onSelectQuery, renderListRow, useCardRows],
  );

  const toolbarProps = {
    kind,
    onKindChange,
    query,
    onQueryChange: setQuery,
    timeRange,
    onTimeRangeChange: setTimeRange,
    refreshing: refreshing || sessionsState.refreshing,
    onRefresh: () => {
      void refresh();
      void sessionsState.refresh();
    },
    exportDisabled: loading || items.length === 0,
    onExport: (format: "csv" | "json") => void handleExport(format),
  };

  const mobileListHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      <ChatHistoryMobileToolbar {...toolbarProps} />
      {sessionBackHeader}
      {!showSessionsOnly ? (
        <ChatHistorySessionHeader
          session={selectedSession}
          showTranscriptEmails={kind === "chatbot"}
        />
      ) : null}
    </View>
  );

  const webChromeHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.sm, width: "100%" }}>
      {!isCompactWeb ? (
        <PageSectionHeader title={t("history.title")} subtitle={t("history.subtitle")} />
      ) : null}
      {useFilterSheet ? (
        <ChatHistoryMobileToolbar {...toolbarProps} />
      ) : (
        <ChatHistoryWebToolbar {...toolbarProps} />
      )}
    </View>
  );

  const listHeader = isMobileApp ? mobileListHeader : webChromeHeader;

  const paginationFooter = (
    <ListPaginationFooter
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      loading={loading}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      itemLabel={t("history.pagination.itemLabel")}
    />
  );

  const listFooter =
    !showSkeleton && !listIsEmpty && !useWebPagedList ? (
      <ChatHistoryLoadMore
        loadedCount={items.length}
        total={total}
        hasMore={hasMore}
        loadingMore={loadingMore}
        onLoadMore={() => void loadMore()}
      />
    ) : null;

  const listEmptyComponent =
    listIsEmpty && isMobileApp ? (
      <SessionEmptyPanel
        title={emptyLabel}
        icon={kind === "search" ? Search : MessageSquare}
        compact
      />
    ) : null;

  const scrollContentStyle = {
    paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.md) : spacing.sm,
    paddingBottom: scrollBottomPadding,
    width: "100%" as const,
    maxWidth: contentMaxWidth,
    alignSelf: "center" as const,
  };

  if (error && items.length === 0 && selectedSessionId) {
    return (
      <AppKeyboardAvoiding
        style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}
        surface="screen">
        {listHeader}
        <StatePanel loading={false} error={error} onRetry={reload}>
          {null}
        </StatePanel>
      </AppKeyboardAvoiding>
    );
  }

  if (showSessionsOnly) {
    return (
      <AppKeyboardAvoiding
        style={[styles.root, { backgroundColor: colors.background }]}
        surface="screen">
        <AppScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, scrollContentStyle]}
          refreshControl={
            <RefreshControl
              tintColor={colors.primary}
              refreshing={sessionsState.refreshing}
              onRefresh={() => void sessionsState.refresh()}
            />
          }
          keyboardShouldPersistTaps="handled">
          {isMobileApp ? mobileListHeader : webChromeHeader}
          {sessionsPane}
        </AppScrollView>
      </AppKeyboardAvoiding>
    );
  }

  const panelOpen = isWeb && Boolean(selectedMessageId);

  if (useFixedSplit) {
    if (sessionsEmpty) {
      return (
        <AppKeyboardAvoiding
          style={[styles.root, { backgroundColor: colors.background }]}
          surface="screen">
          <View
            style={[
              styles.unifiedEmpty,
              {
                paddingHorizontal: horizontalPadding ?? spacing.md,
                maxWidth: contentMaxWidth,
                width: "100%",
                alignSelf: "center",
                paddingBottom: spacing.md,
                gap: spacing.md,
              },
            ]}>
            {webChromeHeader}
            <SessionEmptyPanel
              title={sessionsEmptyCopy.title}
              body={sessionsEmptyCopy.body}
              icon={sessionsEmptyCopy.icon}
              card
            />
          </View>
        </AppKeyboardAvoiding>
      );
    }

    const rightPane = (
      <View style={styles.rightPane}>
        <ChatHistorySessionHeader
          session={selectedSession}
          showTranscriptEmails={kind === "chatbot"}
        />
        {!selectedSessionId ? (
          <SessionEmptyPanel
            title={t("history.sessions.selectPrompt")}
            icon={kind === "search" ? Search : MessageSquare}
            compact
          />
        ) : (
          <>
            <AppScrollView
              style={styles.rightScroll}
              contentContainerStyle={styles.rightScrollContent}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              scrollbarVariant="overlay">
              {showSkeleton ? <ChatHistorySkeleton rows={6} /> : null}
              {listIsEmpty && !showSkeleton ? (
                <SessionEmptyPanel
                  title={emptyLabel}
                  icon={kind === "search" ? Search : MessageSquare}
                  compact
                />
              ) : null}
              {!showSkeleton && !listIsEmpty
                ? items.map((item) => (
                    <React.Fragment key={item.id}>{renderListRow(item)}</React.Fragment>
                  ))
                : null}
            </AppScrollView>
            {!listIsEmpty ? (
              <View
                style={{
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                }}>
                {paginationFooter}
              </View>
            ) : null}
          </>
        )}
      </View>
    );

    return (
      <AppKeyboardAvoiding
        style={[styles.root, { backgroundColor: colors.background }]}
        surface="screen">
        <SessionMasterDetailShell
          header={webChromeHeader}
          left={sessionsPane}
          right={rightPane}
          contentMaxWidth={contentMaxWidth}
          horizontalPadding={horizontalPadding ?? spacing.md}
        />
        <SidePanelOverlay
          visible={panelOpen}
          onClose={closeDetailPanel}
          width={overlayTokens.width.sideSheetLg}
          accessibilityLabel={t("history.detail.title")}>
          <ChatHistoryQueryDetailPanel
            messageId={selectedMessageId}
            kind={kind}
            onClose={closeDetailPanel}
          />
        </SidePanelOverlay>
      </AppKeyboardAvoiding>
    );
  }

  const queriesList = (
    <AppPaginatedScreenList
      style={styles.list}
      data={showSkeleton ? [] : items}
      dataVersion={items.length}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={
        useCardRows ? () => <View style={{ height: spacing.sm }} /> : undefined
      }
      ListHeaderComponent={
        <>
          {listHeader}
          <ChatHistorySessionHeader
            session={selectedSession}
            showTranscriptEmails={kind === "chatbot"}
          />
        </>
      }
      ListEmptyComponent={listEmptyComponent}
      ListFooterComponent={listFooter}
      contentContainerStyle={[styles.listContent, scrollContentStyle]}
      refreshControl={
        <RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />
      }
      keyboardShouldPersistTaps="handled"
    />
  );

  return (
    <AppKeyboardAvoiding
      style={[styles.root, { backgroundColor: colors.background }]}
      surface="screen">
      {queriesList}
      <SidePanelOverlay
        visible={panelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetLg}
        accessibilityLabel={t("history.detail.title")}>
        <ChatHistoryQueryDetailPanel
          messageId={selectedMessageId}
          kind={kind}
          onClose={closeDetailPanel}
        />
      </SidePanelOverlay>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1 },
  listContent: {},
  rightPane: {
    flex: 1,
    minHeight: 0,
  },
  rightScroll: {
    flex: 1,
    minHeight: 0,
  },
  rightScrollContent: {
    flexGrow: 1,
  },
  backRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  unifiedEmpty: {
    flex: 1,
    minHeight: 0,
  },
});
