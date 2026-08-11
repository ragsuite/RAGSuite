import { FileText, LayoutGrid, List } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from "react-native";
import { AppScrollView } from "@/shared/components/app-scroll-view";

import { CrawlDocumentCard } from "@/features/crawl/components/CrawlDocumentCard";
import { CrawlDocumentListHeader } from "@/features/crawl/components/CrawlDocumentListHeader";
import { CrawlDocumentListRow } from "@/features/crawl/components/CrawlDocumentListRow";
import { CrawlFilterSelect } from "@/features/crawl/components/CrawlFilterSelect";
import { CrawlMobileFilterSection } from "@/features/crawl/components/CrawlMobileFilterSection";
import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlSearchField } from "@/features/crawl/components/CrawlSearchField";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { DocumentBulkActionBar } from "@/features/crawl/components/DocumentBulkActionBar";
import { useCrawlLayout } from "@/features/crawl/hooks/useCrawlLayout";
import { useCrawlManagement } from "@/features/crawl/hooks/useCrawlManagement";
import type {
  CrawlDocument,
  DocumentFilters,
} from "@/features/crawl/types/crawl.types";
import {
  CRAWL_DOCUMENT_LIST,
  CRAWL_TABLE_SCROLL_BREAKPOINT,
} from "@/features/crawl/utils/crawl-layout";
import {
  CRAWL_MOBILE_TOUCH_MIN,
  useCrawlCompactLayout,
} from "@/features/crawl/utils/crawl-mobile";
import { buildCoverageByDocumentId } from "@/features/crawl/utils/document-api-mappers";
import { filterUploadDocumentsList } from "@/features/crawl/utils/document-filter-utils";
import { computeUploadDocumentStats } from "@/features/crawl/utils/document-gmail-utils";
import { useTranslation } from "@/i18n";
import { AppButton } from "@/shared/components/app-button";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";

const EMPTY_DOCUMENTS: CrawlDocument[] = [];

const GRID_ITEM_HALF = Platform.select({
  web: { width: "calc(50% - 8px)", maxWidth: "calc(50% - 8px)" },
  default: { flexBasis: "48%", maxWidth: "48%" },
}) as ViewStyle;

const GRID_ITEM_THIRD = Platform.select({
  web: { width: "calc(33.333% - 11px)", maxWidth: "calc(33.333% - 11px)" },
  default: { flexBasis: "31%", maxWidth: "31%" },
}) as ViewStyle;

