import { useRouter } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { RefreshControl, StyleSheet, View } from 'react-native';
import { AppPaginatedScreenList } from '@/shared/components/app-paginated-screen-list';
import { AppKeyboardAvoiding } from '@/shared/components/app-keyboard-avoiding';
import { AppScrollView } from '@/shared/components/app-scroll-view';

import { AuditLogEventDetailPanel } from '@/features/audit-logs/components/AuditLogEventDetailPanel';
import { AuditLogEventRow } from '@/features/audit-logs/components/AuditLogEventRow';
import { AuditLogsFilterSheet } from '@/features/audit-logs/components/AuditLogsFilterSheet';
import { AuditLogsLoadMore } from '@/features/audit-logs/components/AuditLogsLoadMore';
import { AuditLogsMobileToolbar } from '@/features/audit-logs/components/AuditLogsMobileToolbar';
import { AuditLogsSkeleton } from '@/features/audit-logs/components/AuditLogsSkeleton';
import { AuditLogsTableHeader } from '@/features/audit-logs/components/AuditLogsTableHeader';
import { AuditLogsWebToolbar } from '@/features/audit-logs/components/AuditLogsWebToolbar';
import { useAuditLogs } from '@/features/audit-logs/hooks/useAuditLogs';
import { cacheAuditEvent } from '@/features/audit-logs/services/audit-log.service';
import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';
import { auditEventDetailRoute } from '@/features/audit-logs/utils/audit-log-nav';
import { useAuditLogsLayout } from '@/features/audit-logs/utils/audit-log-layout';
import { useTranslation } from '@/i18n';
import { SidePanelOverlay } from '@/shared/components/adaptive/side-panel-overlay';
import { overlayTokens } from '@/shared/constants/overlay-tokens';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { ListPaginationFooter } from '@/shared/components/list-pagination-footer';
import { PaginatedTablePanel } from '@/shared/components/paginated-table-panel';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

