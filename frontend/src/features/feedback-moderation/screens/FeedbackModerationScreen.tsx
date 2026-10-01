import { useRouter } from "expo-router";
import { ChevronLeft, MessageSquare, ThumbsUp } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppFlatList } from "@/shared/components/app-flat-list";
import { AppKeyboardAvoiding } from "@/shared/components/app-keyboard-avoiding";
import { AppScrollView } from "@/shared/components/app-scroll-view";

import { FeedbackDetailPanel } from "@/features/feedback-moderation/components/FeedbackDetailPanel";
import { FeedbackEntryRow } from "@/features/feedback-moderation/components/FeedbackEntryRow";
import { FeedbackMobileToolbar } from "@/features/feedback-moderation/components/FeedbackMobileToolbar";
import { FeedbackNegativeReasonsSection } from "@/features/feedback-moderation/components/FeedbackNegativeReasonsSection";
import { FeedbackSkeleton } from "@/features/feedback-moderation/components/FeedbackSkeleton";
import { FeedbackSummaryCards } from "@/features/feedback-moderation/components/FeedbackSummaryCards";
import { FeedbackWebToolbar } from "@/features/feedback-moderation/components/FeedbackWebToolbar";
import { useFeedbackModeration } from "@/features/feedback-moderation/hooks/useFeedbackModeration";
import { exportFeedbackModeration } from "@/features/feedback-moderation/services/feedback-moderation.service";
import type { FeedbackListItem } from "@/features/feedback-moderation/types/feedback-moderation.types";
import { cacheFeedbackListItem } from "@/features/feedback-moderation/utils/feedback-cache";
import {
  deliverFeedbackModerationExport,
  feedbackExportSuccessMessage,
} from "@/features/feedback-moderation/utils/feedback-export";
import { feedbackDetailRoute } from "@/features/feedback-moderation/utils/feedback-nav";
import { resolveTopNegativeReasons } from "@/features/feedback-moderation/utils/feedback-negative-reasons";
import { useFeedbackLayout } from "@/features/feedback-moderation/utils/feedback-layout";
import { ChatHistorySessionHeader } from "@/features/chat-history/components/ChatHistorySessionHeader";
import { ChatHistorySessionsPane } from "@/features/chat-history/components/ChatHistorySessionsPane";
import { SessionEmptyPanel } from "@/features/chat-history/components/SessionEmptyPanel";
import { SessionMasterDetailShell } from "@/features/chat-history/components/SessionMasterDetailShell";
import type {
  HistoryKind,
  HistorySessionSummaryItem,
} from "@/features/chat-history/types/chat-history.types";
import { historyKindToMessageType } from "@/features/chat-history/types/chat-history.types";
import { useFeedbackSessions } from "@/features/feedback-moderation/hooks/useFeedbackSessions";
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

