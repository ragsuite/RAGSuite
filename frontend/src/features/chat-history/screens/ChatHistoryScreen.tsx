import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppPaginatedScreenList } from "@/shared/components/app-paginated-screen-list";
import { AppKeyboardAvoiding } from "@/shared/components/app-keyboard-avoiding";
import { AppScrollView } from "@/shared/components/app-scroll-view";

import { ChatHistoryLoadMore } from "@/features/chat-history/components/ChatHistoryLoadMore";
import { ChatHistoryMobileToolbar } from "@/features/chat-history/components/ChatHistoryMobileToolbar";
import { ChatHistoryQueryDetailPanel } from "@/features/chat-history/components/ChatHistoryQueryDetailPanel";
import { ChatHistoryQueryRow } from "@/features/chat-history/components/ChatHistoryQueryRow";
import { ChatHistorySkeleton } from "@/features/chat-history/components/ChatHistorySkeleton";
import { ChatHistoryWebToolbar } from "@/features/chat-history/components/ChatHistoryWebToolbar";
import { useChatHistory } from "@/features/chat-history/hooks/useChatHistory";
import { exportChatHistory } from "@/features/chat-history/services/chat-history.service";
import type { ChatQueryListItem } from "@/features/chat-history/types/chat-history.types";
import { chatQueryDetailRoute } from "@/features/chat-history/utils/chat-history-nav";
import { cacheChatQueryListItem } from "@/features/chat-history/utils/chat-query-cache";
import { useChatHistoryLayout } from "@/features/chat-history/utils/chat-history-layout";
import { useTranslation } from "@/i18n";
import { SidePanelOverlay } from "@/shared/components/adaptive/side-panel-overlay";
import { overlayTokens } from "@/shared/constants/overlay-tokens";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { ListPaginationFooter } from "@/shared/components/list-pagination-footer";
import { PaginatedTablePanel } from "@/shared/components/paginated-table-panel";
import { PageSectionHeader } from "@/shared/components/surfaces/page-section-header";
import { copyText } from "@/shared/utils/copy-text";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { useScrollBottomPadding } from "@/shared/hooks/use-scroll-bottom-padding";
import { useStableToast } from "@/shared/toast/use-toast-ref";

