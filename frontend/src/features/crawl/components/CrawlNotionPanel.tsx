import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  AlertCircle,
  BookOpen,
  CheckCircle2,
  Pause,
  Play,
} from "lucide-react-native";

import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { ConnectorPanelButton } from "@/features/crawl/components/ConnectorPanelButton";
import {
  ConnectorRedirectUriField,
  connectorCredentialInputStyle,
} from "@/features/crawl/components/ConnectorRedirectUriField";
import { CrawlSearchField } from "@/features/crawl/components/CrawlSearchField";
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useNotionConnector } from "@/features/crawl/hooks/useNotionConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  NotionSearchItem,
  NotionSourcesSelection,
} from "@/features/crawl/types/notion.types";
import {
  coerceSavedNotionRedirectUri,
  getNotionOAuthRedirectUri,
} from "@/features/crawl/utils/notion-oauth";
import { handleSearchNotion } from "@/network/actions/notion.actions";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { resolveAppErrorMessage, useTranslation } from "@/i18n";
import { AppButton } from "@/shared/components/app-button";
import { AppCheckboxMark } from "@/shared/components/app-checkbox-mark";
import { AppScrollView } from "@/shared/components/app-scroll-view";
import { AppTextField } from "@/shared/components/app-text-field";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { copyText } from "@/shared/utils/copy-text";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";
import { useConfirm } from "@/shared/confirm/confirm-provider";
import { useStableToast } from "@/shared/toast/use-toast-ref";

function formatSyncDate(
  iso: string | null | undefined,
  neverLabel: string,
): string {
  if (!iso) return neverLabel;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
}

function integrationStatusTone(
  status: string | undefined,
): "default" | "muted" | "danger" {
  if (status === "ACTIVE") return "default";
  if (status === "ERROR") return "danger";
  return "muted";
}

