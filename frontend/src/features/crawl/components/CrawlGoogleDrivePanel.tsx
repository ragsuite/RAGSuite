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
  CheckCircle2,
  FolderOpen,
  HardDrive,
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
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useGoogleDriveConnector } from "@/features/crawl/hooks/useGoogleDriveConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  GoogleDriveBrowseItem,
  GoogleDriveSourcesSelection,
} from "@/features/crawl/types/google-drive.types";
import {
  coerceSavedGoogleDriveRedirectUri,
  getGoogleDriveOAuthRedirectUri,
} from "@/features/crawl/utils/google-drive-oauth";
import { handleBrowseGoogleDrive } from "@/network/actions/google-drive.actions";
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

type DriveSelection = GoogleDriveSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlGoogleDrivePanel() {
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
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const toast = useStableToast();
  const { activeProjectId } = useActiveProject();
  const drive = useGoogleDriveConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getGoogleDriveOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<DriveSelection>({
    folders: [],
    files: [],
  });
  const [browseItems, setBrowseItems] = useState<GoogleDriveBrowseItem[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseParentId, setBrowseParentId] = useState("root");
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxFiles, setMaxFiles] = useState("100");
  const [maxSizeMb, setMaxSizeMb] = useState("50");

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
    if (!drive.credentials) return;
    if (drive.credentials.client_id) {
      setClientId(drive.credentials.client_id);
    }
    if (drive.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedGoogleDriveRedirectUri(drive.credentials.redirect_uri),
      );
    }
  }, [drive.credentials]);

  useEffect(() => {
    const settings = drive.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxFiles(String(settings.max_files ?? 100));
    setMaxSizeMb(String(settings.max_size_mb ?? 50));
  }, [drive.status?.settings]);

  const loadBrowse = useCallback(async () => {
    if (!activeProjectId || !drive.isConnected) return;
    setBrowseLoading(true);
    try {
      const items = await handleBrowseGoogleDrive(
        activeProjectId,
        browseParentId,
      );
      setBrowseItems(items);
    } catch (err) {
      showError(err, "googleDrive.browse.failed");
    } finally {
      setBrowseLoading(false);
    }
  }, [activeProjectId, browseParentId, drive.isConnected, showError]);

  useEffect(() => {
    if (drive.isConnected) {
      void loadBrowse();
    }
  }, [drive.isConnected, loadBrowse]);

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
    selection.folders.length > 0 || selection.files.length > 0;

  const toggleItem = useCallback((item: GoogleDriveBrowseItem) => {
    setSelection((current) => {
      if (item.kind === "folder") {
        const exists = current.folders.some((folder) => folder.id === item.id);
        return {
          ...current,
          folders: exists
            ? current.folders.filter((folder) => folder.id !== item.id)
            : [...current.folders, { id: item.id, name: item.name }],
        };
      }
      const exists = current.files.some((file) => file.id === item.id);
      return {
        ...current,
        files: exists
          ? current.files.filter((file) => file.id !== item.id)
          : [
              ...current.files,
              {
                id: item.id,
                name: item.name,
                mime_type: item.mime_type ?? undefined,
              },
            ],
      };
    });
  }, []);

  const isItemSelected = useCallback(
    (item: GoogleDriveBrowseItem) => {
      if (item.kind === "folder")
        return selection.folders.some((folder) => folder.id === item.id);
      return selection.files.some((file) => file.id === item.id);
    },
    [selection.files, selection.folders],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("googleDrive.toast.redirectCopied"));
    else notify(t("googleDrive.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await drive.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("googleDrive.toast.authOpened"));
    } catch (err) {
      showError(err, "googleDrive.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await drive.saveSources(selection);
      await drive.triggerSync();
      notify(
        t("googleDrive.toast.indexStarted", {
          count: selection.folders.length + selection.files.length,
        }),
      );
    } catch (err) {
      showError(err, "googleDrive.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    const message = t("googleDrive.confirm.disconnectMessage");
    return confirm({
      title: t("googleDrive.confirm.disconnectTitle"),
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
      await drive.disconnect();
      setSelection({ folders: [], files: [] });
      notify(t("googleDrive.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await drive.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_files: Number(maxFiles) || 100,
        max_size_mb: Number(maxSizeMb) || 50,
        exclude_images: drive.status?.settings?.exclude_images ?? true,
        exclude_videos: drive.status?.settings?.exclude_videos ?? true,
      });
      notify(t("googleDrive.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const statusIcon = useMemo(() => {
    const status = drive.status?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return null;
  }, [colors.danger, colors.success, colors.textMuted, drive.status?.status]);

  return (
    <View
      style={sectionStackStyle}
      accessibilityLabel="Google Drive integration"
    >
      <CrawlTabPanelHeader
        icon={HardDrive}
        title={t("googleDrive.title")}
        subtitle={t("googleDrive.description")}
        trailing={
          drive.isConnected ? (
            <ConfigurationOutlineButton
              label={t("googleDrive.refresh")}
              loading={drive.isLoadingStatus}
              onPress={() => void drive.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.googleDrive")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("googleDrive.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : drive.isLoadingStatus && !drive.status ? (
        <CrawlPanelCard title={t("crawl.tabs.googleDrive")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !drive.isConnected ? (
        <CrawlPanelCard
          title={t("googleDrive.connect.title")}
          subtitle={t("googleDrive.connect.subtitle")}
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
              <HardDrive size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("googleDrive.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("googleDrive.form.clientId")}
              placeholder={t("googleDrive.form.clientIdPlaceholder")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <AppTextField
              label={t("googleDrive.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <ConnectorRedirectUriField
              label={t("googleDrive.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("googleDrive.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("googleDrive.form.connect")}
              disabled={!canConnect || drive.isConnecting}
              loading={drive.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={drive.status?.account_label ?? t("crawl.tabs.googleDrive")}
            subtitle={t("googleDrive.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={drive.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(drive.status?.status)}
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
                    {
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                    },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("googleDrive.stats.filesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {drive.status?.documents_indexed ?? 0}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    statCardStyle,
                    {
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                    },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("googleDrive.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: drive.status?.settings?.cadence_minutes ?? 30,
                    })}
                  </Text>
                </View>
                <View
                  style={[
                    styles.statCard,
                    statCardStyle,
                    {
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                    },
                  ]}
                >
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("googleDrive.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      drive.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              {drive.status?.status === "ERROR" ? (
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
                    {t("googleDrive.error.banner")}
                  </Text>
                </View>
              ) : null}

              {drive.hasRunningJob ? (
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
                    {t("googleDrive.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={t("googleDrive.actions.refreshFiles")}
                  loading={browseLoading}
                  onPress={() => void loadBrowse()}
                  icon={ActionIcons.refresh}
                />
                {drive.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("googleDrive.actions.pause")}
                    loading={drive.actionPending}
                    onPress={() => void drive.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("googleDrive.actions.resume")}
                    loading={drive.actionPending}
                    onPress={() => void drive.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={drive.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                  icon={ActionIcons.disconnect}
                />
              </View>

              {drive.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    {
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                    },
                  ]}
                >
                  <CrawlStatusBadge
                    label={drive.latestJob.status}
                    tone={
                      drive.latestJob.status === "FAILED" ? "danger" : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("googleDrive.jobs.summary", {
                      fetched: drive.latestJob.files_fetched,
                      indexed: drive.latestJob.files_indexed,
                      skipped: drive.latestJob.files_skipped,
                    })}
                  </Text>
                  {drive.latestJobIsStale ? (
                    <Text
                      style={[typography.caption, { color: colors.danger }]}
                    >
                      {t("googleDrive.jobs.stale")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("googleDrive.sources.title")}
            subtitle={t("googleDrive.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("googleDrive.sources.indexSelected")}
                size="compact"
                loading={
                  drive.isSavingSources ||
                  drive.isSyncing ||
                  drive.hasRunningJob
                }
                disabled={!hasSelection || drive.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              {browseParentId !== "root" ? (
                <View style={[styles.toolbarRow, { gap: spacing.sm }]}>
                  <ConfigurationOutlineButton
                    label={t("googleDrive.sources.backToRoot")}
                    onPress={() => setBrowseParentId("root")}
                  />
                </View>
              ) : null}
              <StatePanel
                isEmpty={browseItems.length === 0}
                emptyLabel={t("googleDrive.sources.empty")}
                loading={browseLoading}
              >
                {browseItems.length > 0 ? (
                  <View
                    style={[
                      styles.itemList,
                      {
                        borderColor: colors.border,
                        borderRadius: surfaceRadius.card,
                      },
                    ]}
                  >
                    <AppScrollView
                      nestedScrollEnabled
                      scrollbarVariant="overlay"
                      style={styles.scrollList}
                    >
                      {browseItems.map((item) => {
                        const checked = isItemSelected(item);
                        return (
                          <Pressable
                            key={item.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            onPress={() => {
                              if (item.kind === "folder") {
                                toggleItem(item);
                              } else {
                                toggleItem(item);
                              }
                            }}
                            onLongPress={() => {
                              if (item.kind === "folder")
                                setBrowseParentId(item.id);
                            }}
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
                                {item.kind === "folder"
                                  ? t("googleDrive.sources.folder")
                                  : t("googleDrive.sources.file")}
                              </Text>
                            </View>
                            {item.kind === "folder" ? (
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={t(
                                  "googleDrive.sources.openFolderA11y",
                                  { name: item.name },
                                )}
                                onPress={() => setBrowseParentId(item.id)}
                                hitSlop={8}
                              >
                                <FolderOpen
                                  size={16}
                                  color={colors.textMuted}
                                />
                              </Pressable>
                            ) : null}
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
            title={t("googleDrive.settings.title")}
            subtitle={t("googleDrive.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("googleDrive.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("googleDrive.settings.maxFiles")}
                value={maxFiles}
                onChangeText={setMaxFiles}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("googleDrive.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <ConnectorPanelButton
                label={t("googleDrive.settings.save")}
                loading={drive.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("googleDrive.jobs.title")}
            subtitle={t("googleDrive.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={drive.jobs.length === 0}
              emptyLabel={t("googleDrive.jobs.empty")}
              loading={drive.isLoadingJobs}
            >
              {drive.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {drive.jobs.map((job) => (
                    <View
                      key={job.id}
                      style={[
                        styles.jobRow,
                        {
                          borderColor: colors.border,
                          borderRadius: surfaceRadius.card,
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
                        {t("googleDrive.jobs.summary", {
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
  toolbarRow: {
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

  jobRow: { borderWidth: 1, padding: 12, gap: 6 },
});