export function ChatHistoryScreen() {
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } =
    useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const toast = useStableToast();
  const router = useRouter();
  const {
    isWeb,
    isNativeMobile: isMobileApp,
    isCompactWeb,
    contentMaxWidth,
    horizontalPadding,
  } = useChatHistoryLayout();

  const [selectedMessageId, setSelectedMessageId] = useState<string | null>(
    null,
  );

  const useCardRows = isMobileApp || isCompactWeb;
  const useWebPagedList = isWeb && !useCardRows;

  const {
    items,
    total,
    query,
    setQuery,
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
  } = useChatHistory({ paginationMode: useWebPagedList ? "paged" : "append" });

  const showSkeleton = loading && items.length === 0;
  const listIsEmpty = !loading && !error && items.length === 0;
  const tableClosed = showSkeleton || listIsEmpty;

  const tableShellStyle = isWeb
    ? {
        borderColor: colors.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        backgroundColor: colors.surface,
      }
    : null;

  const onSelectQuery = useCallback(
    (item: ChatQueryListItem) => {
      cacheChatQueryListItem(item);
      if (isMobileApp) {
        router.push(chatQueryDetailRoute(item.messageId));
        return;
      }
      setSelectedMessageId(item.messageId);
    },
    [isMobileApp, router],
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
        });
        const ok = await copyText(payload);
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
    [query, t, toast],
  );

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
          <ChatHistoryQueryRow
            item={item}
            variant="card"
            onPress={onSelectQuery}
          />
        );
      }
      return renderListRow(item);
    },
    [onSelectQuery, renderListRow, useCardRows],
  );

  const queriesSectionTitle = (
    <View
      style={{
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        gap: spacing.xxs,
        ...(isWeb && isWebParitySurfaces
          ? { backgroundColor: colors.surfaceMuted }
          : null),
        ...(isWeb && !tableClosed
          ? {
              borderBottomWidth: StyleSheet.hairlineWidth,
              borderBottomColor: colors.border,
            }
          : null),
      }}
    >
      <Text style={[typography.listSectionTitle, { color: colors.text }]}>
        {t("history.listTitle")}
      </Text>
      <Text style={[typography.listSectionDescription, { color: colors.textMuted }]}>
        {t("history.listDescription")}
      </Text>
    </View>
  );

  const mobileListHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.md }}>
      <ChatHistoryMobileToolbar
        query={query}
        onQueryChange={setQuery}
        exportDisabled={loading || items.length === 0}
        onExport={(format) => void handleExport(format)}
      />
      {queriesSectionTitle}
    </View>
  );

  const webChromeHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.sm, width: "100%" }}>
      {!isCompactWeb ? (
        <PageSectionHeader
          title={t("history.title")}
          subtitle={t("history.subtitle")}
        />
      ) : null}
      <ChatHistoryWebToolbar
        query={query}
        onQueryChange={setQuery}
        exportDisabled={loading || items.length === 0}
        onExport={(format) => void handleExport(format)}
      />
      {!useWebPagedList ? (
        <>
          {queriesSectionTitle}
          {showSkeleton ? <ChatHistorySkeleton rows={4} /> : null}
          {listIsEmpty && !showSkeleton ? (
            <View style={styles.emptyWrap}>
              <Text style={[typography.body, { color: colors.text, fontWeight: "500", textAlign: "center" }]}>
                {emptyLabel}
              </Text>
            </View>
          ) : null}
        </>
      ) : null}
    </View>
  );

  const listHeader = isWeb ? webChromeHeader : mobileListHeader;

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
      <View style={styles.emptyWrap}>
        <Text style={[typography.body, { color: colors.text, fontWeight: "500", textAlign: "center" }]}>
          {emptyLabel}
        </Text>
      </View>
    ) : null;

  if (error && items.length === 0) {
    return (
      <AppKeyboardAvoiding
        style={[styles.root, { backgroundColor: colors.background, padding: spacing.md }]}
        surface="screen"
      >
        {listHeader}
        <StatePanel loading={false} error={error} onRetry={reload}>
          {null}
        </StatePanel>
      </AppKeyboardAvoiding>
    );
  }

  const panelOpen = isWeb && Boolean(selectedMessageId);

  const scrollContentStyle = {
    paddingHorizontal: isWeb ? (horizontalPadding ?? spacing.md) : spacing.sm,
    paddingBottom: scrollBottomPadding,
    width: "100%" as const,
    maxWidth: contentMaxWidth,
    alignSelf: "center" as const,
  };

  if (useWebPagedList) {
    return (
      <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
        <AppScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, scrollContentStyle]}
          refreshControl={
            <RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />
          }
          keyboardShouldPersistTaps="handled"
        >
          {webChromeHeader}
          <PaginatedTablePanel
            panelRadius={panelRadius}
            closed={tableClosed}
            topSpacing={spacing.lg}
            scrollResetKey={`${page}-${pageSize}`}
            header={queriesSectionTitle}
            footer={!listIsEmpty ? paginationFooter : undefined}
          >
            {showSkeleton ? <ChatHistorySkeleton rows={6} /> : null}
            {listIsEmpty && !showSkeleton ? (
              <View style={styles.emptyWrap}>
                <Text style={[typography.body, { color: colors.text, fontWeight: "500", textAlign: "center" }]}>
                  {emptyLabel}
                </Text>
              </View>
            ) : null}
            {!showSkeleton && !listIsEmpty
              ? items.map((item) => <React.Fragment key={item.id}>{renderListRow(item)}</React.Fragment>)
              : null}
          </PaginatedTablePanel>
        </AppScrollView>

        <SidePanelOverlay
          visible={panelOpen}
          onClose={closeDetailPanel}
          width={overlayTokens.width.sideSheetLg}
          accessibilityLabel={t("history.detail.title")}
        >
          <ChatHistoryQueryDetailPanel messageId={selectedMessageId} onClose={closeDetailPanel} />
        </SidePanelOverlay>
      </AppKeyboardAvoiding>
    );
  }

  return (
    <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
      <AppPaginatedScreenList
        style={styles.list}
        data={showSkeleton ? [] : items}
        dataVersion={items.length}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={
          useCardRows ? () => <View style={{ height: spacing.sm }} /> : undefined
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        contentContainerStyle={[styles.listContent, scrollContentStyle]}
        refreshControl={
          <RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />
        }
        keyboardShouldPersistTaps="handled"
      />

      <SidePanelOverlay
        visible={panelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetLg}
        accessibilityLabel={t("history.detail.title")}
      >
        <ChatHistoryQueryDetailPanel messageId={selectedMessageId} onClose={closeDetailPanel} />
      </SidePanelOverlay>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  list: { flex: 1 },
  listContent: {},
  emptyWrap: {
    padding: 24,
  },
});
