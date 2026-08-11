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
  Layers,
  Pause,
  Play,
} from "lucide-react-native";

import { ConnectorPanelButton } from "@/features/crawl/components/ConnectorPanelButton";
import { ConnectorRedirectUriField } from "@/features/crawl/components/ConnectorRedirectUriField";
import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useConfluenceConnector } from "@/features/crawl/hooks/useConfluenceConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  ConfluenceSpace,
  ConfluenceSourcesSelection,
} from "@/features/crawl/types/confluence.types";
import {
  coerceSavedConfluenceRedirectUri,
  getConfluenceOAuthRedirectUri,
} from "@/features/crawl/utils/confluence-oauth";
import { handleListConfluenceSpaces } from "@/network/actions/confluence.actions";
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

type ConfluenceSelection = ConfluenceSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlConfluencePanel() {
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
  const confluence = useConfluenceConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getConfluenceOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<ConfluenceSelection>({
    spaces: [],
    pages: [],
  });
  const [spaceItems, setSpaceItems] = useState<ConfluenceSpace[]>([]);
  const [spacesLoading, setSpacesLoading] = useState(false);
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxPages, setMaxPages] = useState("100");
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
    if (!confluence.credentials) return;
    if (confluence.credentials.client_id)
      setClientId(confluence.credentials.client_id);
    if (confluence.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedConfluenceRedirectUri(confluence.credentials.redirect_uri),
      );
    }
  }, [confluence.credentials]);

  useEffect(() => {
    const settings = confluence.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxPages(String(settings.max_pages ?? 100));
    setMaxSizeMb(String(settings.max_size_mb ?? 50));
  }, [confluence.status?.settings]);

  const loadSpaces = useCallback(async () => {
    if (!activeProjectId || !confluence.isConnected) return;
    setSpacesLoading(true);
    try {
      const items = await handleListConfluenceSpaces(activeProjectId);
      setSpaceItems(items);
    } catch (err) {
      showError(err, "confluence.browse.failed");
    } finally {
      setSpacesLoading(false);
    }
  }, [activeProjectId, confluence.isConnected, showError]);

  useEffect(() => {
    if (confluence.isConnected) {
      void loadSpaces();
    }
  }, [confluence.isConnected, loadSpaces]);

  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();
  const trimmedRedirectUri = redirectUri.trim();
  const canConnect = Boolean(
    trimmedClientId &&
    trimmedClientSecret &&
    trimmedRedirectUri &&
    activeProjectId,
  );
  const hasSelection = selection.spaces.length > 0;

  const toggleSpace = useCallback((space: ConfluenceSpace) => {
    setSelection((current) => {
      const exists = current.spaces.some((item) => item.id === space.id);
      return {
        ...current,
        spaces: exists
          ? current.spaces.filter((item) => item.id !== space.id)
          : [
              ...current.spaces,
              { id: space.id, key: space.key, name: space.name },
            ],
      };
    });
  }, []);

  const isSpaceSelected = useCallback(
    (space: ConfluenceSpace) =>
      selection.spaces.some((item) => item.id === space.id),
    [selection.spaces],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("confluence.toast.redirectCopied"));
    else notify(t("confluence.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await confluence.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("confluence.toast.authOpened"));
    } catch (err) {
      showError(err, "confluence.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await confluence.saveSources({ spaces: selection.spaces, pages: [] });
      await confluence.triggerSync();
      notify(
        t("confluence.toast.indexStarted", { count: selection.spaces.length }),
      );
    } catch (err) {
      showError(err, "confluence.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    const message = t("confluence.confirm.disconnectMessage");
    return confirm({
      title: t("confluence.confirm.disconnectTitle"),
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
      await confluence.disconnect();
      setSelection({ spaces: [], pages: [] });
      notify(t("confluence.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await confluence.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_pages: Number(maxPages) || 100,
        max_size_mb: Number(maxSizeMb) || 50,
      });
      notify(t("confluence.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const statusIcon = useMemo(() => {
    const status = confluence.status?.status;
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
    confluence.status?.status,
  ]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="Confluence integration">
      <CrawlTabPanelHeader
        icon={Layers}
        title={t("confluence.title")}
        subtitle={t("confluence.description")}
        trailing={
          confluence.isConnected ? (
            <ConfigurationOutlineButton
              label={t("confluence.refresh")}
              loading={confluence.isLoadingStatus}
              onPress={() => void confluence.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.confluence")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("confluence.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : confluence.isLoadingStatus && !confluence.status ? (
        <CrawlPanelCard title={t("crawl.tabs.confluence")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !confluence.isConnected ? (
        <CrawlPanelCard
          title={t("confluence.connect.title")}
          subtitle={t("confluence.connect.subtitle")}
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
              <Layers size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("confluence.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("confluence.form.clientId")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
            />
            <AppTextField
              label={t("confluence.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
            />
            <ConnectorRedirectUriField
              label={t("confluence.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("confluence.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("confluence.form.connect")}
              disabled={!canConnect || confluence.isConnecting}
              loading={confluence.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={
              confluence.status?.account_label ?? t("crawl.tabs.confluence")
            }
            subtitle={t("confluence.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={confluence.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(confluence.status?.status)}
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
                    {t("confluence.stats.pagesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {confluence.status?.documents_indexed ?? 0}
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
                    {t("confluence.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: confluence.status?.settings?.cadence_minutes ?? 30,
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
                    {t("confluence.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      confluence.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              {confluence.status?.status === "ERROR" ? (
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
                    {t("confluence.error.banner")}
                  </Text>
                </View>
              ) : null}

              {confluence.hasRunningJob ? (
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
                    {t("confluence.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={t("confluence.actions.refreshSpaces")}
                  loading={spacesLoading}
                  onPress={() => void loadSpaces()}
                  icon={ActionIcons.refresh}
                />
                {confluence.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("confluence.actions.pause")}
                    loading={confluence.actionPending}
                    onPress={() => void confluence.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("confluence.actions.resume")}
                    loading={confluence.actionPending}
                    onPress={() => void confluence.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={confluence.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                  icon={ActionIcons.disconnect}
                />
              </View>

              {confluence.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <CrawlStatusBadge
                    label={confluence.latestJob.status}
                    tone={
                      confluence.latestJob.status === "FAILED"
                        ? "danger"
                        : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("confluence.jobs.summary", {
                      fetched: confluence.latestJob.files_fetched,
                      indexed: confluence.latestJob.files_indexed,
                      skipped: confluence.latestJob.files_skipped,
                    })}
                  </Text>
                  {confluence.latestJobIsStale ? (
                    <Text
                      style={[typography.caption, { color: colors.danger }]}
                    >
                      {t("confluence.jobs.stale")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("confluence.sources.title")}
            subtitle={t("confluence.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("confluence.sources.indexSelected")}
                size="compact"
                loading={
                  confluence.isSavingSources ||
                  confluence.isSyncing ||
                  confluence.hasRunningJob
                }
                disabled={!hasSelection || confluence.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              <StatePanel
                isEmpty={spaceItems.length === 0}
                emptyLabel={t("confluence.sources.empty")}
                loading={spacesLoading}
              >
                {spaceItems.length > 0 ? (
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
                      {spaceItems.map((space) => {
                        const checked = isSpaceSelected(space);
                        return (
                          <Pressable
                            key={space.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            onPress={() => toggleSpace(space)}
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
                                {space.name}
                              </Text>
                              {space.key ? (
                                <Text
                                  style={[
                                    typography.caption,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {space.key}
                                </Text>
                              ) : null}
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
            title={t("confluence.settings.title")}
            subtitle={t("confluence.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("confluence.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("confluence.settings.maxPages")}
                value={maxPages}
                onChangeText={setMaxPages}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("confluence.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <ConnectorPanelButton
                label={t("confluence.settings.save")}
                loading={confluence.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("confluence.jobs.title")}
            subtitle={t("confluence.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={confluence.jobs.length === 0}
              emptyLabel={t("confluence.jobs.empty")}
              loading={confluence.isLoadingJobs}
            >
              {confluence.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {confluence.jobs.map((job) => (
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
                        {t("confluence.jobs.summary", {
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
