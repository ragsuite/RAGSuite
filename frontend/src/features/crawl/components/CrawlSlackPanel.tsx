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
  MessageSquare,
  Pause,
  Play,
} from "lucide-react-native";

import { ConnectorPanelButton } from "@/features/crawl/components/ConnectorPanelButton";
import { ConnectorRedirectUriField } from "@/features/crawl/components/ConnectorRedirectUriField";
import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useSlackConnector } from "@/features/crawl/hooks/useSlackConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  SlackChannel,
  SlackSourcesSelection,
} from "@/features/crawl/types/slack.types";
import {
  coerceSavedSlackRedirectUri,
  getSlackOAuthRedirectUri,
} from "@/features/crawl/utils/slack-oauth";
import { handleListSlackChannels } from "@/network/actions/slack.actions";
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

type SlackSelection = SlackSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlSlackPanel() {
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
  const slack = useSlackConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getSlackOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<SlackSelection>({ channels: [] });
  const [channelItems, setChannelItems] = useState<SlackChannel[]>([]);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxMessages, setMaxMessages] = useState("500");
  const [maxSizeMb, setMaxSizeMb] = useState("50");
  const [includeThreads, setIncludeThreads] = useState(true);
  const [includeFiles, setIncludeFiles] = useState(true);

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
    if (!slack.credentials) return;
    if (slack.credentials.client_id) setClientId(slack.credentials.client_id);
    if (slack.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedSlackRedirectUri(slack.credentials.redirect_uri),
      );
    }
  }, [slack.credentials]);

  useEffect(() => {
    const settings = slack.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxMessages(String(settings.max_messages ?? 500));
    setMaxSizeMb(String(settings.max_size_mb ?? 50));
    setIncludeThreads(settings.include_threads ?? true);
    setIncludeFiles(settings.include_files ?? true);
  }, [slack.status?.settings]);

  const loadChannels = useCallback(async () => {
    if (!activeProjectId || !slack.isConnected) return;
    setChannelsLoading(true);
    try {
      const items = await handleListSlackChannels(activeProjectId);
      setChannelItems(items);
    } catch (err) {
      showError(err, "slack.browse.failed");
    } finally {
      setChannelsLoading(false);
    }
  }, [activeProjectId, slack.isConnected, showError]);

  useEffect(() => {
    if (slack.isConnected) {
      void loadChannels();
    }
  }, [loadChannels, slack.isConnected]);

  const trimmedClientId = clientId.trim();
  const trimmedClientSecret = clientSecret.trim();
  const trimmedRedirectUri = redirectUri.trim();
  const canConnect = Boolean(
    trimmedClientId &&
    trimmedClientSecret &&
    trimmedRedirectUri &&
    activeProjectId,
  );
  const hasSelection = selection.channels.length > 0;

  const toggleChannel = useCallback((channel: SlackChannel) => {
    setSelection((current) => {
      const exists = current.channels.some((item) => item.id === channel.id);
      return {
        channels: exists
          ? current.channels.filter((item) => item.id !== channel.id)
          : [...current.channels, { id: channel.id, name: channel.name }],
      };
    });
  }, []);

  const isChannelSelected = useCallback(
    (channel: SlackChannel) =>
      selection.channels.some((item) => item.id === channel.id),
    [selection.channels],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("slack.toast.redirectCopied"));
    else notify(t("slack.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await slack.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("slack.toast.authOpened"));
    } catch (err) {
      showError(err, "slack.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await slack.saveSources(selection);
      await slack.triggerSync();
      notify(
        t("slack.toast.indexStarted", { count: selection.channels.length }),
      );
    } catch (err) {
      showError(err, "slack.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    const message = t("slack.confirm.disconnectMessage");
    return confirm({
      title: t("slack.confirm.disconnectTitle"),
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
      await slack.disconnect();
      setSelection({ channels: [] });
      notify(t("slack.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await slack.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_messages: Number(maxMessages) || 500,
        max_size_mb: Number(maxSizeMb) || 50,
        include_threads: includeThreads,
        include_files: includeFiles,
      });
      notify(t("slack.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const statusIcon = useMemo(() => {
    const status = slack.status?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return null;
  }, [colors.danger, colors.success, colors.textMuted, slack.status?.status]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="Slack integration">
      <CrawlTabPanelHeader
        icon={MessageSquare}
        title={t("slack.title")}
        subtitle={t("slack.description")}
        trailing={
          slack.isConnected ? (
            <ConfigurationOutlineButton
              label={t("slack.refresh")}
              loading={slack.isLoadingStatus}
              onPress={() => void slack.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.slack")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("slack.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : slack.isLoadingStatus && !slack.status ? (
        <CrawlPanelCard title={t("crawl.tabs.slack")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !slack.isConnected ? (
        <CrawlPanelCard
          title={t("slack.connect.title")}
          subtitle={t("slack.connect.subtitle")}
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
              <MessageSquare size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("slack.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("slack.form.clientId")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
            />
            <AppTextField
              label={t("slack.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
            />
            <ConnectorRedirectUriField
              label={t("slack.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("slack.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("slack.form.connect")}
              disabled={!canConnect || slack.isConnecting}
              loading={slack.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={slack.status?.account_label ?? t("crawl.tabs.slack")}
            subtitle={t("slack.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={slack.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(slack.status?.status)}
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
                    {t("slack.stats.messagesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {slack.status?.documents_indexed ?? 0}
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
                    {t("slack.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: slack.status?.settings?.cadence_minutes ?? 30,
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
                    {t("slack.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      slack.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              <View
                style={[
                  styles.banner,
                  {
                    borderColor: colors.warning,
                    borderRadius: componentRadius.card,
                    backgroundColor: colors.ochreTint,
                  },
                ]}
              >
                <AlertCircle size={16} color={colors.warning} />
                <Text
                  style={[
                    typography.caption,
                    { color: colors.warning, flex: 1 },
                  ]}
                >
                  {t("slack.privacy.warning")}
                </Text>
              </View>

              {slack.status?.status === "ERROR" ? (
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
                    {t("slack.error.banner")}
                  </Text>
                </View>
              ) : null}

              {slack.hasRunningJob ? (
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
                    {t("slack.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={t("slack.actions.refreshChannels")}
                  loading={channelsLoading}
                  onPress={() => void loadChannels()}
                  icon={ActionIcons.refresh}
                />
                {slack.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("slack.actions.pause")}
                    loading={slack.actionPending}
                    onPress={() => void slack.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("slack.actions.resume")}
                    loading={slack.actionPending}
                    onPress={() => void slack.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={slack.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                  icon={ActionIcons.disconnect}
                />
              </View>

              {slack.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <CrawlStatusBadge
                    label={slack.latestJob.status}
                    tone={
                      slack.latestJob.status === "FAILED" ? "danger" : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("slack.jobs.summary", {
                      fetched: slack.latestJob.files_fetched,
                      indexed: slack.latestJob.files_indexed,
                      skipped: slack.latestJob.files_skipped,
                    })}
                  </Text>
                  {slack.latestJobIsStale ? (
                    <Text
                      style={[typography.caption, { color: colors.danger }]}
                    >
                      {t("slack.jobs.stale")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("slack.sources.title")}
            subtitle={t("slack.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("slack.sources.indexSelected")}
                size="compact"
                loading={
                  slack.isSavingSources ||
                  slack.isSyncing ||
                  slack.hasRunningJob
                }
                disabled={!hasSelection || slack.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              <StatePanel
                isEmpty={channelItems.length === 0}
                emptyLabel={t("slack.sources.empty")}
                loading={channelsLoading}
              >
                {channelItems.length > 0 ? (
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
                      {channelItems.map((channel) => {
                        const checked = isChannelSelected(channel);
                        return (
                          <Pressable
                            key={channel.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            onPress={() => toggleChannel(channel)}
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
                                #{channel.name}
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
            title={t("slack.settings.title")}
            subtitle={t("slack.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("slack.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("slack.settings.maxMessages")}
                value={maxMessages}
                onChangeText={setMaxMessages}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("slack.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeThreads }}
                onPress={() => setIncludeThreads((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={includeThreads} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("slack.settings.includeThreads")}
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeFiles }}
                onPress={() => setIncludeFiles((value) => !value)}
                style={styles.toggleRow}
              >
                <AppCheckboxMark checked={includeFiles} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("slack.settings.includeFiles")}
                </Text>
              </Pressable>
              <ConnectorPanelButton
                label={t("slack.settings.save")}
                loading={slack.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("slack.jobs.title")}
            subtitle={t("slack.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={slack.jobs.length === 0}
              emptyLabel={t("slack.jobs.empty")}
              loading={slack.isLoadingJobs}
            >
              {slack.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {slack.jobs.map((job) => (
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
                        {t("slack.jobs.summary", {
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

  toggleRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  jobRow: { borderWidth: 1, padding: 12, gap: 6 },
});