export function FeedbackModerationScreen() {
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { t } = useTranslation();
  const toast = useStableToast();
  const router = useRouter();
  const { activeProjectId } = useActiveProject();
  const {
    isWeb,
    isNativeMobile,
    isCompactWeb,
    useFilterSheet,
    contentMaxWidth,
    horizontalPadding,
  } = useFeedbackLayout();

  const [kind, setKind] = useState<HistoryKind>("chatbot");
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<FeedbackListItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const useListShell = isWeb && !isCompactWeb;
  const useSessionDrillDown = isNativeMobile || isCompactWeb;
  const useFixedSplit = useListShell;

  useEffect(() => {
    setSelectedSessionId(null);
    setSelectedId(null);
    setSelectedPreview(null);
  }, [activeProjectId]);

  const onKindChange = useCallback((next: HistoryKind) => {
    setKind(next);
    setSelectedSessionId(null);
    setSelectedId(null);
    setSelectedPreview(null);
  }, []);

  const {
    summary,
    items,
    total,
    query,
    setQuery,
    voteFilter,
    setVoteFilter,
    timeRange,
    setTimeRange,
    dateFrom,
    loading,
    refreshing,
    error,
    emptyLabel,
    reload,
    refresh,
    loadMore,
    hasMore,
    loadingMore,
    patchListItem,
    refreshSummary,
    page,
    pageSize,
    totalPages,
    setPage,
    setPageSize,
  } = useFeedbackModeration({
    paginationMode: useListShell ? "paged" : "append",
    kind,
    sessionId: selectedSessionId,
  });

  const sessionsState = useFeedbackSessions({ kind, query, timeRange });

  const selectedSession = useMemo(
    () =>
      sessionsState.items.find((s) => s.sessionId === selectedSessionId) ?? null,
    [selectedSessionId, sessionsState.items],
  );

  useEffect(() => {
    if (useSessionDrillDown || sessionsState.loading) return;
    if (sessionsState.items.length === 0) {
      if (selectedSessionId) {
        setSelectedSessionId(null);
        setSelectedId(null);
        setSelectedPreview(null);
      }
      return;
    }
    const stillValid =
      selectedSessionId != null &&
      sessionsState.items.some((s) => s.sessionId === selectedSessionId);
    if (!stillValid) {
      setSelectedSessionId(sessionsState.items[0].sessionId);
      setSelectedId(null);
      setSelectedPreview(null);
    }
  }, [selectedSessionId, sessionsState.items, sessionsState.loading, useSessionDrillDown]);

  const filtersActive = query.trim().length > 0 || timeRange !== "all";
  const sessionsEmpty =
    !sessionsState.loading && sessionsState.items.length === 0;
  const sessionsEmptyCopy = useMemo(() => {
    if (filtersActive) {
      return {
        title: t("feedbackModeration.filterEmpty.title"),
        body: t("feedbackModeration.filterEmpty.body"),
      };
    }
    return {
      title: t("feedbackModeration.emptyState.title"),
      body: t("feedbackModeration.emptyState.body"),
    };
  }, [filtersActive, t]);

  const onSelectSession = useCallback((item: HistorySessionSummaryItem) => {
    setSelectedSessionId(item.sessionId);
    setSelectedId(null);
    setSelectedPreview(null);
  }, []);

  const onBackToSessions = useCallback(() => {
    setSelectedSessionId(null);
    setSelectedId(null);
    setSelectedPreview(null);
  }, []);

  const showSessionsOnly = useSessionDrillDown && !selectedSessionId;

  const sessionsPane = (
    <ChatHistorySessionsPane
      items={sessionsState.items}
      loading={sessionsState.loading}
      emptyLabel={sessionsState.emptyLabel}
      selectedSessionId={selectedSessionId}
      onSelect={onSelectSession}
      kind={kind}
      listTitleKey="feedbackModeration.sessions.listTitle"
      listDescriptionKey="feedbackModeration.sessions.listDescription"
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
          { paddingVertical: spacing.sm, opacity: pressed ? 0.7 : 1 },
        ]}>
        <ChevronLeft size={20} color={colors.primary} />
        <Text style={[typography.body, { color: colors.primary, fontWeight: "600" }]}>
          {t("feedbackModeration.sessions.back")}
        </Text>
      </Pressable>
    ) : null;

  const showSkeleton =
    !showSessionsOnly && Boolean(selectedSessionId) && loading && items.length === 0;
  const listIsEmpty =
    Boolean(selectedSessionId) && !loading && !error && items.length === 0;
  const topNegativeReasons = resolveTopNegativeReasons(
    summary?.topNegativeReasons,
    items,
  );

  const onSelect = useCallback(
    (item: FeedbackListItem) => {
      cacheFeedbackListItem(item);
      if (isNativeMobile) {
        router.push(feedbackDetailRoute(item.id));
        return;
      }
      setSelectedId(item.id);
      setSelectedPreview(item);
    },
    [isNativeMobile, router],
  );

  const closeDetailPanel = useCallback(() => {
    setSelectedId(null);
    setSelectedPreview(null);
  }, []);

  const handleExport = useCallback(
    async (format: "csv" | "json") => {
      if (exporting) return;
      setExporting(true);
      try {
        const result = await exportFeedbackModeration({
          fmt: format,
          q: query.trim() || undefined,
          voteFilter,
          dateFrom,
          sessionId: selectedSessionId ?? undefined,
          messageType: historyKindToMessageType(kind),
        });

        if (!result.content.trim()) {
          toast({
            description: t("feedbackModeration.toast.exportFailed"),
            variant: "error",
          });
          return;
        }

        const delivery = await deliverFeedbackModerationExport(result);
        if (delivery === "failed") {
          toast({
            description: t("feedbackModeration.toast.exportFailed"),
            variant: "error",
          });
          return;
        }
        const successMessage = feedbackExportSuccessMessage(format, delivery);
        if (successMessage) {
          toast({
            description: successMessage,
            variant: "success",
          });
        }
      } catch {
        toast({
          description: t("feedbackModeration.toast.exportFailed"),
          variant: "error",
        });
      } finally {
        setExporting(false);
      }
    },
    [dateFrom, exporting, kind, query, selectedSessionId, toast, voteFilter, t],
  );

  const exportDisabled = exporting || loading || (summary?.totalCount ?? 0) === 0;

  const onModerationSaved = useCallback(
    (id: string, patch: { reviewed: boolean; flagged: boolean }) => {
      patchListItem(id, patch);
      void refreshSummary();
    },
    [patchListItem, refreshSummary],
  );

  const toolbarProps = {
    kind,
    onKindChange,
    query,
    onQueryChange: setQuery,
    voteFilter,
    onVoteFilterChange: setVoteFilter,
    timeRange,
    onTimeRangeChange: setTimeRange,
    refreshing: refreshing || sessionsState.refreshing,
    onRefresh: () => {
      void refresh();
      void sessionsState.refresh();
    },
    exportDisabled,
    exporting,
    onExport: (format: "csv" | "json") => void handleExport(format),
  };

  const chromeHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.sm, width: "100%" }}>
      {isWeb && !isCompactWeb ? (
        <PageSectionHeader
          title={t("feedbackModeration.title")}
          subtitle={t("feedbackModeration.description")}
        />
      ) : null}
      <FeedbackSummaryCards summary={summary} loading={loading && !summary} />
      {topNegativeReasons.length > 0 ? (
        <FeedbackNegativeReasonsSection reasons={topNegativeReasons} />
      ) : null}
      {useFilterSheet ? (
        <FeedbackMobileToolbar {...toolbarProps} />
      ) : (
        <FeedbackWebToolbar {...toolbarProps} />
      )}
      {sessionBackHeader}
    </View>
  );

  const renderListRow = useCallback(
    (item: FeedbackListItem) => (
      <View
        key={item.id}
        style={{
          borderBottomWidth: StyleSheet.hairlineWidth,
          borderBottomColor: colors.border,
          backgroundColor: colors.surface,
        }}>
        <FeedbackEntryRow
          item={item}
          variant="list"
          selected={!isNativeMobile && selectedId === item.id}
          onPress={onSelect}
        />
      </View>
    ),
    [colors.border, colors.surface, isNativeMobile, onSelect, selectedId],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedbackListItem }) => (
      <FeedbackEntryRow
        item={item}
        variant={useListShell ? "list" : "card"}
        selected={!isNativeMobile && selectedId === item.id}
        onPress={onSelect}
      />
    ),
    [isNativeMobile, onSelect, selectedId, useListShell],
  );

  const paginationFooter = (
    <ListPaginationFooter
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      loading={loading}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      itemLabel={t("feedbackModeration.pagination.itemLabel")}
    />
  );

  if (error && items.length === 0 && !summary) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}>
        <StatePanel loading={false} error={error} onRetry={reload}>
          {null}
        </StatePanel>
      </View>
    );
  }

  const panelOpen = isWeb && Boolean(selectedId);

  const scrollContentStyle = {
    paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.md) : spacing.sm,
    paddingBottom: scrollBottomPadding,
    width: "100%" as const,
    maxWidth: contentMaxWidth,
    alignSelf: "center" as const,
  };

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
          {chromeHeader}
          {sessionsPane}
        </AppScrollView>
      </AppKeyboardAvoiding>
    );
  }

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
            {chromeHeader}
            <SessionEmptyPanel
              title={sessionsEmptyCopy.title}
              body={sessionsEmptyCopy.body}
              icon={ThumbsUp}
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
          titleKey="feedbackModeration.table.title"
        />
        {!selectedSessionId ? (
          <SessionEmptyPanel
            title={t("feedbackModeration.sessions.selectPrompt")}
            icon={MessageSquare}
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
              {showSkeleton ? <FeedbackSkeleton rows={4} /> : null}
              {listIsEmpty && !showSkeleton ? (
                <SessionEmptyPanel title={emptyLabel} icon={ThumbsUp} compact />
              ) : null}
              {!showSkeleton && !listIsEmpty
                ? items.map((item) => renderListRow(item))
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
          header={chromeHeader}
          left={sessionsPane}
          right={rightPane}
          contentMaxWidth={contentMaxWidth}
          horizontalPadding={horizontalPadding ?? spacing.md}
        />
        <SidePanelOverlay
          visible={panelOpen}
          onClose={closeDetailPanel}
          width={overlayTokens.width.sideSheetLg}
          accessibilityLabel={t("feedbackModeration.detail.title")}>
          <FeedbackDetailPanel
            feedbackId={selectedId}
            preview={selectedPreview}
            onClose={closeDetailPanel}
            onModerationSaved={onModerationSaved}
          />
        </SidePanelOverlay>
      </AppKeyboardAvoiding>
    );
  }

  const entriesList = (
    <AppFlatList
      style={styles.list}
      data={showSkeleton ? [] : items}
      keyExtractor={(item) => item.id}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
      ListHeaderComponent={
        <>
          {chromeHeader}
          <ChatHistorySessionHeader
            session={selectedSession}
            showTranscriptEmails={kind === "chatbot"}
            titleKey="feedbackModeration.table.title"
          />
        </>
      }
      contentContainerStyle={[styles.listContent, scrollContentStyle]}
      refreshControl={
        <RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />
      }
      onEndReached={() => {
        if (hasMore && !loadingMore) void loadMore();
      }}
      onEndReachedThreshold={0.4}
      keyboardShouldPersistTaps="handled"
    />
  );

  return (
    <AppKeyboardAvoiding
      style={[styles.root, { backgroundColor: colors.background }]}
      surface="screen">
      {entriesList}
      <SidePanelOverlay
        visible={panelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetLg}
        accessibilityLabel={t("feedbackModeration.detail.title")}>
        <FeedbackDetailPanel
          feedbackId={selectedId}
          preview={selectedPreview}
          onClose={closeDetailPanel}
          onModerationSaved={onModerationSaved}
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
