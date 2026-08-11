import React, { useEffect, useMemo, useState } from "react";
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
  Eye,
  Mail,
  Pause,
  Play,
  WifiOff,
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
import { useCrawlPanelChrome } from "@/features/crawl/hooks/useCrawlPanelChrome";
import { useCrawlManagement } from "@/features/crawl/hooks/useCrawlManagement";
import type { GmailCredentials } from "@/features/crawl/types/crawl.types";
import {
  coerceSavedGmailRedirectUri,
  getGmailOAuthRedirectUri,
} from "@/features/crawl/utils/gmail-oauth";
import { gmailHasRunningJobs } from "@/features/crawl/services/crawl.service";
import { formatDocumentChunkLabel } from "@/features/crawl/utils/document-form";
import { filterGmailDocuments } from "@/features/crawl/utils/document-gmail-utils";
import { useActiveProject } from "@/features/projects/providers/active-project-provider";
import { useTranslation } from "@/i18n";
import { AppButton } from "@/shared/components/app-button";
import { AppCheckboxMark } from "@/shared/components/app-checkbox-mark";
import { AppScrollView } from "@/shared/components/app-scroll-view";
import { AppTextField } from "@/shared/components/app-text-field";
import { StatePanel } from "@/shared/components/dashboard/state-panel";
import { copyText } from "@/shared/utils/copy-text";
import { useAppTheme } from "@/shared/hooks/use-app-theme";
import { ActionIcons } from "@/shared/constants/action-icons";

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

const CONNECTOR_LIST_MAX_HEIGHT = 320;