export function CrawlDocumentPanel() {
  const { t } = useTranslation();
  const {
    colors,
    spacing,
    componentRadius,
    typography,
    surfaceRadius,
    isWebParitySurfaces,
  } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  const {
    bundle,
    documentFilters,
    documentView,
    selectedDocumentIds,
    saving,
    embeddingCoverage,
    reindexingDocuments,
    reindexProgress,
    reindexPollMask,
    reindexPollSnapshot,
    documentUploadProgress,
    isUploadingDocuments,
    setDocumentFilters,
    setDocumentView,
    toggleDocumentSelection,
    toggleSelectAllFilteredDocuments,
    openSheet,
    handleViewDocument,
    handleEditDocument,
    handleBulkReindexDocuments,
    clearDocumentSelection,
  } = useCrawlManagement();

  const documents = bundle?.documents ?? EMPTY_DOCUMENTS;
  const coverageByDocumentId = useMemo(
    () => buildCoverageByDocumentId(embeddingCoverage),
    [embeddingCoverage],
  );
  const uploadStats = useMemo(
    () => computeUploadDocumentStats(documents),
    [documents],
  );
  const filteredDocuments = useMemo(
    () => filterUploadDocumentsList(documents, documentFilters),
    [documents, documentFilters],
  );
  const allFilteredSelected =
    filteredDocuments.length > 0 &&
    filteredDocuments.every((doc) => selectedDocumentIds.includes(doc.id));
  const missingCoverageCount = useMemo(
    () =>
      (embeddingCoverage?.documents ?? []).filter(
        (entry) => entry.missing_active,
      ).length,
    [embeddingCoverage],
  );
  const filterCount = [documentFilters.type, documentFilters.status].filter(
    (v) => v !== "all",
  ).length;
  const reindexProgressVisible = reindexingDocuments || reindexPollMask != null;
  const reindexDisplay = useMemo(() => {
    const dash = "—";
    const searchDone = reindexPollMask?.search
      ? String(
          (reindexPollSnapshot.search?.embedded ?? 0) +
            (reindexPollSnapshot.search?.skipped ?? 0) +
            (reindexPollSnapshot.search?.failed ?? 0),
        )
      : dash;
    const searchTotal =
      reindexPollMask?.search && reindexPollSnapshot.search != null
        ? String(reindexPollSnapshot.search.total)
        : reindexPollMask?.search
          ? "…"
          : dash;
    const chatDone = reindexPollMask?.chat
      ? String(
          (reindexPollSnapshot.chat?.embedded ?? 0) +
            (reindexPollSnapshot.chat?.skipped ?? 0) +
            (reindexPollSnapshot.chat?.failed ?? 0),
        )
      : dash;
    const chatTotal =
      reindexPollMask?.chat && reindexPollSnapshot.chat != null
        ? String(reindexPollSnapshot.chat.total)
        : reindexPollMask?.chat
          ? "…"
          : dash;
    const failed =
      (reindexPollSnapshot.search?.failed ?? 0) +
      (reindexPollSnapshot.chat?.failed ?? 0);
    return { searchDone, searchTotal, chatDone, chatTotal, failed };
  }, [reindexPollMask, reindexPollSnapshot]);
  const { width } = useCrawlLayout();
  const isCompact = useCrawlCompactLayout();
  const useDocumentListScroll =
    !isCompact && width < CRAWL_TABLE_SCROLL_BREAKPOINT;
  const gridColumns = width >= 1024 ? 3 : width >= 768 ? 2 : 1;

  const typeOptions = useMemo(
    () => [
      { key: "all", label: t("documents.filters.typeAll") },
      { key: "pdf", label: t("documents.filters.typePdf") },
      { key: "doc", label: t("documents.filters.typeDoc") },
      { key: "html", label: t("documents.filters.typeHtml") },
      { key: "txt", label: t("documents.filters.typeTxt") },
    ],
    [t],
  );

  const statusOptions = useMemo(
    () => [
      { key: "all", label: t("documents.filters.statusAll") },
      { key: "indexed", label: t("documents.status.indexed") },
      { key: "processing", label: t("documents.status.processing") },
      { key: "error", label: t("documents.status.error") },
    ],
    [t],
  );

  const uploadButton = (
    <AppButton
      variant="cta"
      size="compact"
      label={t("documents.upload")}
      icon={ActionIcons.upload}
      disabled={reindexProgressVisible || saving || isUploadingDocuments}
      onPress={() => openSheet({ type: "upload-document" })}
    />
  );

  const viewToggles = (
    <View
      style={styles.viewToggles}
      accessibilityRole="radiogroup"
      accessibilityLabel={t("documents.view.modeA11y")}
    >
      <ToggleIcon
        active={documentView === "grid"}
        icon={LayoutGrid}
        label={t("documents.view.grid")}
        onPress={() => setDocumentView("grid")}
      />
      <ToggleIcon
        active={documentView === "list"}
        icon={List}
        label={t("documents.view.list")}
        onPress={() => setDocumentView("list")}
      />
    </View>
  );

  const filterControls = (
    <>
      <CrawlFilterSelect
        accessibilityLabel={t("documents.filters.type")}
        value={documentFilters.type}
        options={typeOptions}
        onChange={(type) =>
          setDocumentFilters({
            ...documentFilters,
            type: type as DocumentFilters["type"],
          })
        }
      />
      <CrawlFilterSelect
        accessibilityLabel={t("documents.filters.status")}
        value={documentFilters.status}
        options={statusOptions}
        onChange={(status) =>
          setDocumentFilters({
            ...documentFilters,
            status: status as DocumentFilters["status"],
          })
        }
      />
    </>
  );

  const statsMeta =
    uploadStats.total === 0
      ? t("documents.indexSummaryEmpty")
      : `${t("documents.indexSummary", {
          total: uploadStats.total,
          indexed: uploadStats.indexed,
          chunks: uploadStats.chunks,
        })}${
          filteredDocuments.length !== uploadStats.total
            ? ` ${t("documents.indexSummaryVisible", {
                visible: filteredDocuments.length,
                total: uploadStats.total,
              })}`
            : ""
        }`;

  const documentHeader = (
    <CrawlTabPanelHeader
      icon={FileText}
      title={t("documents.title")}
      subtitle={t("documents.description")}
      meta={statsMeta}
      trailing={
        isCompact ? (
          <View style={styles.uploadRow}>
            {uploadButton}
            {viewToggles}
          </View>
        ) : (
          uploadButton
        )
      }
    />
  );

  const selectAllControl = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={
        allFilteredSelected
          ? t("documents.bulk.clearSelection")
          : t("documents.bulk.selectAll")
      }
      onPress={() =>
        toggleSelectAllFilteredDocuments(filteredDocuments.map((doc) => doc.id))
      }
      style={styles.bulkHit}
    >
      <Text
        style={[
          typography.caption,
          { color: colors.primary, fontWeight: "500" },
        ]}
      >
        {allFilteredSelected
          ? t("documents.bulk.clearSelection")
          : t("documents.bulk.selectAll")}
      </Text>
    </Pressable>
  );

  /** Compact: Select all + view toggles live above ActionIcons.upload. Wide: both stay in the filter row. */
  const toolbarTrailing = !isCompact ? (
    <>
      {selectAllControl}
      {viewToggles}
    </>
  ) : undefined;

  const listContent =
    documentView === "list" ? (
      <View
        style={[
          styles.listTable,
          useDocumentListScroll
            ? { minWidth: CRAWL_DOCUMENT_LIST.tableMinWidth }
            : null,
        ]}
        accessibilityRole="list"
      >
        {!isCompact ? <CrawlDocumentListHeader /> : null}
        {filteredDocuments.map((document, index) => (
          <CrawlDocumentListRow
            key={document.id}
            document={document}
            coverageEntry={coverageByDocumentId.get(document.id)}
            selected={selectedDocumentIds.includes(document.id)}
            isLast={index === filteredDocuments.length - 1}
            onToggleSelect={() => toggleDocumentSelection(document.id)}
            onPress={() => handleViewDocument(document.id)}
          />
        ))}
      </View>
    ) : (
      <View style={[styles.grid, { gap: spacing.md }]} accessibilityRole="list">
        {filteredDocuments.map((document) => (
          <View
            key={document.id}
            style={[
              styles.gridItem,
              gridColumns === 3
                ? GRID_ITEM_THIRD
                : gridColumns === 2
                  ? GRID_ITEM_HALF
                  : null,
            ]}
          >
            <CrawlDocumentCard
              document={document}
              coverageEntry={coverageByDocumentId.get(document.id)}
              selected={selectedDocumentIds.includes(document.id)}
              onToggleSelect={() => toggleDocumentSelection(document.id)}
              onView={() => handleViewDocument(document.id)}
              onEdit={() => handleEditDocument(document.id)}
              onDelete={() =>
                openSheet({
                  type: "confirm-delete-document",
                  documentId: document.id,
                })
              }
            />
          </View>
        ))}
      </View>
    );

  return (
    <View style={{ gap: spacing.md }} accessibilityLabel={t("documents.title")}>
      {documentHeader}

      {missingCoverageCount > 0 ? (
        <View
          style={[
            styles.coverageBanner,
            {
              borderColor: colors.border,
              backgroundColor: colors.surfaceMuted,
              borderRadius: controlRadius,
              padding: spacing.sm,
            },
          ]}
        >
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {missingCoverageCount === 1
              ? t("documents.coverage.missingBanner", {
                  count: missingCoverageCount,
                })
              : t("documents.coverage.missingBannerPlural", {
                  count: missingCoverageCount,
                })}
          </Text>
        </View>
      ) : null}

      {documentUploadProgress ? (
        <View
          style={[
            styles.coverageBanner,
            {
              borderColor: `${colors.primary}55`,
              backgroundColor: `${colors.primary}12`,
              borderRadius: controlRadius,
              padding: spacing.sm,
              gap: 4,
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              { color: colors.primary, fontWeight: "500" },
            ]}
          >
            {t("documents.uploadInProgressTitle")}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t("documents.uploadInProgressBody", {
              done: documentUploadProgress.done,
              total: documentUploadProgress.total,
            })}
            {documentUploadProgress.failed > 0
              ? ` ${t("documents.uploadFailedSoFar", { count: documentUploadProgress.failed })}`
              : ""}
          </Text>
        </View>
      ) : null}

      {reindexProgressVisible ? (
        <View
          style={[
            styles.coverageBanner,
            {
              borderColor: colors.primary,
              backgroundColor: `${colors.primary}14`,
              borderRadius: controlRadius,
              padding: spacing.sm,
              gap: 4,
            },
          ]}
        >
          <Text
            style={[
              typography.caption,
              { color: colors.primary, fontWeight: "500" },
            ]}
          >
            {t("documents.reindexInProgressTitle")}
          </Text>
          <Text style={[typography.caption, { color: colors.textMuted }]}>
            {t("documents.reindexInProgressBody", {
              searchDone: reindexDisplay.searchDone,
              searchTotal: reindexDisplay.searchTotal,
              chatDone: reindexDisplay.chatDone,
              chatTotal: reindexDisplay.chatTotal,
            })}
            {reindexDisplay.failed > 0
              ? ` ${t("documents.reindexFailedSoFar", { count: reindexDisplay.failed })}`
              : ""}
          </Text>
        </View>
      ) : null}

      <CrawlMobileFilterSection
        activeFilterCount={filterCount}
        accessibilityLabel={t("common.filter")}
        search={
          <CrawlSearchField
            value={documentFilters.query}
            onChangeText={(query) =>
              setDocumentFilters({ ...documentFilters, query })
            }
            placeholder={t("documents.search")}
            accessibilityLabel={t("documents.search")}
          />
        }
        filters={filterControls}
        trailing={toolbarTrailing}
      />

      {selectedDocumentIds.length > 0 ? (
        <DocumentBulkActionBar
          count={selectedDocumentIds.length}
          saving={saving}
          onReindex={() => void handleBulkReindexDocuments(selectedDocumentIds)}
          onDelete={() => openSheet({ type: "confirm-bulk-delete-documents" })}
          onClear={clearDocumentSelection}
        />
      ) : null}

      <View style={styles.listColumn}>
        <CrawlPanelCard
          title={t("documents.title")}
          inlineHeaderAction
          headerAction={isCompact ? selectAllControl : undefined}
        >
          <StatePanel
            isEmpty={filteredDocuments.length === 0 && documents.length > 0}
            emptyLabel={
              documentFilters.query
                ? t("documents.empty.search")
                : t("documents.empty.filter")
            }
          >
            {filteredDocuments.length === 0 && documents.length === 0 ? (
              <View style={[styles.empty, { gap: spacing.sm }]}>
                <View
                  style={[
                    styles.emptyIcon,
                    {
                      borderRadius: componentRadius.card,
                      backgroundColor: colors.surfaceMuted,
                    },
                  ]}
                >
                  <FileText size={36} color={colors.textMuted} />
                </View>
                <Text style={[typography.subtitle, { color: colors.text }]}>
                  {t("documents.empty.default")}
                </Text>
                <Text
                  style={[
                    typography.body,
                    { color: colors.textMuted, textAlign: "center" },
                  ]}
                >
                  {t("documents.empty.uploadHint")}
                </Text>
                <AppButton
                  label={t("documents.empty.action")}
                  onPress={() => openSheet({ type: "upload-document" })}
                  size="compact"
                />
              </View>
            ) : useDocumentListScroll && documentView === "list" ? (
              <AppScrollView horizontal showsHorizontalScrollIndicator>
                {listContent}
              </AppScrollView>
            ) : (
              listContent
            )}
          </StatePanel>
        </CrawlPanelCard>
      </View>
    </View>
  );
}

