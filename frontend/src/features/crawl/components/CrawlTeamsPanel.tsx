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
  Pause,
  Play,
  Users,
} from "lucide-react-native";

import { ConnectorPanelButton } from "@/features/crawl/components/ConnectorPanelButton";
import { ConnectorRedirectUriField } from "@/features/crawl/components/ConnectorRedirectUriField";
import { CrawlPanelCard } from "@/features/crawl/components/CrawlPanelCard";
import { CrawlTabPanelHeader } from "@/features/crawl/components/CrawlTabPanelHeader";
import { CrawlStatusBadge } from "@/features/crawl/components/CrawlStatusBadge";
import { ConfigurationOutlineButton } from "@/features/configuration/components/configuration-actions";
import { useTeamsConnector } from "@/features/crawl/hooks/useTeamsConnector";
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import type {
  TeamsChannel,
  TeamsSourcesSelection,
  TeamsTeam,
} from "@/features/crawl/types/teams.types";
import {
  coerceSavedTeamsRedirectUri,
  getTeamsOAuthRedirectUri,
} from "@/features/crawl/utils/teams-oauth";
import {
  handleListTeamsChannels,
  handleListTeamsTeams,
} from "@/network/actions/teams.actions";
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

type TeamsSelection = TeamsSourcesSelection;
const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlTeamsPanel() {
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
  const teams = useTeamsConnector(activeProjectId ?? "");

  const [clientId, setClientId] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [redirectUri, setRedirectUri] = useState(() =>
    getTeamsOAuthRedirectUri(),
  );
  const [selection, setSelection] = useState<TeamsSelection>({
    teams: [],
    channels: [],
  });
  const [teamItems, setTeamItems] = useState<TeamsTeam[]>([]);
  const [channelItems, setChannelItems] = useState<TeamsChannel[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [teamsLoading, setTeamsLoading] = useState(false);
  const [channelsLoading, setChannelsLoading] = useState(false);
  const [cadenceMinutes, setCadenceMinutes] = useState("30");
  const [maxMessages, setMaxMessages] = useState("200");
  const [maxSizeMb, setMaxSizeMb] = useState("10");
  const [includeThreads, setIncludeThreads] = useState(true);

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
    if (!teams.credentials) return;
    if (teams.credentials.client_id) setClientId(teams.credentials.client_id);
    if (teams.credentials.redirect_uri) {
      setRedirectUri(
        coerceSavedTeamsRedirectUri(teams.credentials.redirect_uri),
      );
    }
  }, [teams.credentials]);

  useEffect(() => {
    const settings = teams.status?.settings;
    if (!settings) return;
    setCadenceMinutes(String(settings.cadence_minutes ?? 30));
    setMaxMessages(String(settings.max_messages ?? 200));
    setMaxSizeMb(String(settings.max_size_mb ?? 10));
    setIncludeThreads(settings.include_threads ?? true);
  }, [teams.status?.settings]);

  useEffect(() => {
    const sources = teams.status?.sources;
    if (!sources) return;
    setSelection({
      teams: sources.teams ?? [],
      channels: sources.channels ?? [],
    });
  }, [teams.status?.sources]);

  const loadTeams = useCallback(async () => {
    if (!activeProjectId || !teams.isConnected) return;
    setTeamsLoading(true);
    try {
      const items = await handleListTeamsTeams(activeProjectId);
      setTeamItems(items);
    } catch (err) {
      showError(err, "teams.browse.teamsFailed");
    } finally {
      setTeamsLoading(false);
    }
  }, [activeProjectId, teams.isConnected, showError]);

  const loadChannels = useCallback(
    async (teamId: string) => {
      if (!activeProjectId || !teams.isConnected) return;
      setChannelsLoading(true);
      try {
        const items = await handleListTeamsChannels(activeProjectId, teamId);
        setChannelItems(items);
      } catch (err) {
        showError(err, "teams.browse.channelsFailed");
      } finally {
        setChannelsLoading(false);
      }
    },
    [activeProjectId, teams.isConnected, showError],
  );

  useEffect(() => {
    if (teams.isConnected) {
      void loadTeams();
    }
  }, [loadTeams, teams.isConnected]);

  useEffect(() => {
    if (!selectedTeamId || !teams.isConnected) {
      setChannelItems([]);
      return;
    }
    void loadChannels(selectedTeamId);
  }, [loadChannels, selectedTeamId, teams.isConnected]);

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
  const browseLoading = selectedTeamId ? channelsLoading : teamsLoading;
  const browseEmpty = selectedTeamId
    ? channelItems.length === 0
    : teamItems.length === 0;
  const selectedTeam = useMemo(
    () => teamItems.find((item) => item.id === selectedTeamId) ?? null,
    [selectedTeamId, teamItems],
  );

  const toggleChannel = useCallback(
    (channel: TeamsChannel, team: TeamsTeam | null) => {
      setSelection((current) => {
        const exists = current.channels.some(
          (item) => item.id === channel.id && item.team_id === channel.team_id,
        );
        const nextChannels = exists
          ? current.channels.filter(
              (item) =>
                !(item.id === channel.id && item.team_id === channel.team_id),
            )
          : [
              ...current.channels,
              {
                id: channel.id,
                name: channel.name,
                team_id: channel.team_id,
              },
            ];
        const teamIds = new Set(nextChannels.map((item) => item.team_id));
        const knownTeams = new Map(
          [...current.teams, ...(team ? [team] : []), ...teamItems].map(
            (item) => [item.id, item],
          ),
        );
        return {
          channels: nextChannels,
          teams: Array.from(teamIds)
            .map((id) => knownTeams.get(id))
            .filter((item): item is TeamsTeam => Boolean(item))
            .map((item) => ({ id: item.id, name: item.name })),
        };
      });
    },
    [teamItems],
  );

  const isChannelSelected = useCallback(
    (channel: TeamsChannel) =>
      selection.channels.some(
        (item) => item.id === channel.id && item.team_id === channel.team_id,
      ),
    [selection.channels],
  );

  const copyRedirectUri = async () => {
    const ok = await copyText(redirectUri);
    if (ok) notify(t("teams.toast.redirectCopied"));
    else notify(t("teams.toast.redirectCopyFailed"), "error");
  };

  const handleConnect = async () => {
    try {
      await teams.connect({
        client_id: trimmedClientId,
        client_secret: trimmedClientSecret,
        redirect_uri: trimmedRedirectUri,
        save_credentials: true,
      });
      notify(t("teams.toast.authOpened"));
    } catch (err) {
      showError(err, "teams.toast.connectFailed");
    }
  };

  const handleIndexSelected = async () => {
    try {
      await teams.saveSources(selection);
      await teams.triggerSync();
      notify(
        t("teams.toast.indexStarted", { count: selection.channels.length }),
      );
    } catch (err) {
      showError(err, "teams.toast.indexFailed");
    }
  };

  const confirmDisconnect = useCallback((): Promise<boolean> => {
    return confirm({
      title: t("teams.confirm.disconnectTitle"),
      message: t("teams.confirm.disconnectMessage"),
      cancelLabel: t("common.cancel"),
      confirmLabel: t("common.disconnect"),
      destructive: true,
      variant: "danger",
    });
  }, [confirm, t]);

  const handleDisconnect = async () => {
    const confirmed = await confirmDisconnect();
    if (!confirmed) return;
    try {
      await teams.disconnect();
      setSelection({ teams: [], channels: [] });
      setSelectedTeamId(null);
      notify(t("teams.toast.disconnected"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleSaveSettings = async () => {
    try {
      await teams.saveSettings({
        cadence_minutes: Number(cadenceMinutes) || 30,
        max_messages: Number(maxMessages) || 200,
        max_size_mb: Number(maxSizeMb) || 10,
        include_threads: includeThreads,
      });
      notify(t("teams.toast.settingsSaved"));
    } catch (err) {
      showError(err, "common.saveFailed");
    }
  };

  const handleRefreshBrowse = () => {
    if (selectedTeamId) {
      void loadChannels(selectedTeamId);
      return;
    }
    void loadTeams();
  };

  const statusIcon = useMemo(() => {
    const status = teams.status?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return null;
  }, [colors.danger, colors.success, colors.textMuted, teams.status?.status]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="Microsoft Teams integration">
      <CrawlTabPanelHeader
        icon={Users}
        title={t("teams.title")}
        subtitle={t("teams.description")}
        trailing={
          teams.isConnected ? (
            <ConfigurationOutlineButton
              label={t("teams.refresh")}
              loading={teams.isLoadingStatus}
              onPress={() => void teams.refetchAll()}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {!activeProjectId ? (
        <CrawlPanelCard title={t("crawl.tabs.teams")}>
          <Text
            style={[
              typography.body,
              { color: colors.textMuted, padding: spacing.md },
            ]}
          >
            {t("teams.form.selectProject")}
          </Text>
        </CrawlPanelCard>
      ) : teams.isLoadingStatus && !teams.status ? (
        <CrawlPanelCard title={t("crawl.tabs.teams")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !teams.isConnected ? (
        <CrawlPanelCard
          title={t("teams.connect.title")}
          subtitle={t("teams.connect.subtitle")}
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
              <Users size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("teams.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("teams.form.clientId")}
              value={clientId}
              onChangeText={setClientId}
              autoCapitalize="none"
            />
            <AppTextField
              label={t("teams.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={clientSecret}
              onChangeText={setClientSecret}
              secureTextEntry
              autoCapitalize="none"
            />
            <ConnectorRedirectUriField
              label={t("teams.form.redirectUri")}
              value={redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("common.copy")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("teams.form.redirectUriHint")}
            </Text>
            <ConnectorPanelButton
              label={t("teams.form.connect")}
              disabled={!canConnect || teams.isConnecting}
              loading={teams.isConnecting}
              onPress={() => void handleConnect()}
            />
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={teams.status?.account_label ?? t("crawl.tabs.teams")}
            subtitle={t("teams.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={teams.status?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(teams.status?.status)}
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
                    {t("teams.stats.messagesIndexed")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {teams.status?.documents_indexed ?? 0}
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
                    {t("teams.stats.syncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {t("common.minutesShort", {
                      count: teams.status?.settings?.cadence_minutes ?? 30,
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
                    {t("teams.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      teams.status?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t("teams.privacy.warning")}
              </Text>

              {teams.status?.status === "ERROR" ? (
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
                    {t("teams.error.banner")}
                  </Text>
                </View>
              ) : null}

              {teams.hasRunningJob ? (
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
                    {t("teams.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConfigurationOutlineButton
                  label={
                    selectedTeamId
                      ? t("teams.actions.refreshChannels")
                      : t("teams.actions.refreshTeams")
                  }
                  loading={browseLoading}
                  onPress={handleRefreshBrowse}
                  icon={ActionIcons.refresh}
                />
                {teams.status?.is_active ? (
                  <ConfigurationOutlineButton
                    label={t("teams.actions.pause")}
                    loading={teams.actionPending}
                    onPress={() => void teams.pause()}
                    icon={Pause}
                  />
                ) : (
                  <ConfigurationOutlineButton
                    label={t("teams.actions.resume")}
                    loading={teams.actionPending}
                    onPress={() => void teams.resume()}
                    icon={Play}
                  />
                )}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={teams.isDisconnecting}
                  onPress={() => void handleDisconnect()}
                />
              </View>

              {teams.latestJob ? (
                <View
                  style={[
                    styles.jobRow,
                    { borderColor: colors.border, borderRadius: controlRadius },
                  ]}
                >
                  <CrawlStatusBadge
                    label={teams.latestJob.status}
                    tone={
                      teams.latestJob.status === "FAILED" ? "danger" : "muted"
                    }
                    preserveCase
                  />
                  <Text
                    style={[typography.caption, { color: colors.textMuted }]}
                  >
                    {t("teams.jobs.summary", {
                      fetched: teams.latestJob.files_fetched,
                      indexed: teams.latestJob.files_indexed,
                      skipped: teams.latestJob.files_skipped,
                    })}
                  </Text>
                  {teams.latestJobIsStale ? (
                    <Text
                      style={[typography.caption, { color: colors.danger }]}
                    >
                      {t("teams.jobs.stale")}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("teams.sources.title")}
            subtitle={t("teams.sources.subtitle")}
            inlineHeaderAction
            headerAction={
              <AppButton
                label={t("teams.sources.indexSelected")}
                size="compact"
                loading={
                  teams.isSavingSources ||
                  teams.isSyncing ||
                  teams.hasRunningJob
                }
                disabled={!hasSelection || teams.hasRunningJob}
                onPress={() => void handleIndexSelected()}
              />
            }
          >
            <View style={panelBodyStyle}>
              {selectedTeamId ? (
                <View style={[styles.toolbarRow, { gap: spacing.sm }]}>
                  <ConfigurationOutlineButton
                    label={t("teams.sources.backToTeams")}
                    onPress={() => setSelectedTeamId(null)}
                  />
                  {selectedTeam ? (
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.textMuted, flex: 1 },
                      ]}
                      numberOfLines={1}
                    >
                      {t("teams.sources.activeTeam", {
                        name: selectedTeam.name,
                      })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
              <StatePanel
                isEmpty={browseEmpty}
                emptyLabel={
                  selectedTeamId
                    ? t("teams.sources.channelsEmpty")
                    : t("teams.sources.teamsEmpty")
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
                      {selectedTeamId
                        ? channelItems.map((channel) => {
                            const checked = isChannelSelected(channel);
                            return (
                              <Pressable
                                key={`${channel.team_id}:${channel.id}`}
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked }}
                                onPress={() =>
                                  toggleChannel(channel, selectedTeam)
                                }
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
                                    {channel.name}
                                  </Text>
                                  <Text
                                    style={[
                                      typography.caption,
                                      { color: colors.textMuted },
                                    ]}
                                  >
                                    {t("teams.sources.channel")}
                                  </Text>
                                </View>
                              </Pressable>
                            );
                          })
                        : teamItems.map((team) => (
                            <Pressable
                              key={team.id}
                              accessibilityRole="button"
                              onPress={() => setSelectedTeamId(team.id)}
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
                              <View style={{ flex: 1, gap: 2 }}>
                                <Text
                                  style={[
                                    typography.body,
                                    { color: colors.text, fontWeight: "500" },
                                  ]}
                                  numberOfLines={1}
                                >
                                  {team.name}
                                </Text>
                                <Text
                                  style={[
                                    typography.caption,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {t("teams.sources.team")}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.primary },
                                ]}
                              >
                                {t("teams.sources.openChannels")}
                              </Text>
                            </Pressable>
                          ))}
                    </AppScrollView>
                  </View>
                ) : null}
              </StatePanel>
              {hasSelection ? (
                <Text style={[typography.caption, { color: colors.textMuted }]}>
                  {t("teams.sources.selectedCount", {
                    count: selection.channels.length,
                  })}
                </Text>
              ) : null}
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("teams.settings.title")}
            subtitle={t("teams.settings.subtitle")}
          >
            <View style={panelBodyStyle}>
              <AppTextField
                label={t("teams.settings.cadence")}
                value={cadenceMinutes}
                onChangeText={setCadenceMinutes}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("teams.settings.maxMessages")}
                value={maxMessages}
                onChangeText={setMaxMessages}
                keyboardType="number-pad"
              />
              <AppTextField
                label={t("teams.settings.maxSizeMb")}
                value={maxSizeMb}
                onChangeText={setMaxSizeMb}
                keyboardType="number-pad"
              />
              <Pressable
                accessibilityRole="checkbox"
                accessibilityState={{ checked: includeThreads }}
                onPress={() => setIncludeThreads((value) => !value)}
                style={styles.checkboxRow}
              >
                <AppCheckboxMark checked={includeThreads} />
                <Text style={[typography.body, { color: colors.text }]}>
                  {t("teams.settings.includeThreads")}
                </Text>
              </Pressable>
              <AppButton
                label={t("common.save")}
                loading={teams.isSavingSettings}
                onPress={() => void handleSaveSettings()}
              />
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("teams.jobs.title")}
            subtitle={t("teams.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={teams.jobs.length === 0}
              emptyLabel={t("teams.jobs.empty")}
              loading={teams.isLoadingJobs}
            >
              {teams.jobs.length > 0 ? (
                <View style={panelBodyStyle}>
                  {teams.jobs.map((job) => (
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
                        {t("teams.jobs.summary", {
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
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  jobRow: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  toolbarRow: { flexDirection: "row", alignItems: "center" },
  checkboxRow: { flexDirection: "row", alignItems: "center", gap: 10 },
});
