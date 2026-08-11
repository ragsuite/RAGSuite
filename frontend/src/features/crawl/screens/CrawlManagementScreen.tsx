import { ActionIcons } from '@/shared/constants/action-icons';
import { useLocalSearchParams } from "expo-router";
import {
  BookOpen,
  Building2,
  FileText,
  Globe,
  HardDrive,
  Layers,
  Mail,
  MessageSquare,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo } from "react";
import { Platform, StyleSheet, View } from "react-native";

import { CrawlDocumentPanel } from "@/features/crawl/components/CrawlDocumentPanel";
import {
  CrawlDomainPanel,
  CrawlDomainStickyChrome,
} from "@/features/crawl/components/CrawlDomainPanel";
import { CrawlGmailPanel } from "@/features/crawl/components/CrawlGmailPanel";
import { CrawlGoogleDrivePanel } from "@/features/crawl/components/CrawlGoogleDrivePanel";
import { CrawlManagementSkeleton } from "@/features/crawl/components/CrawlManagementSkeleton";
import { CrawlNotionPanel } from "@/features/crawl/components/CrawlNotionPanel";
import { CrawlOverlayHost } from "@/features/crawl/components/CrawlOverlayHost";
import { CrawlSegmentTabs } from "@/features/crawl/components/CrawlSegmentTabs";
import { CrawlSharePointPanel } from "@/features/crawl/components/CrawlSharePointPanel";
import { CrawlSlackPanel } from "@/features/crawl/components/CrawlSlackPanel";
import { useCrawlLayout } from "@/features/crawl/hooks/useCrawlLayout";
import {
  CrawlProvider,
  useCrawlManagement,
} from "@/features/crawl/hooks/useCrawlManagement";
import { DocumentUploadProgressProvider } from "@/features/crawl/providers/document-upload-progress-provider";
import type { CrawlPrimaryTab } from "@/features/crawl/types/crawl.types";
import { CRAWL_SEGMENT_PERMISSIONS } from "@/features/organization/utils/workspace-permissions";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { useTranslation } from "@/i18n";
import { AppButton } from "@/shared/components/app-button";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { FeatureScreenScroll } from "@/shared/components/feature-screen-scroll";
import { PageSectionHeader } from "@/shared/components/surfaces/page-section-header";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ToastFeedbackBridge } from "@/shared/toast/toast-feedback-bridge";
import { CrawlConfluencePanel } from "../components/CrawlConfluencePanel";