function ToggleIcon({
  active,
  icon: Icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentType<{ size?: number; color?: string }>;
  label: string;
  onPress: () => void;
}) {
  const { colors, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const controlRadius = surfaceRadius.button;
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      onPress={onPress}
      style={[
        styles.toggle,
        {
          borderColor: active ? colors.primary : colors.border,
          borderRadius: controlRadius,
          backgroundColor: active ? colors.surfaceMuted : colors.surface,
          width: 38,
          height: 38,
        },
      ]}
    >
      <Icon size={16} color={active ? colors.primary : colors.textMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  uploadRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    width: "100%",
  },
  viewToggles: {
    flexDirection: "row",
    gap: 6,
    flexShrink: 0,
  },
  toggle: {
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  bulkHit: {
    minHeight: CRAWL_MOBILE_TOUCH_MIN,
    justifyContent: "center",
    paddingHorizontal: 4,
  },
  coverageBanner: {
    borderWidth: 1,
  },
  listColumn: {
    flex: 1,
    minWidth: 0,
    width: "100%",
  },
  listTable: {
    overflow: "hidden",
  },
  empty: {
    alignItems: "center",
    paddingVertical: 28,
    paddingHorizontal: 12,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    width: "100%",
  },
  gridItem: {
    flexGrow: 1,
    flexBasis: "100%",
    maxWidth: "100%",
    minWidth: 0,
  },
});