export function CrawlGmailPanel() {
  const {
    colors,
    spacing,
    typography,
    componentRadius,
    surfaceRadius,
    isWebParitySurfaces,
  } = useAppTheme();
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
  const { activeProjectId } = useActiveProject();
  const {
    bundle,
    gmail,
    gmailLoading,
    saving,
    refreshing,
    handleSaveGmail,
    handleConnectGmail,
    handleSyncGmail,
    handlePauseGmail,
    handleResumeGmail,
    handleDisconnectGmail,
    handleIndexGmailInbox,
    handleDismissGmailInbox,
    handleViewDocument,
    handleEditDocument,
    openSheet,
    refresh,
    refreshGmail,
    loadMoreGmailInbox,
    gmailInboxLoadingMore,
    notify,
    gmailStagedSelected,
    gmailAllInboxSelected,
    toggleGmailStagedSelection,
    selectVisibleGmailInbox,
    selectAllGmailInbox,
    clearGmailSelection,
  } = useCrawlManagement();

  const [credentials, setCredentials] = useState<GmailCredentials>({
    clientId: "",
    clientSecret: "",
    redirectUri: getGmailOAuthRedirectUri(),
  });

  const isConnected = Boolean(gmail?.integration);
  const hasRunningJob = gmail ? gmailHasRunningJobs(gmail.jobs) : false;
  const selectedCount = gmailAllInboxSelected
    ? (gmail?.inbox.total ?? 0)
    : gmailStagedSelected.length;
  const hasMoreInbox =
    (gmail?.inbox.items.length ?? 0) < (gmail?.inbox.total ?? 0);
  const gmailDocuments = useMemo(
    () => filterGmailDocuments(bundle?.documents ?? []),
    [bundle?.documents],
  );

  useEffect(() => {
    if (!gmail?.credentials) return;
    if (!gmail.credentials.configured) {
      if (!gmailLoading) {
        setCredentials({
          clientId: "",
          clientSecret: "",
          redirectUri: getGmailOAuthRedirectUri(),
        });
      }
      return;
    }
    setCredentials((current) => ({
      clientId: gmail.credentials.client_id ?? current.clientId,
      clientSecret: current.clientSecret,
      redirectUri: coerceSavedGmailRedirectUri(gmail.credentials.redirect_uri),
    }));
  }, [gmail?.credentials, gmailLoading]);

  const canSave = Boolean(
    activeProjectId &&
    credentials.clientId.trim() &&
    credentials.clientSecret.trim() &&
    credentials.redirectUri.trim(),
  );
  const canConnect = canSave && gmail?.credentials?.configured;

  const copyRedirectUri = async () => {
    const ok = await copyText(credentials.redirectUri);
    if (ok) notify(t("gmail.toast.redirectCopied"));
    else notify(t("gmail.toast.redirectCopyFailed"), "error");
  };

  const refreshAll = () => {
    void Promise.all([refresh(), refreshGmail()]);
  };

  const statusIcon = useMemo(() => {
    const status = gmail?.integration?.status;
    if (status === "ACTIVE")
      return <CheckCircle2 size={16} color={colors.success} />;
    if (status === "PAUSED")
      return <Pause size={16} color={colors.textMuted} />;
    if (status === "ERROR")
      return <AlertCircle size={16} color={colors.danger} />;
    return <WifiOff size={16} color={colors.textMuted} />;
  }, [gmail?.integration?.status, colors.danger, colors.textMuted]);

  return (
    <View style={sectionStackStyle} accessibilityLabel="Gmail integration">
      <CrawlTabPanelHeader
        icon={Mail}
        title={t("gmail.title")}
        subtitle={t("gmail.description")}
        trailing={
          isConnected ? (
            <ConfigurationOutlineButton
              label={t("gmail.refresh")}
              loading={refreshing || gmailLoading}
              onPress={refreshAll}
              icon={ActionIcons.refresh}
            />
          ) : null
        }
      />

      {gmailLoading && !gmail ? (
        <CrawlPanelCard title={t("crawl.tabs.gmail")}>
          <View style={styles.centered}>
            <ActivityIndicator color={colors.primary} />
          </View>
        </CrawlPanelCard>
      ) : !isConnected ? (
        <CrawlPanelCard
          title={t("gmail.connect.title")}
          subtitle={t("gmail.connect.subtitle")}
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
              <Mail size={28} color={colors.textMuted} />
            </View>
            <Text
              style={[
                typography.body,
                { color: colors.textMuted, textAlign: "center" },
              ]}
            >
              {t("gmail.connect.description")}
            </Text>
          </View>
          <View style={panelBodyStyle}>
            <AppTextField
              label={t("gmail.form.clientId")}
              placeholder={t("gmail.form.clientIdPlaceholder")}
              value={credentials.clientId}
              onChangeText={(clientId) =>
                setCredentials((current) => ({ ...current, clientId }))
              }
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <AppTextField
              label={t("gmail.form.clientSecret")}
              placeholder="••••••••••••••••"
              value={credentials.clientSecret}
              onChangeText={(clientSecret) =>
                setCredentials((current) => ({ ...current, clientSecret }))
              }
              secureTextEntry
              autoCapitalize="none"
              style={connectorCredentialInputStyle}
            />
            <ConnectorRedirectUriField
              label={t("gmail.form.redirectUri")}
              value={credentials.redirectUri}
              onCopy={() => void copyRedirectUri()}
              copyA11yLabel={t("gmail.form.copyRedirectA11y")}
            />
            <Text style={[typography.caption, { color: colors.textMuted }]}>
              {t("gmail.form.redirectUriHint")}
            </Text>

            <View style={[styles.actions, { gap: spacing.sm }]}>
              <ConnectorPanelButton
                label={t("gmail.form.saveCredentials")}
                disabled={!canSave}
                loading={saving}
                onPress={() => void handleSaveGmail(credentials)}
              />
              <ConnectorPanelButton
                label={t("gmail.form.connectGmail")}
                disabled={!canConnect}
                loading={saving}
                onPress={() => void handleConnectGmail()}
              />
            </View>
            {!activeProjectId ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t("gmail.form.selectProject")}
              </Text>
            ) : !gmail?.credentials?.configured ? (
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t("gmail.form.saveBeforeConnect")}
              </Text>
            ) : null}
          </View>
        </CrawlPanelCard>
      ) : (
        <>
          <CrawlPanelCard
            title={gmail?.integration?.email_address ?? t("crawl.tabs.gmail")}
            subtitle={t("gmail.status.subtitle")}
            headerAction={
              <CrawlStatusBadge
                label={gmail?.integration?.status ?? "UNKNOWN"}
                tone={integrationStatusTone(gmail?.integration?.status)}
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
                    {t("gmail.stats.indexedForChat")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {gmail?.integration?.emails_indexed ?? 0}
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
                    {t("gmail.stats.awaitingReview")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {gmail?.inbox.total ?? 0}
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
                    {t("gmail.stats.autoSyncEvery")}
                  </Text>
                  <Text
                    style={[typography.headingSemibold, { color: colors.text }]}
                  >
                    {gmail?.integration?.cadence_minutes != null
                      ? t("common.minutesShort", {
                          count: gmail.integration.cadence_minutes,
                        })
                      : "–"}
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
                    {t("gmail.stats.lastSynced")}
                  </Text>
                  <Text
                    style={[
                      typography.body,
                      { color: colors.text, fontWeight: "500" },
                    ]}
                  >
                    {formatSyncDate(
                      gmail?.integration?.last_sync_at,
                      t("common.never"),
                    )}
                  </Text>
                </View>
              </View>

              {gmail?.integration?.status === "ERROR" ? (
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
                    {t("gmail.error.banner")}
                  </Text>
                </View>
              ) : null}

              {hasRunningJob ? (
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
                    {t("gmail.sync.inProgress")}
                  </Text>
                </View>
              ) : null}

              <View style={[styles.actions, { gap: spacing.sm }]}>
                <ConnectorPanelButton
                  label={t("gmail.actions.syncNow")}
                  loading={saving || hasRunningJob}
                  disabled={gmail?.integration?.status === "PAUSED"}
                  onPress={() => void handleSyncGmail()}
                />
                {gmail?.integration?.status === "ACTIVE" ? (
                  <ConfigurationOutlineButton
                    label={t("gmail.actions.pauseAutoSync")}
                    loading={saving}
                    onPress={() => void handlePauseGmail()}
                    icon={Pause}
                  />
                ) : gmail?.integration?.status === "PAUSED" ? (
                  <ConfigurationOutlineButton
                    label={t("gmail.actions.resumeAutoSync")}
                    loading={saving}
                    onPress={() => void handleResumeGmail()}
                    icon={Play}
                  />
                ) : null}
                <ConfigurationOutlineButton
                  label={t("common.disconnect")}
                  loading={saving}
                  onPress={() => void handleDisconnectGmail()}
                  icon={ActionIcons.disconnect}
                />
              </View>
            </View>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("gmail.inbox.title")}
            subtitle={t("gmail.inbox.subtitle")}
            inlineHeaderAction
            headerAction={
              <View style={[styles.actions, { gap: spacing.sm }]}>
                {(gmail?.inbox.total ?? 0) > 0 ? (
                  <CrawlStatusBadge
                    label={String(gmail?.inbox.total ?? 0)}
                    tone="muted"
                  />
                ) : null}
                <AppButton
                  label={t("gmail.inbox.indexSelected", {
                    count: selectedCount,
                  })}
                  size="compact"
                  loading={saving}
                  disabled={selectedCount === 0}
                  onPress={() => void handleIndexGmailInbox()}
                />
              </View>
            }
          >
            <StatePanel
              isEmpty={(gmail?.inbox.items.length ?? 0) === 0}
              emptyLabel={t("gmail.inbox.empty")}
              loading={gmailLoading}
            >
              {(gmail?.inbox.items.length ?? 0) > 0 ? (
                <View style={panelBodyStyle}>
                  <View style={[styles.inboxToolbar, { gap: spacing.sm }]}>
                    <Text
                      style={[
                        typography.caption,
                        { color: colors.textMuted, flex: 1 },
                      ]}
                    >
                      {t("gmail.inbox.showing", {
                        visible: gmail?.inbox.items.length ?? 0,
                        total: gmail?.inbox.total ?? 0,
                      })}
                    </Text>
                    <View style={[styles.actions, { gap: spacing.sm }]}>
                      <ConfigurationOutlineButton
                        label={t("gmail.inbox.selectVisible")}
                        onPress={selectVisibleGmailInbox}
                      />
                      <ConfigurationOutlineButton
                        label={t("gmail.inbox.selectAllPages")}
                        onPress={selectAllGmailInbox}
                      />
                      <ConfigurationOutlineButton
                        label={t("common.clear")}
                        disabled={selectedCount === 0}
                        onPress={clearGmailSelection}
                      />
                      <ConfigurationOutlineButton
                        label={t("gmail.inbox.dismissSelected")}
                        loading={saving}
                        disabled={selectedCount === 0}
                        onPress={() => void handleDismissGmailInbox()}
                      />
                    </View>
                  </View>
                  <View
                    style={[
                      styles.inboxList,
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
                      {gmail?.inbox.items.map((message) => {
                        const checked =
                          gmailAllInboxSelected ||
                          gmailStagedSelected.includes(message.id);
                        return (
                          <Pressable
                            key={message.id}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked }}
                            onPress={() =>
                              toggleGmailStagedSelection(message.id)
                            }
                            style={({ pressed, hovered }) => [
                              styles.inboxRow,
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
                                {message.subject}
                              </Text>
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.textMuted },
                                ]}
                                numberOfLines={1}
                              >
                                {message.sender}
                              </Text>
                              {message.date_raw ? (
                                <Text
                                  style={[
                                    typography.caption,
                                    { color: colors.textMuted },
                                  ]}
                                >
                                  {message.date_raw}
                                </Text>
                              ) : null}
                              <Text
                                style={[
                                  typography.caption,
                                  { color: colors.textMuted },
                                ]}
                                numberOfLines={2}
                              >
                                {message.preview}
                              </Text>
                            </View>
                          </Pressable>
                        );
                      })}
                    </AppScrollView>
                  </View>
                  {hasMoreInbox ? (
                    <ConfigurationOutlineButton
                      label={t("gmail.inbox.loadMore", {
                        visible: gmail?.inbox.items.length ?? 0,
                        total: gmail?.inbox.total ?? 0,
                      })}
                      loading={gmailInboxLoadingMore}
                      onPress={() => void loadMoreGmailInbox()}
                    />
                  ) : null}
                </View>
              ) : null}
            </StatePanel>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("gmail.jobs.title")}
            subtitle={t("gmail.jobs.subtitle")}
          >
            <StatePanel
              isEmpty={(gmail?.jobs.length ?? 0) === 0}
              emptyLabel={t("gmail.jobs.empty")}
              loading={gmailLoading}
            >
              {(gmail?.jobs.length ?? 0) > 0 ? (
                <View style={panelBodyStyle}>
                  {gmail?.jobs.map((job) => {
                    const isRunning =
                      job.status === "RUNNING" || job.status === "PENDING";
                    const durationSeconds =
                      job.finished_at && job.queued_at
                        ? Math.max(
                            0,
                            Math.round(
                              (new Date(job.finished_at).getTime() -
                                new Date(job.queued_at).getTime()) /
                                1000,
                            ),
                          )
                        : null;
                    return (
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
                        <View style={styles.jobHeader}>
                          <View style={styles.jobStatusIcon}>
                            {isRunning ? (
                              <ActivityIndicator
                                size="small"
                                color={colors.primary}
                              />
                            ) : job.status === "COMPLETED" ? (
                              <CheckCircle2 size={16} color={colors.success} />
                            ) : job.status === "FAILED" ? (
                              <AlertCircle size={16} color={colors.danger} />
                            ) : null}
                          </View>
                          <CrawlStatusBadge
                            label={job.status}
                            tone={job.status === "FAILED" ? "danger" : "muted"}
                            preserveCase
                          />
                          <Text
                            style={[
                              typography.caption,
                              { color: colors.textMuted, flex: 1 },
                            ]}
                          >
                            {formatSyncDate(
                              job.finished_at ??
                                job.started_at ??
                                job.queued_at,
                              t("common.never"),
                            )}
                          </Text>
                        </View>
                        <Text
                          style={[
                            typography.caption,
                            { color: colors.textMuted },
                          ]}
                        >
                          {t("gmail.jobs.fetchedIndexed", {
                            fetched: job.emails_fetched,
                            indexed: job.emails_indexed,
                          })}
                          {durationSeconds != null
                            ? t("gmail.jobs.duration", {
                                seconds: durationSeconds,
                              })
                            : ""}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              ) : null}
            </StatePanel>
          </CrawlPanelCard>

          <CrawlPanelCard
            title={t("gmail.indexed.title")}
            subtitle={t("gmail.indexed.subtitle")}
            headerAction={
              gmailDocuments.length > 0 ? (
                <CrawlStatusBadge
                  label={String(gmailDocuments.length)}
                  tone="muted"
                />
              ) : undefined
            }
          >
            <StatePanel
              isEmpty={gmailDocuments.length === 0}
              emptyLabel={t("gmail.indexed.empty")}
              loading={gmailLoading}
            >
              {gmailDocuments.length > 0 ? (
                <AppScrollView
                  nestedScrollEnabled
                  scrollbarVariant="overlay"
                  style={styles.scrollList}
                >
                  <View style={panelBodyStyle}>
                    {gmailDocuments.map((doc) => (
                      <View
                        key={doc.id}
                        style={[
                          styles.indexedEmailRow,
                          listRowStyle,
                          {
                            borderColor: colors.border,
                            borderRadius: controlRadius,
                          },
                        ]}
                      >
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => handleViewDocument(doc.id)}
                          style={({ pressed, hovered }) => [
                            styles.indexedEmailCopy,
                            {
                              backgroundColor: pressed
                                ? colors.surfaceMuted
                                : hovered
                                  ? colors.surfaceHover
                                  : "transparent",
                              borderRadius: controlRadius,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              typography.body,
                              { color: colors.text, fontWeight: "500" },
                            ]}
                            numberOfLines={2}
                          >
                            {doc.title ?? doc.name}
                          </Text>
                          <Text
                            style={[
                              typography.caption,
                              { color: colors.textMuted },
                            ]}
                          >
                            {formatSyncDate(doc.indexedAt, t("common.never"))} ·{" "}
                            {formatDocumentChunkLabel(doc.chunksCount)}
                          </Text>
                        </Pressable>
                        <View style={styles.indexedEmailActions}>
                          <CrawlStatusBadge
                            label={doc.status}
                            tone="muted"
                            preserveCase
                          />
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(
                              "gmail.indexed.viewEmailA11y",
                            )}
                            onPress={() => handleViewDocument(doc.id)}
                            hitSlop={8}
                            style={styles.indexedEmailIconBtn}
                          >
                            <Eye size={16} color={colors.textMuted} />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(
                              "gmail.indexed.editEmailA11y",
                            )}
                            onPress={() => handleEditDocument(doc.id)}
                            hitSlop={8}
                            style={styles.indexedEmailIconBtn}
                          >
                            <ActionIcons.edit
                              size={16}
                              color={colors.textMuted}
                            />
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={t(
                              "gmail.indexed.deleteEmailA11y",
                            )}
                            onPress={() =>
                              openSheet({
                                type: "confirm-delete-document",
                                documentId: doc.id,
                              })
                            }
                            hitSlop={8}
                            style={styles.indexedEmailIconBtn}
                          >
                            <ActionIcons.delete
                              size={16}
                              color={colors.danger}
                            />
                          </Pressable>
                        </View>
                      </View>
                    ))}
                  </View>
                </AppScrollView>
              ) : null}
            </StatePanel>
          </CrawlPanelCard>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  emptyConnect: {
    alignItems: "center",
    gap: 10,
    paddingTop: 8,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 24,
  },
  statsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
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
  inboxToolbar: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 8,
  },
  inboxList: {
    borderWidth: 1,
    overflow: "hidden",
  },
  scrollList: {
    maxHeight: CONNECTOR_LIST_MAX_HEIGHT,
  },
  inboxRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  jobRow: {
    borderWidth: 1,
    padding: 12,
    gap: 6,
  },
  jobHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  jobStatusIcon: {
    width: 18,
    alignItems: "center",
  },
  indexedEmailRow: {
    borderWidth: 1,
    padding: 12,
    gap: 8,
  },
  indexedEmailCopy: {
    gap: 4,
    padding: 2,
  },
  indexedEmailActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 6,
  },
  indexedEmailIconBtn: {
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
  },
});
