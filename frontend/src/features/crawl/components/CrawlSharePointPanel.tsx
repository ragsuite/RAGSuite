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
  Building2,
  CheckCircle2,
  FolderOpen,
  Pause,
  Play,
} from "lucide-react-native";

import { ConnectorPanelButton } from "@/features/crawl/components/ConnectorPanelButton";
import { ConnectorRedirectUriField } from "@/features/crawl/components/ConnectorRedirectUriField";
import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useSharePointConnector } from "@/features/crawl/hooks/useSharePointConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  SharePointDrive,
  SharePointSite,
  SharePointSourcesSelection,
} from "@/features/crawl/types/sharepoint.types";
import {
  coerceSavedSharePointRedirectUri,
  getSharePointOAuthRedirectUri,
} from "@/features/crawl/utils/sharepoint-oauth";
import {
  handleListSharePointDrives,
  handleListSharePointSites,
} from "@/network/actions/sharepoint.actions";
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

type SharePointSelection = SharePointSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlSharePointPanel() {
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
  const sharepoint = useSharePointConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getSharePointOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<SharePointSelection>({
    sites: [],
    drives: [],
  });
  const [siteItems, setSiteItems] = useState<SharePointSite[]>([]);
  const [driveItems, setDriveItems] = useState<SharePointDrive[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [sitesLoading, setSitesLoading] = useState(false);
  const [drivesLoading, setDrivesLoading] = useState(false);
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxFiles, setMaxFiles] = useState("100");
  const [maxSizeMb, setMaxSizeMb] = useState("50");
  const [excludeImages, setExcludeImages] = useState(true);
  const [excludeVideos, setExcludeVideos] = useState(true);

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

  const selectedSite = useMemo(
    () => siteItems.find((site) => site.id === selectedSiteId) ?? null,
    [selectedSiteId, siteItems],
  );

  useEffect(() => {
    if (!sharepoint.credentials) return;
    if (sharepoint.credentials.client_id)
      setClientId(sharepoint.credentials.client_id);
    if (sharepoint.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedSharePointRedirectUri(sharepoint.credentials.redirect_uri),
      );
    }
  }, [sharepoint.credentials]);

  useEffect(() => {
    const settings = sharepoint.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxFiles(String(settings.max_files ?? 100));
    setMaxSizeMb(String(settings.max_size_mb ?? 50));
    setExcludeImages(settings.exclude_images ?? true);
    setExcludeVideos(settings.exclude_videos ?? true);
  }, [sharepoint.status?.settings]);

  const loadSites = useCallback(async () => {
    if (!activeProjectId || !sharepoint.isConnected) return;
    setSitesLoading(true);
    try {
      const items = await handleListSharePointSites(activeProjectId);
      setSiteItems(items);
    } catch (err) {
      showError(err, "sharepoint.browse.sitesFailed");
    } finally {
      setSitesLoading(false);
    }
  }, [activeProjectId, sharepoint.isConnected, showError]);

  const loadDrives = useCallback(
    async (siteId: string) => {
      if (!activeProjectId || !sharepoint.isConnected) return;
      setDrivesLoading(true);
      try {
        const items = await handleListSharePointDrives(activeProjectId, siteId);
        setDriveItems(items);
      } catch (err) {
        showError(err, "sharepoint.browse.drivesFailed");
      } finally {
        setDrivesLoading(false);
      }
    },
    [activeProjectId, sharepoint.isConnected, showError],
  );

  useEffect(() => {
    if (sharepoint.isConnected) {
      void loadSites();
    }
  }, [loadSites, sharepoint.isConnected]);

  useEffect(() => {
    if (!selectedSiteId || !sharepoint.isConnected) {
      setDriveItems([]);
      return;
    }
    void loadDrives(selectedSiteId);
  }, [loadDrives, selectedSiteId, sharepoint.isConnected]);

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
    selection.sites.length > 0 || selection.drives.length > 0;
  const browseLoading = selectedSiteId ? drivesLoading : sitesLoading;
  const browseEmpty = selectedSiteId
    ? driveItems.length === 0
    : siteItems.length === 0;

  const toggleSite = useCallback((site: SharePointSite) => {
    setSelection((current) => {
      const exists = current.sites.some((item) => item.id === site.id);
      return {
        ...current,
        sites: exists
          ? current.sites.filter((item) => item.id !== site.id)
          : [...current.sites, { id: site.id, name: site.name }],
      };
    });
  }, []);

  const toggleDrive = useCallback((drive: SharePointDrive) => {
    setSelection((current) => {
      const exists = current.drives.some((item) => item.id === drive.id);
      return {
        ...current,
        drives: exists
          ? current.drives.filter((item) => item.id !== drive.id)
          : [...current.drives, { id: drive.id, name: drive.name }],
      };
    });
  }, []);

  const isSiteSelected = useCallback(
    (site: SharePointSite) =>
      selection.sites.some((item) => item.id === site.id),
    [selection.sites],
  );

  const isDriveSelected = useCallback(
    (drive: SharePointDrive) =>
      selection.drives.some((item) => item.id === drive.id),
    [selection.drives],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("sharepoint.toast.redirectCopied"));
    else notify(t("sharepoint.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await sharepoint.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("sharepoint.toast.authOpened"));
    } catch (err) {
      showError(err, "sharepoint.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await sharepoint.saveSources(selection);
      await sharepoint.triggerSync();
      notify(
        t("sharepoint.toast.indexStarted", {
          count: selection.sites.length + selection.drives.length,
        }),
      );
    } catch (err) {
      showError(err, "sharepoint.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    const message = t("sharepoint.confirm.disconnectMessage");
    return confirm({
      title: t("sharepoint.confirm.disconnectTitle"),
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
      await sharepoint.disconnect();
      setSelection({ sites: [], drives: [] });
      setSelectedSiteId(null);
      notify(t("sharepoint.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await sharepoint.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_files: Number(maxFiles) || 100,
        max_size_mb: Number(maxSizeMb) || 50,
        exclude_images: excludeImages,
        exclude_videos: excludeVideos,
      });
      notify(t("sharepoint.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleRefreshBrowse = () => {
    if (selectedSiteId) {
      void loadDrives(selectedSiteId);
      return;
    }
    void loadSites();
  };

  const statusIcon = useMemo(() => {
    const status = sharepoint.status?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return null;
  }, [
    colors.danger,
    colors.success,
    colors.textMuted,
    sharepoint.status?.status,
  ]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="SharePoint integration">
      <CrawlTabPanelHeader
        icon={Building2}
        title={t("sharepoint.title")}
        subtitle={t("sharepoint.description")}
        trailing={
          sharepoint.isConnected ? (
            <ConfigurationOutlineButton
              label={t("sharepoint.refresh")}
              loading={sharepoint.isLoadingStatus}
              onPress={() => void sharepoint.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.sharepoint")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("sharepoint.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : sharepoint.isLoadingStatus && !sharepoint.status ? (
        <CrawlPanelCard title={t("crawl.tabs.sharepoint")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !sharepoint.isConnected ? (
        <CrawlPanelCard
          title={t("sharepoint.connect.title")}
          subtitle={t("sharepoint.connect.subtitle")}
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
              <Building2 size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("sharepoint.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("sharepoint.form.clientId")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
            />
            <AppTextField
              label={t("sharepoint.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
            />
            <ConnectorRedirectUriField
              label={t("sharepoint.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("sharepoint.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("sharepoint.form.connect")}
              disabled={!canConnect || sharepoint.isConnecting}
              loading={sharepoint.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={
              sharepoint.status?.account_label ?? t("crawl.tabs.sharepoint")
            }
            subtitle={t("sharepoint.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={sharepoint.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(sharepoint.status?.status)}
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
                    {t("sharepoint.stats.filesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {sharepoint.status?.documents_indexed ?? 0}
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
                    {t("sharepoint.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: sharepoint.status?.settings?.cadence_minutes ?? 30,
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
                    {t("sharepoint.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      sharepoint.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              {sharepoint.status?.status === "ERROR" ? (
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
                    {t("sharepoint.error.banner")}
                  </Text>
                </View>
              ) : null}

              {sharepoint.hasRunningJob ? (
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
                    {t("sharepoint.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={
                    selectedSiteId
                      ? t("sharepoint.actions.refreshDrives")
                      : t("sharepoint.actions.refreshSites")
                  }
                  loading={browseLoading}
                  onPress={handleRefreshBrowse}
                  icon={ActionIcons.refresh}
                />
                {sharepoint.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("sharepoint.actions.pause")}
                    loading={sharepoint.actionPending}
                    onPress={() => void sharepoint.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("sharepoint.actions.resume")}
                    loading={sharepoint.actionPending}
                    onPress={() => void sharepoint.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={sharepoint.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                  icon={ActionIcons.disconnect}
                />
              </View>

              {sharepoint.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <CrawlStatusBadge
                    label={sharepoint.latestJob.status}
                    tone={
                      sharepoint.latestJob.status === "FAILED"
                        ? "danger"
                        : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("sharepoint.jobs.summary", {
                      fetched: sharepoint.latestJob.files_fetched,
                      indexed: sharepoint.latestJob.files_indexed,
                      skipped: sharepoint.latestJob.files_skipped,
                    })}
                  </Text>
                  {sharepoint.latestJobIsStale ? (
                    <Text
                      style={[typography.caption, { color: colors.danger }]}
                    >
                      {t("sharepoint.jobs.stale")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("sharepoint.sources.title")}
            subtitle={t("sharepoint.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("sharepoint.sources.indexSelected")}
                size="compact"
                loading={
                  sharepoint.isSavingSources ||
                  sharepoint.isSyncing ||
                  sharepoint.hasRunningJob
                }
                disabled={!hasSelection || sharepoint.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              {selectedSiteId ? (
                <View style={[styles.toolbarRow, { gap: spacing.sm }]}>
                  <ConfigurationOutlineButton
                    label={t("sharepoint.sources.backToSites")}
                    onPress={() => setSelectedSiteId(null)}
                  />
                  {selectedSite ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.textMuted, flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {t("sharepoint.sources.activeSite", {
                        name: selectedSite.name,
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <StatePanel
                isEmpty={browseEmpty}
                emptyLabel={
                  selectedSiteId
                    ? t("sharepoint.sources.drivesEmpty")
                    : t("sharepoint.sources.sitesEmpty")
                }
                loading={browseLoading}
              >
                {!browseEmpty ? (
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
                      {selectedSiteId
                        ? driveItems.map((drive) => {
                            const checked = isDriveSelected(drive);
                            return (
                              <Pressable
                                key={drive.id}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                                onPress={() => toggleDrive(drive)}
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
                                    {drive.name}
                                  </Text>
                                  <Text
                                    style={[
                                      typography.caption,
                                      { color: colors.textMuted },
                                    ]}
                                  >
                                    {t("sharepoint.sources.drive")}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })
                        : siteItems.map((site) => {
                            const checked = isSiteSelected(site);
                            return (
                              <Pressable
                                key={site.id}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                                onPress={() => toggleSite(site)}
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
                                    {site.name}
                                  </Text>
                                  <Text
                                    style={[
                                      typography.caption,
                                      { color: colors.textMuted },
                                    ]}
                                  >
                                    {t("sharepoint.sources.site")}
                                  </Text>
                                </View>
                                <Pressable
                                  accessibilityRole="button"
                                  accessibilityLabel={t(
                                    "sharepoint.sources.openSiteA11y",
                                    { name: site.name },
                                  )}
                                  onPress={() => setSelectedSiteId(site.id)}
                                  hitSlop={8}
                                >
                                  <FolderOpen
                                    size={16}
                                    color={colors.textMuted}
                                  />
                                </Pressable>
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
            title={t("sharepoint.settings.title")}
            subtitle={t("sharepoint.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("sharepoint.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("sharepoint.settings.maxFiles")}
                value={maxFiles}
                onChangeText={setMaxFiles}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("sharepoint.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: excludeImages }}
                onPress={() => setExcludeImages((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={excludeImages} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("sharepoint.settings.excludeImages")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: excludeVideos }}
                onPress={() => setExcludeVideos((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={excludeVideos} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("sharepoint.settings.excludeVideos")}
                </Text>
              </Pressable>
              <ConnectorPanelButton
                label={t("sharepoint.settings.save")}
                loading={sharepoint.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("sharepoint.jobs.title")}
            subtitle={t("sharepoint.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={sharepoint.jobs.length === 0}
              emptyLabel={t("sharepoint.jobs.empty")}
              loading={sharepoint.isLoadingJobs}
            >
              {sharepoint.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {sharepoint.jobs.map((job) => (
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
                        {t("sharepoint.jobs.summary", {
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

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobRow: { borderWidth: 1, padding: 12, gap: 6 },
});