export function AuditLogsScreen() {
  const { colors, spacing, surfaceRadius } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const panelRadius = surfaceRadius.card;
  const { t } = useTranslation();
  const router = useRouter();
  const {
    isNativeMobile: isMobileApp,
    useCardLayout,
    useFilterSheet,
    useTableLayout,
    needsTableHorizontalScroll,
    tableMinWidth,
    contentMaxWidth,
    horizontalPadding,
  } = useAuditLogsLayout();

  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [selectedPreview, setSelectedPreview] = useState<AuditEvent | null>(null);

  const {
    events,
    total,
    query,
    setQuery,
    project,
    setProject,
    category,
    setCategory,
    severity,
    setSeverity,
    status,
    setStatus,
    projectOptions,
    activeFilterCount,
    clearFilters,
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
  } = useAuditLogs({ paginationMode: useTableLayout ? 'paged' : 'append' });

  const showSkeleton = loading && events.length === 0;
  const listIsEmpty = !loading && !error && events.length === 0;
  const tableClosed = showSkeleton || listIsEmpty;

  const tableShellStyle = useTableLayout
    ? {
        borderColor: colors.border,
        borderLeftWidth: 1,
        borderRightWidth: 1,
        backgroundColor: colors.surface,
      }
    : null;

  const onSelectEvent = useCallback(
    (event: AuditEvent) => {
      cacheAuditEvent(event);
      if (isMobileApp) {
        router.push(auditEventDetailRoute(event.id));
        return;
      }
      setSelectedEventId(event.id);
      setSelectedPreview(event);
    },
    [isMobileApp, router],
  );

  const closeDetailPanel = useCallback(() => {
    setSelectedEventId(null);
    setSelectedPreview(null);
  }, []);

  const renderTableRow = useCallback(
    (item: AuditEvent) => (
      <View key={item.id} style={tableShellStyle}>
        <AuditLogEventRow
          event={item}
          layout="table"
          selected={selectedEventId === item.id}
          onPress={onSelectEvent}
        />
      </View>
    ),
    [onSelectEvent, selectedEventId, tableShellStyle],
  );

  const renderItem = useCallback(
    ({ item }: { item: AuditEvent }) => {
      if (useCardLayout) {
        return (
          <AuditLogEventRow
            event={item}
            layout="card"
            selected={!isMobileApp && selectedEventId === item.id}
            onPress={onSelectEvent}
          />
        );
      }

      const row = renderTableRow(item);

      if (!needsTableHorizontalScroll) return row;

      return (
        <AppScrollView
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ minWidth: tableMinWidth }}>
          {row}
        </AppScrollView>
      );
    },
    [
      isMobileApp,
      needsTableHorizontalScroll,
      onSelectEvent,
      renderTableRow,
      selectedEventId,
      tableMinWidth,
      useCardLayout,
    ],
  );

  const compactToolbar = (
    <AuditLogsMobileToolbar
      query={query}
      onQueryChange={setQuery}
      onOpenFilters={() => setFilterSheetVisible(true)}
      activeFilterCount={activeFilterCount}
    />
  );

  const webToolbar = (
    <AuditLogsWebToolbar
      query={query}
      onQueryChange={setQuery}
      project={project}
      onProjectChange={setProject}
      projectOptions={projectOptions}
      category={category}
      onCategoryChange={setCategory}
      severity={severity}
      onSeverityChange={setSeverity}
      status={status}
      onStatusChange={setStatus}
      activeFilterCount={activeFilterCount}
      onClearFilters={clearFilters}
    />
  );

  const mobileListHeader = (
    <View style={[styles.mobileHeader, { paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.sm }]}>
      {compactToolbar}
      {showSkeleton ? <AuditLogsSkeleton compact rows={4} inset /> : null}
    </View>
  );

  const webChromeHeader = (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' as const }}>
      {useTableLayout ? (
        <PageSectionHeader title={t('audit.title')} subtitle={t('audit.description')} />
      ) : null}
      {useFilterSheet ? compactToolbar : webToolbar}
      {!useTableLayout ? (
        <>
          {showSkeleton ? <AuditLogsSkeleton compact rows={4} inset /> : null}
          {listIsEmpty && !showSkeleton ? <EmptyStateView title={emptyLabel} variant="inline" /> : null}
        </>
      ) : null}
    </View>
  );

  const webListHeader = useTableLayout ? (
    webChromeHeader
  ) : (
    <View style={{ gap: spacing.sm, paddingTop: spacing.sm, width: '100%', maxWidth: contentMaxWidth, alignSelf: 'center' as const }}>
      {useFilterSheet ? compactToolbar : webToolbar}
      {showSkeleton ? <AuditLogsSkeleton compact rows={4} inset /> : null}
      {listIsEmpty && !showSkeleton ? <EmptyStateView title={emptyLabel} variant="inline" /> : null}
    </View>
  );

  const listHeader = isMobileApp ? mobileListHeader : webListHeader;

  const paginationFooter = (
    <ListPaginationFooter
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      loading={loading}
      onPageChange={setPage}
      onPageSizeChange={setPageSize}
      itemLabel={t('audit.pagination.itemLabel')}
    />
  );

  const listFooter =
    !showSkeleton && !listIsEmpty ? (
      useTableLayout ? null : (
        <AuditLogsLoadMore
          loadedCount={events.length}
          total={total}
          hasMore={hasMore}
          loadingMore={loadingMore}
          onLoadMore={() => void loadMore()}
        />
      )
    ) : null;

  const listEmptyComponent =
    listIsEmpty && useCardLayout && !showSkeleton ? (
      <EmptyStateView title={emptyLabel} variant="inline" />
    ) : null;

  if (error && events.length === 0) {
    return (
      <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
        {listHeader}
        <StatePanel loading={false} error={error} onRetry={reload}>
          {null}
        </StatePanel>
      </AppKeyboardAvoiding>
    );
  }

  const detailPanelOpen = !isMobileApp && Boolean(selectedEventId);

  const scrollContentStyle = {
    paddingHorizontal: isMobileApp ? spacing.sm : (horizontalPadding ?? spacing.md),
    paddingTop: isMobileApp ? 0 : spacing.sm,
    paddingBottom: scrollBottomPadding,
    width: '100%' as const,
    maxWidth: contentMaxWidth,
    alignSelf: 'center' as const,
    flexGrow: listIsEmpty && !useTableLayout ? 1 : undefined,
  };

  if (useTableLayout) {
    return (
      <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
        <AppScrollView
          style={styles.list}
          contentContainerStyle={[styles.listContent, scrollContentStyle]}
          refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />}
          keyboardShouldPersistTaps="handled">
          {webChromeHeader}
          <PaginatedTablePanel
            panelRadius={panelRadius}
            closed={tableClosed}
            topSpacing={spacing.lg}
            scrollResetKey={`${page}-${pageSize}`}
            horizontalScroll={needsTableHorizontalScroll}
            horizontalMinWidth={tableMinWidth}
            header={<AuditLogsTableHeader />}
            footer={!listIsEmpty ? paginationFooter : undefined}>
            {showSkeleton ? <AuditLogsSkeleton variant="table" rows={8} /> : null}
            {listIsEmpty && !showSkeleton ? <EmptyStateView title={emptyLabel} variant="inline" /> : null}
            {!showSkeleton && !listIsEmpty
              ? events.map((event) => (
                  <React.Fragment key={event.id}>{renderTableRow(event)}</React.Fragment>
                ))
              : null}
          </PaginatedTablePanel>
        </AppScrollView>

        {useFilterSheet ? (
          <AuditLogsFilterSheet
            visible={filterSheetVisible}
            onClose={() => setFilterSheetVisible(false)}
            project={project}
            onProjectChange={setProject}
            projectOptions={projectOptions}
            category={category}
            onCategoryChange={setCategory}
            severity={severity}
            onSeverityChange={setSeverity}
            status={status}
            onStatusChange={setStatus}
            activeFilterCount={activeFilterCount}
            onClearFilters={clearFilters}
          />
        ) : null}

        <SidePanelOverlay
          visible={detailPanelOpen}
          onClose={closeDetailPanel}
          width={overlayTokens.width.sideSheetForm}
          accessibilityLabel={t('audit.detail.title')}>
          <AuditLogEventDetailPanel
            eventId={selectedEventId}
            previewEvent={selectedPreview}
            onClose={closeDetailPanel}
          />
        </SidePanelOverlay>
      </AppKeyboardAvoiding>
    );
  }

  return (
    <AppKeyboardAvoiding style={[styles.root, { backgroundColor: colors.background }]} surface="screen">
      <AppPaginatedScreenList
        style={styles.list}
        data={showSkeleton ? [] : events}
        dataVersion={events.length}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        listHeaderStyle={isMobileApp ? styles.mobileListHeaderStyle : undefined}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={listFooter}
        contentContainerStyle={[styles.listContent, scrollContentStyle]}
        refreshControl={<RefreshControl tintColor={colors.primary} refreshing={refreshing} onRefresh={refresh} />}
        keyboardShouldPersistTaps="handled"
        ItemSeparatorComponent={useCardLayout ? () => <View style={{ height: spacing.sm }} /> : undefined}
      />

      {useFilterSheet ? (
        <AuditLogsFilterSheet
          visible={filterSheetVisible}
          onClose={() => setFilterSheetVisible(false)}
          project={project}
          onProjectChange={setProject}
          projectOptions={projectOptions}
          category={category}
          onCategoryChange={setCategory}
          severity={severity}
          onSeverityChange={setSeverity}
          status={status}
          onStatusChange={setStatus}
          activeFilterCount={activeFilterCount}
          onClearFilters={clearFilters}
        />
      ) : null}

      <SidePanelOverlay
        visible={detailPanelOpen}
        onClose={closeDetailPanel}
        width={overlayTokens.width.sideSheetForm}
        accessibilityLabel={t('audit.detail.title')}>
        <AuditLogEventDetailPanel
          eventId={selectedEventId}
          previewEvent={selectedPreview}
          onClose={closeDetailPanel}
        />
      </SidePanelOverlay>
    </AppKeyboardAvoiding>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  listContent: {},
  mobileHeader: {},
  mobileListHeaderStyle: {
    margin: 0,
    padding: 0,
  },
});
