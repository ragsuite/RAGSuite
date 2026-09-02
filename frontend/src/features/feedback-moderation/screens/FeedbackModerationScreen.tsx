import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import { AppFlatList } from "@/shared/components/app-flat-list";
import { AppKeyboardAvoiding } from "@/shared/components/app-keyboard-avoiding";
import { AppScrollView } from "@/shared/components/app-scroll-view";

import { FeedbackDetailPanel } from "@/features/feedback-moderation/components/FeedbackDetailPanel";
import { FeedbackEntriesSectionHeader } from "@/features/feedback-moderation/components/FeedbackEntriesSectionHeader";
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
import { deliverFeedbackModerationExport } from "@/features/feedback-moderation/utils/feedback-export";
import { feedbackDetailRoute } from "@/features/feedback-moderation/utils/feedback-nav";
import { resolveTopNegativeReasons } from "@/features/feedback-moderation/utils/feedback-negative-reasons";
import { useFeedbackLayout } from "@/features/feedback-moderation/utils/feedback-layout";
import { useTranslation } from "@/i18n";
import { SidePanelOverlay } from "@/shared/components/adaptive/side-panel-overlay";
import { overlayTokens } from "@/shared/constants/overlay-tokens";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { ListPaginationFooter } from "@/shared/components/list-pagination-footer";
import { PaginatedTablePanel } from "@/shared/components/paginated-table-panel";
import { AppCard, AppCardContent } from "@/shared/components/surfaces/app-card";
import { PageSectionHeader } from "@/shared/components/surfaces/page-section-header";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { useScrollBottomPadding } from "@/shared/hooks/use-scroll-bottom-padding";
import { useStableToast } from "@/shared/toast/use-toast-ref";

export function FeedbackModerationScreen() {
  const { colors, spacing, typography, surfaceRadius, isWebParitySurfaces } =
    useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const toast = useStableToast();
  const router = useRouter();
  const {
    isWeb,
    isNativeMobile,
    isCompactWeb,
    contentMaxWidth,
    horizontalPadding,
  } = useFeedbackLayout();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] =
    useState<FeedbackListItem | null>(null);
  const [exporting, setExporting] = useState(false);

  const useListShell = isWeb && isWebParitySurfaces;

  const {
    summary,
    items,
    total,
    query,
    setQuery,
    voteFilter,
    setVoteFilter,
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
  } = useFeedbackModeration({ paginationMode: useListShell ? "paged" : "append" });

  const showSkeleton = loading && items.length === 0;
  const listIsEmpty = !loading && !error && items.length === 0;
  const tableClosed = showSkeleton || listIsEmpty;
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
        if (delivery !== "share") {
          toast({
            description: t("feedbackModeration.toast.exported"),
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
    [exporting, query, toast, voteFilter, t],
  );

  const exportDisabled =
    exporting || loading || (summary?.totalCount ?? 0) === 0;

  const onModerationSaved = useCallback(
    (id: string, patch: { reviewed: boolean; flagged: boolean }) => {
      patchListItem(id, patch);
      void refreshSummary();
    },
    [patchListItem, refreshSummary],
  );

  const toolbarProps = {
    query,
    onQueryChange: setQuery,
    voteFilter,
    onVoteFilterChange: setVoteFilter,
    exportDisabled,
    exporting,
    onExport: (format: "csv" | "json") => void handleExport(format),
  };

  const chromeHeader = (
    <View
      style={{
        gap: spacing.md,
        paddingTop: isNativeMobile ? spacing.sm : spacing.sm,
        width: "100%",
      }}
    >
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
      {isWeb ? (
        !isCompactWeb ? (
          <AppCard>
            <AppCardContent compact>
              <FeedbackWebToolbar {...toolbarProps} />
            </AppCardContent>
          </AppCard>
        ) : (
          <FeedbackWebToolbar {...toolbarProps} />
        )
      ) : null}
      {isNativeMobile ? <FeedbackMobileToolbar {...toolbarProps} /> : null}
      {!useListShell ? (
        <>
          <FeedbackEntriesSectionHeader />
          {showSkeleton ? <FeedbackSkeleton rows={isNativeMobile ? 3 : 4} /> : null}
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

  const renderListRow = useCallback(
    (item: FeedbackListItem) => (
      <View
        key={item.id}
        style={{
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
        }}
      >
        <FeedbackEntryRow
          item={item}
          variant="list"
          selected={!isNativeMobile && selectedId === item.id}
          onPress={onSelect}
        />
        <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />
      </View>
    ),
    [colors.border, colors.surface, isNativeMobile, onSelect, selectedId],
  );

  const renderItem = useCallback(
    ({ item }: { item: FeedbackListItem }) => (
      <View
        style={
          useListShell
            ? {
                borderLeftWidth: 1,
                borderRightWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.surface,
              }
            : undefined
        }
      >
        <FeedbackEntryRow
          item={item}
          variant={useListShell ? "list" : "card"}
          selected={!isNativeMobile && selectedId === item.id}
          onPress={onSelect}
        />
      </View>
    ),
    [colors.border, colors.surface, isNativeMobile, onSelect, selectedId, useListShell],
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

  const listHeader = chromeHeader;

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

  if (useListShell) {
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
          {chromeHeader}
          <PaginatedTablePanel
            panelRadius={panelRadius}
            closed={tableClosed}
            topSpacing={spacing.lg}
            scrollResetKey={`${page}-${pageSize}`}
            header={<FeedbackEntriesSectionHeader banded />}
            footer={!listIsEmpty ? paginationFooter : undefined}
          >
            {showSkeleton ? <FeedbackSkeleton rows={4} /> : null}
            {listIsEmpty && !showSkeleton ? (
              <View style={styles.emptyWrap}>
                <Text style={[typography.body, { color: colors.text, fontWeight: "500", textAlign: "center" }]}>
                  {emptyLabel}
                </Text>
              </View>
            ) : null}
            {!showSkeleton && !listIsEmpty ? items.map((item) => renderListRow(item)) : null}
          </PaginatedTablePanel>
        </AppScrollView>

        <SidePanelOverlay
          visible={panelOpen}
          onClose={closeDetailPanel}
          width={overlayTokens.width.sideSheetLg}
          accessibilityLabel={t("feedbackModeration.detail.title")}
        >
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

  return (
    <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
      <AppFlatList
        style={styles.list}
        data={showSkeleton ? [] : items}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
        ListHeaderComponent={listHeader}
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

      <SidePanelOverlay
        visible={panelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetLg}
        accessibilityLabel={t("feedbackModeration.detail.title")}
      >
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
  emptyWrap: {
    padding: 24,
  },
});
