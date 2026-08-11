import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Platform, RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppFlatList } from "@/shared/components/app-flat-list";
import { AppKeyboardAvoiding } from "@/shared/components/app-keyboard-avoiding";

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
import { AppCard, AppCardContent } from "@/shared/components/surfaces/app-card";
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
  } = useChatHistory();

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

  const webQueriesFrameStyle = isWeb
    ? {
        borderWidth: 1,
        borderColor: colors.border,
        borderTopLeftRadius: panelRadius,
        borderTopRightRadius: panelRadius,
        borderBottomWidth: tableClosed ? 1 : 0,
        borderBottomLeftRadius: tableClosed ? panelRadius : 0,
        borderBottomRightRadius: tableClosed ? panelRadius : 0,
        overflow: "hidden" as const,
        backgroundColor: colors.surface,
      }
    : null;

  const webListFooterShellStyle = isWeb
    ? {
        borderColor: colors.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderBottomLeftRadius: panelRadius,
        borderBottomRightRadius: panelRadius,
        backgroundColor: colors.surface,
        overflow: "hidden" as const,
        paddingTop: spacing.sm,
        paddingBottom: spacing.md,
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

  const useCardRows = isMobileApp || isCompactWeb;

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

      return (
        <View style={tableShellStyle}>
          <ChatHistoryQueryRow
            item={item}
            variant="list"
            selected={selectedMessageId === item.messageId}
            onPress={onSelectQuery}
          />
        </View>
      );
    },
    [onSelectQuery, selectedMessageId, tableShellStyle, useCardRows],
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

  const webListHeader = (
    <View style={{ gap: spacing.md, paddingTop: spacing.sm, width: "100%" }}>
      {!isCompactWeb ? (
        <PageSectionHeader
          title={t("history.title")}
          subtitle={t("history.subtitle")}
        />
      ) : null}
      {!isCompactWeb ? (
        <AppCard>
          <AppCardContent compact>
            <ChatHistoryWebToolbar
              query={query}
              onQueryChange={setQuery}
              exportDisabled={loading || items.length === 0}
              onExport={(format) => void handleExport(format)}
            />
          </AppCardContent>
        </AppCard>
      ) : (
        <ChatHistoryWebToolbar
          query={query}
          onQueryChange={setQuery}
          exportDisabled={loading || items.length === 0}
          onExport={(format) => void handleExport(format)}
        />
      )}
      {!useCardRows ? (
        <View style={webQueriesFrameStyle}>
          {queriesSectionTitle}
          {showSkeleton ? <ChatHistorySkeleton rows={6} /> : null}
          {listIsEmpty && !showSkeleton ? (
            <View style={styles.emptyWrap}>
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text,
                    fontWeight: "500",
                    textAlign: "center",
                  },
                ]}
              >
                {emptyLabel}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <>
          {queriesSectionTitle}
          {showSkeleton ? <ChatHistorySkeleton rows={4} /> : null}
          {listIsEmpty && !showSkeleton ? (
            <View
              style={[
                styles.emptyWrap,
                {
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: panelRadius,
                },
              ]}
            >
              <Text
                style={[
                  typography.body,
                  {
                    color: colors.text,
                    fontWeight: "500",
                    textAlign: "center",
                  },
                ]}
              >
                {emptyLabel}
              </Text>
            </View>
          ) : null}
        </>
      )}
    </View>
  );

  const listHeader = isWeb ? webListHeader : mobileListHeader;

  const listFooter =
    !showSkeleton && !listIsEmpty ? (
      isWeb && !useCardRows ? (
        <View style={webListFooterShellStyle}>
          <ChatHistoryLoadMore
            loadedCount={items.length}
            total={total}
            hasMore={hasMore}
            loadingMore={loadingMore}
            onLoadMore={() => void loadMore()}
          />
        </View>
      ) : (
        <ChatHistoryLoadMore
          loadedCount={items.length}
          total={total}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
        />
      )
    ) : null;

  const listEmptyComponent =
    listIsEmpty && isMobileApp ? (
      <View style={styles.emptyWrap}>
        <Text
          style={[
            typography.body,
            { color: colors.text, fontWeight: "500", textAlign: "center" },
          ]}
        >
          {emptyLabel}
        </Text>
      </View>
    ) : null;

  if (error && items.length === 0) {
    return (
      <AppKeyboardAvoiding
        style={[
          styles.root,
          { backgroundColor: colors.background, padding: spacing.md },
        ]}
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

  return (
    <AppKeyboardAvoiding
      style={[styles.root, { backgroundColor: colors.background }]}
      surface="screen"
    >
      <AppFlatList
        style={styles.list}
        data={showSkeleton ? [] : items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={
          useCardRows
            ? () => <View style={{ height: spacing.sm }} />
            : undefined
        }
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingHorizontal: isWeb
              ? (horizontalPadding ?? spacing.md)
              : spacing.sm,
            paddingBottom: scrollBottomPadding,
            width: "100%",
            maxWidth: contentMaxWidth,
            alignSelf: "center",
          },
        ]}
        refreshControl={
          <RefreshControl
            tintColor={colors.primary}
            refreshing={refreshing}
            onRefresh={refresh}
          />
        }
        keyboardShouldPersistTaps="handled"
      />

      <SidePanelOverlay
        visible={panelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetLg}
        accessibilityLabel={t("history.detail.title")}
      >
        <ChatHistoryQueryDetailPanel
          messageId={selectedMessageId}
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
  emptyWrap: {
    padding: 24,
  },
});