function CrawlManagementContent() {
  const { t } = useTranslation();
  const { colors, spacing } = useAppTheme();
  const {
    showWebPageHeader,
    isCompactWebHeader,
    isNativeMobile,
    contentMaxWidth,
    horizontalPadding,
  } = useCrawlLayout();
  const {
    loading,
    refreshing,
    error,
    feedback,
    primaryTab,
    setPrimaryTab,
    refresh,
    clearFeedback,
  } = useCrawlManagement();
  const { hasPermission } = useActiveProject();
  const { segment } = useLocalSearchParams<{ segment?: string }>();

  const canViewCrawlSegment = useCallback(
    (tab: CrawlPrimaryTab) => {
      const required = CRAWL_SEGMENT_PERMISSIONS[tab];
      if (!required?.length) return true;
      return required.some((perm) => hasPermission(perm));
    },
    [hasPermission],
  );

  useEffect(() => {
    const value = typeof segment === "string" ? segment : "";
    const candidateTabs: CrawlPrimaryTab[] = [
      "domain",
      "document",
      "gmail",
      "google-drive",
      "notion",
      "confluence",
      "slack",
      "sharepoint",
    ];
    const allowed = candidateTabs.filter((tab) => canViewCrawlSegment(tab));
    if (allowed.includes(value as CrawlPrimaryTab)) {
      setPrimaryTab(value as CrawlPrimaryTab);
      return;
    }
    if (allowed.length > 0 && !canViewCrawlSegment(primaryTab)) {
      setPrimaryTab(allowed[0]);
    }
  }, [canViewCrawlSegment, primaryTab, segment, setPrimaryTab]);

  const primaryTabs = useMemo(
    () =>
      [
        { key: "domain" as const, label: t("crawl.tabs.domain"), icon: Globe },
        {
          key: "document" as const,
          label: t("crawl.tabs.document"),
          icon: FileText,
        },
        { key: "gmail" as const, label: t("crawl.tabs.gmail"), icon: Mail },
        {
          key: "google-drive" as const,
          label: t("crawl.tabs.googleDrive"),
          icon: HardDrive,
        },
        {
          key: "notion" as const,
          label: t("crawl.tabs.notion"),
          icon: BookOpen,
        },
        {
          key: "confluence" as const,
          label: t("crawl.tabs.confluence"),
          icon: Layers,
        },
        {
          key: "slack" as const,
          label: t("crawl.tabs.slack"),
          icon: MessageSquare,
        },
        {
          key: "sharepoint" as const,
          label: t("crawl.tabs.sharepoint"),
          icon: Building2,
        },
      ]
        .filter((tab) => canViewCrawlSegment(tab.key)),
    [canViewCrawlSegment, t],
  );

  const showSkeleton = loading;
  const showErrorOnly = Boolean(error) && !showSkeleton;

  const header = (
    <>
      {showWebPageHeader ? (
        <PageSectionHeader
          variant={isCompactWebHeader ? "compact" : "page"}
          title={t("crawl.title")}
          subtitle={t("crawl.description")}
          action={
            <AppButton
              label={t("common.retry")}
              accessibilityLabel={t("common.retry")}
              iconOnly
              icon={ActionIcons.refresh}
              variant="outline"
              size="compact"
              loading={refreshing}
              onPress={() => void refresh()}
            />
          }
        />
      ) : null}
      <View style={{ marginBottom: isNativeMobile ? spacing.xl : spacing.lg }}>
        <CrawlSegmentTabs
          tabs={primaryTabs}
          activeTab={primaryTab}
          onChange={setPrimaryTab}
          variant="primary"
          appearance="pill"
        />
      </View>
      {primaryTab === "domain" && isNativeMobile ? (
        <CrawlDomainStickyChrome />
      ) : null}
    </>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={horizontalPadding ?? spacing.sm}
        topPadding={
          showWebPageHeader
            ? isCompactWebHeader
              ? spacing.md
              : spacing.lg
            : spacing.sm
        }
        bottomPaddingExtra={Platform.OS === 'web' ? 0 : 56}
        refreshing={refreshing}
        onRefresh={() => void refresh()}
        header={header}
      >
        {showSkeleton ? (
          <CrawlManagementSkeleton />
        ) : showErrorOnly ? (
          <StatePanel error={error} onRetry={() => void refresh()}>
            {null}
          </StatePanel>
        ) : (
          <>
            {primaryTab === "domain" ? <CrawlDomainPanel /> : null}
            {primaryTab === "document" ? <CrawlDocumentPanel /> : null}
            {primaryTab === "gmail" ? <CrawlGmailPanel /> : null}
            {primaryTab === "google-drive" ? <CrawlGoogleDrivePanel /> : null}
            {primaryTab === "notion" ? <CrawlNotionPanel /> : null}
            {primaryTab === "confluence" ? <CrawlConfluencePanel /> : null}
            {primaryTab === "slack" ? <CrawlSlackPanel /> : null}
            {primaryTab === "sharepoint" ? <CrawlSharePointPanel /> : null}
          </>
        )}
      </FeatureScreenScroll>

      <ToastFeedbackBridge feedback={feedback} onDismiss={clearFeedback} />
      <CrawlOverlayHost />
    </View>
  );
}

export function CrawlManagementScreen() {
  return (
    <DocumentUploadProgressProvider>
      <CrawlProvider>
        <CrawlManagementContent />
      </CrawlProvider>
    </DocumentUploadProgressProvider>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  headerCopy: { flex: 1, gap: 4 },
  title: {
    fontSize: 28,
    fontWeight: "600",
  },
  titleCompact: {
    fontSize: 22,
  },
});