type NotionSelection = NotionSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlNotionPanel() {
  const { colors, spacing, typography, componentRadius, surfaceRadius } =
    useAppTheme();
  const {
    sectionStackStyle,
    panelBodyStyle,
    panelBodyLooseStyle,
    listRowStyle,
    statCardStyle,
    emptyConnectStyle,
  } = useCrawlPanelChrome();
  const controlRadius = surfaceRadius.button;
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useStableToast();
  const { activeProjectId } = useActiveProject();
  const notion = useNotionConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getNotionOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<NotionSelection>({
    pages: [],
    databases: [],
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [searchItems, setSearchItems] = useState<NotionSearchItem[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxPages, setMaxPages] = useState("100");
  const [maxBlocks, setMaxBlocks] = useState("500");
  const [maxDbRows, setMaxDbRows] = useState("100");
  const [maxSizeMb, setMaxSizeMb] = useState("50");
  const [includeAttachments, setIncludeAttachments] = useState(true);
  const [includeComments, setIncludeComments] = useState(true);

  const notify = useCallback(
    (message: string, variant: "success" | "error" = "success") => {
      toast({ description: message, variant });
    },
    [toast],
  );

  const showError = useCallback(
    (err: unknown, fallback: string) => {
      toast({
        description: resolveAppErrorMessage(err, t, fallback),
        variant: "error",
      });
    },
    [t, toast],
  );

  useEffect(() => {
    if (!notion.credentials) return;
    if (notion.credentials.client_id) setClientId(notion.credentials.client_id);
    if (notion.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedNotionRedirectUri(notion.credentials.redirect_uri),
      );
    }
  }, [notion.credentials]);

  useEffect(() => {
    const settings = notion.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxPages(String(settings.max_pages ?? 100));
    setMaxBlocks(String(settings.max_blocks_per_page ?? 500));
    setMaxDbRows(String(settings.max_db_rows ?? 100));
    setMaxSizeMb(String(settings.max_size_mb ?? 50));
    setIncludeAttachments(settings.include_attachments ?? true);
    setIncludeComments(settings.include_comments ?? true);
  }, [notion.status?.settings]);

  const loadSearch = useCallback(async () => {
    if (!activeProjectId || !notion.isConnected) return;
    setSearchLoading(true);
    try {
      const items = await handleSearchNotion(
        activeProjectId,
        searchQuery.trim(),
      );
      setSearchItems(items);
    } catch (err) {
      showError(err, "notion.search.failed");
    } finally {
      setSearchLoading(false);
    }
  }, [activeProjectId, notion.isConnected, searchQuery, showError]);

  useEffect(() => {
    if (notion.isConnected) {
      void loadSearch();
    }
  }, [loadSearch, notion.isConnected]);

  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();
  const trimmedRedirectUri = redirectUri.trim();
  const canConnect = Boolean(
    trimmedClientId &&
    trimmedClientSecret &&
    trimmedRedirectUri &&
    activeProjectId,
  );
  const hasSelection =
    selection.pages.length > 0 || selection.databases.length > 0;

  const toggleItem = useCallback((item: NotionSearchItem) => {
    setSelection((current) => {
      if (item.kind === "page") {
        const exists = current.pages.some((page) => page.id === item.id);
        return {
          ...current,
          pages: exists
            ? current.pages.filter((page) => page.id !== item.id)
            : [...current.pages, { id: item.id, name: item.name }],
        };
      }
      const exists = current.databases.some((db) => db.id === item.id);
      return {
        ...current,
        databases: exists
          ? current.databases.filter((db) => db.id !== item.id)
          : [...current.databases, { id: item.id, name: item.name }],
      };
    });
  }, []);

  const isItemSelected = useCallback(
    (item: NotionSearchItem) => {
      if (item.kind === "page")
        return selection.pages.some((page) => page.id === item.id);
      return selection.databases.some((db) => db.id === item.id);
    },
    [selection.databases, selection.pages],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("notion.toast.redirectCopied"));
    else notify(t("notion.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await notion.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("notion.toast.authOpened"));
    } catch (err) {
      showError(err, "notion.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await notion.saveSources(selection);
      await notion.triggerSync();
      notify(
        t("notion.toast.indexStarted", {
          count: selection.pages.length + selection.databases.length,
        }),
      );
    } catch (err) {
      showError(err, "notion.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    const message = t("notion.confirm.disconnectMessage");
    return confirm({
      title: t("notion.confirm.disconnectTitle"),
      message,
      cancelLabel: t("common.cancel"),
      confirmLabel: t("common.disconnect"),
      destructive: true,
    });
  }, [confirm, t]);

  const handleDisconnect = async () => {
    const confirmed = await confirmDisconnect();
    if (!confirmed) return;
    try {
      await notion.disconnect();
      setSelection({ pages: [], databases: [] });
      notify(t("notion.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await notion.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_pages: Number(maxPages) || 100,
        max_blocks_per_page: Number(maxBlocks) || 500,
        max_db_rows: Number(maxDbRows) || 100,
        max_size_mb: Number(maxSizeMb) || 50,
        max_attachments_per_page:
          notion.status?.settings?.max_attachments_per_page ?? 20,
        max_comments_per_page:
          notion.status?.settings?.max_comments_per_page ?? 100,
        include_attachments: includeAttachments,
        include_comments: includeComments,
      });
      notify(t("notion.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const statusIcon = useMemo(() => {
    const status = notion.status?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return null;
  }, [colors.danger, colors.success, colors.textMuted, notion.status?.status]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="Notion integration">
      <CrawlTabPanelHeader
        icon={BookOpen}
        title={t("notion.title")}
        subtitle={t("notion.description")}
        trailing={
          notion.isConnected ? (
            <ConfigurationOutlineButton
              label={t("notion.refresh")}
              loading={notion.isLoadingStatus}
              onPress={() => void notion.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.notion")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("notion.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : notion.isLoadingStatus && !notion.status ? (
        <CrawlPanelCard title={t("crawl.tabs.notion")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !notion.isConnected ? (
        <CrawlPanelCard
          title={t("notion.connect.title")}
          subtitle={t("notion.connect.subtitle")}
        >
          <View style={[styles.emptyConnect, emptyConnectStyle]}>
            <View
              style={[
                styles.emptyIcon,
                {
                  borderRadius: surfaceRadius.button,
                  backgroundColor: colors.surfaceMuted,
                },
              ]}
            >
              <BookOpen size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("notion.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("notion.form.clientId")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <AppTextField
              label={t("notion.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <ConnectorRedirectUriField
              label={t("notion.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("notion.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("notion.form.connect")}
              disabled={!canConnect || notion.isConnecting}
              loading={notion.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={notion.status?.account_label ?? t("crawl.tabs.notion")}
            subtitle={t("notion.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={notion.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(notion.status?.status)}
                preserveCase
              />
            }
          >
            <View style={panelBodyLooseStyle}>
              <View style={[styles.statsGrid, { gap: spacing.sm }]}>
                <View
                  style={[
                    styles.statCard,
                    statCardStyle,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("notion.stats.pagesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {notion.status?.documents_indexed ?? 0}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    statCardStyle,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("notion.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: notion.status?.settings?.cadence_minutes ?? 30,
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    statCardStyle,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("notion.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      notion.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              {notion.status?.status === "ERROR" ? (
                <View
                  style={[
                    styles.banner,
                    {
                      borderColor: colors.danger,
                      borderRadius: componentRadius.card,
                      backgroundColor: `${colors.danger}14`,
                    },
                  ]}
                >
                  {statusIcon}
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.danger, flex: 1 },
                    ]}
                  >
                    {t("notion.error.banner")}
                  </Text>
                </View>
              ) : null}

              {notion.hasRunningJob ? (
                <View
                  style={[
                    styles.banner,
                    {
                      borderColor: colors.primary,
                      borderRadius: componentRadius.card,
                      backgroundColor: `${colors.primary}14`,
                    },
                  ]}
                >
                  <ActivityIndicator size="small" color={colors.primary} />
                  <Text
                    style={[
                      typography.caption,
                      { color: colors.primary, flex: 1 },
                    ]}
                  >
                    {t("notion.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={t("notion.actions.refreshList")}
                  loading={searchLoading}
                  onPress={() => void loadSearch()}
                  icon={ActionIcons.refresh}
                />
                {notion.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("notion.actions.pause")}
                    loading={notion.actionPending}
                    onPress={() => void notion.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("notion.actions.resume")}
                    loading={notion.actionPending}
                    onPress={() => void notion.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={notion.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                  icon={ActionIcons.disconnect}
                />
              </View>

              {notion.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <CrawlStatusBadge
                    label={notion.latestJob.status}
                    tone={
                      notion.latestJob.status === "FAILED" ? "danger" : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("notion.jobs.summary", {
                      fetched: notion.latestJob.files_fetched,
                      indexed: notion.latestJob.files_indexed,
                      skipped: notion.latestJob.files_skipped,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("notion.sources.title")}
            subtitle={t("notion.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("notion.sources.indexSelected")}
                size="compact"
                loading={
                  notion.isSavingSources ||
                  notion.isSyncing ||
                  notion.hasRunningJob
                }
                disabled={!hasSelection || notion.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              <View style={[styles.searchRow, { gap: spacing.sm }]}>
                <CrawlSearchField
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder={t("notion.sources.searchPlaceholder")}
                  accessibilityLabel={t("notion.sources.searchPlaceholder")}
                  onSubmitEditing={() => void loadSearch()}
                />
                <ConfigurationOutlineButton
                  label={t("notion.sources.searchAction")}
                  loading={searchLoading}
                  onPress={() => void loadSearch()}
                />
              </View>
              <StatePanel
                isEmpty={searchItems.length === 0}
                emptyLabel={t("notion.sources.empty")}
                loading={searchLoading}
              >
                {searchItems.length > 0 ? (
                  <View
                    style={[
                      styles.itemList,
                      {
                        borderColor: colors.border,
                        borderRadius: controlRadius,
                      },
                    ]}
                  >
                    <AppScrollView
                      nestedScrollEnabled
                      scrollbarVariant="overlay"
                      style={styles.scrollList}
                    >
                      {searchItems.map((item) => {
                        const checked = isItemSelected(item);
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            onPress={() => toggleItem(item)}
                            style={({ pressed, hovered }) => [
                              styles.itemRow,
                              listRowStyle,
                              {
                                borderColor: colors.border,
                                backgroundColor: pressed
                                  ? colors.surfaceMuted
                                  : hovered
                                    ? colors.surfaceHover
                                    : colors.surface,
                              },
                            ]}
                          >
                            <AppCheckboxMark checked={checked} />
                            <View style={{ flex: 1, gap: 2 }}>
                              <Text
                                style={[
                                  typography.body,
                                  { color: colors.text, fontWeight: "500" },
                                ]}
                                numberOfLines={1}
                              >
                                {item.name}
                              </Text>
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.textMuted },
                                ]}
                              >
                                {item.kind === "page"
                                  ? t("notion.sources.page")
                                  : t("notion.sources.database")}
                                {item.parent_name
                                  ? ` · ${item.parent_name}`
                                  : ""}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </AppScrollView>
                  </View>
                ) : null}
              </StatePanel>
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("notion.settings.title")}
            subtitle={t("notion.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("notion.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("notion.settings.maxPages")}
                value={maxPages}
                onChangeText={setMaxPages}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("notion.settings.maxBlocks")}
                value={maxBlocks}
                onChangeText={setMaxBlocks}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("notion.settings.maxDbRows")}
                value={maxDbRows}
                onChangeText={setMaxDbRows}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("notion.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeAttachments }}
                onPress={() => setIncludeAttachments((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={includeAttachments} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("notion.settings.includeAttachments")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeComments }}
                onPress={() => setIncludeComments((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={includeComments} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("notion.settings.includeComments")}
                </Text>
              </Pressable>
              <ConnectorPanelButton
                label={t("notion.settings.save")}
                loading={notion.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("notion.jobs.title")}
            subtitle={t("notion.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={notion.jobs.length === 0}
              emptyLabel={t("notion.jobs.empty")}
              loading={notion.isLoadingJobs}
            >
              {notion.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {notion.jobs.map((job) => (
                    <View
                      key={job.id}
                      style={[
                        styles.jobRow,
                        {
                          borderColor: colors.border,
                          borderRadius: controlRadius,
                        },
                      ]}
                    >
                      <CrawlStatusBadge
                        label={job.status}
                        tone={job.status === "FAILED" ? "danger" : "muted"}
                        preserveCase
                      />
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.textMuted },
                        ]}
                      >
                        {t("notion.jobs.summary", {
                          fetched: job.files_fetched,
                          indexed: job.files_indexed,
                          skipped: job.files_skipped,
                        })}
                      </Text>
                      <Text
                        style={[
                          typography.caption,
                          { color: colors.textMuted },
                        ]}
                      >
                        {formatSyncDate(
                          job.finished_at ?? job.started_at ?? job.queued_at,
                          t("common.never"),
                        )}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </StatePanel>
          </CrawlPanelCard>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyConnect: { alignItems: "center", gap: 10, paddingTop: 8 },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  statsGrid: { flexDirection: "row", flexWrap: "wrap" },
  statCard: {
    flexGrow: 1,
    flexBasis: "45%",
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center" },
  searchRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    width: "100%",
  },
  itemList: { borderWidth: 1, overflow: "hidden" },
  scrollList: { maxHeight: CONNECTOR_LIST_MAX_HEIGHT },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobRow: { borderWidth: 1, padding: 12, gap: 6 },
});
