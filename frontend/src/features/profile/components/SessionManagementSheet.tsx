import { Clock, LogOut, MapPin, Monitor } from 'lucide-react-native';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { useProfileCopy } from '@/features/profile/hooks/use-profile-copy';
import type { UserSessionResponse } from '@/features/profile/types/profile.api.types';
import { useTranslation } from '@/i18n';
import { AdaptiveOverlay } from '@/shared/components/adaptive/adaptive-overlay';
import { ConfirmOverlay } from '@/shared/components/adaptive/confirm-overlay';
import { AppSecondaryButton } from '@/shared/components/app-secondary-button';
import { StatusBadge } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ActionIcons } from '@/shared/constants/action-icons';

type Props = {
  visible: boolean;
  onClose: () => void;
  loadSessions: () => Promise<UserSessionResponse[]>;
  onRevokeSession: (sessionId: string) => Promise<void>;
  onRevokeOthers: () => Promise<void>;
};

export function formatSessionDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  const datePart = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const timePart = date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return `${datePart} at ${timePart}`;
}

export function formatSessionTimeAgo(
  value: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value || '—';
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return t('overview.time.justNow');
  if (diffMins < 60) {
    return diffMins === 1 ? t('overview.time.minuteAgo') : t('overview.time.minutesAgo', { count: diffMins });
  }
  if (diffHours < 24) {
    return diffHours === 1 ? t('overview.time.hourAgo') : t('overview.time.hoursAgo', { count: diffHours });
  }
  return diffDays === 1 ? t('overview.time.dayAgo') : t('overview.time.daysAgo', { count: diffDays });
}

function sessionLocationLine(session: UserSessionResponse) {
  return [session.location, session.ip_address].filter(Boolean).join(' • ') || '—';
}

const ACTION_SIZE = 'compact' as const;

type ConfirmState =
  | { kind: 'revoke-one'; sessionId: string }
  | { kind: 'revoke-all' }
  | null;

function SessionPanelCard({
  title,
  subtitle,
  titleRight,
  children,
}: {
  title?: string;
  subtitle?: string;
  titleRight?: React.ReactNode;
  children: React.ReactNode;
}) {
  const { colors, spacing, elevation, typography, surfaceRadius } = useAppTheme();
  const showHeader = Boolean(title);

  return (
    <View
      style={[
        styles.panelCard,
        elevation.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.border,
          borderRadius: surfaceRadius.card,
        },
      ]}>
      {showHeader ? (
        <View style={[styles.panelHeader, { paddingHorizontal: spacing.md, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: 6 }]}>
          <View style={styles.panelTitleRow}>
            <Text style={[typography.subtitle, styles.panelTitle, { color: colors.text, flex: 1 }]}>{title}</Text>
            {titleRight ? <View style={styles.panelTitleRight}>{titleRight}</View> : null}
          </View>
          {subtitle ? <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 18 }]}>{subtitle}</Text> : null}
        </View>
      ) : null}
      <View
        style={[
          styles.panelBody,
          {
            paddingHorizontal: spacing.md,
            paddingTop: showHeader ? 0 : spacing.md,
            paddingBottom: spacing.md,
            gap: spacing.md,
          },
        ]}>
        {children}
      </View>
    </View>
  );
}

function ActiveBadge({ label }: { label: string }) {
  return <StatusBadge label={label} tone="active" preserveCase />;
}

function SessionSeparator() {
  const { colors } = useAppTheme();
  return <View style={[styles.separator, { backgroundColor: colors.border }]} />;
}

function SessionMetaGrid({
  session,
  compact,
  copy,
  timeAgo,
}: {
  session: UserSessionResponse;
  compact?: boolean;
  copy: ReturnType<typeof useProfileCopy>['sessions'];
  timeAgo: string;
}) {
  const { colors, typography } = useAppTheme();

  return (
    <View style={[styles.metaGrid, compact ? styles.metaGridCompact : null]}>
      <View style={styles.metaItem}>
        <Clock size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, styles.metaLabel, { color: colors.textMuted }]}>{copy.lastActive}</Text>
          <Text style={[typography.body, styles.metaValue, { color: colors.text }]}>{timeAgo}</Text>
        </View>
      </View>
      <View style={styles.metaItem}>
        <MapPin size={16} color={colors.textMuted} />
        <View style={{ flex: 1 }}>
          <Text style={[typography.caption, styles.metaLabel, { color: colors.textMuted }]}>{copy.loggedIn}</Text>
          <Text style={[typography.body, styles.metaValue, { color: colors.text }]}>{formatSessionDate(session.created_at)}</Text>
        </View>
      </View>
    </View>
  );
}

function SessionDeviceBlock({ session }: { session: UserSessionResponse }) {
  const { colors, typography } = useAppTheme();

  return (
    <View style={styles.deviceRow}>
      <Monitor size={20} color={colors.textMuted} />
      <View style={{ flex: 1 }}>
        <Text style={[typography.body, styles.deviceName, { color: colors.text }]}>{session.device_info}</Text>
        <Text style={[typography.caption, { color: colors.textMuted, marginTop: 2, lineHeight: 18 }]}>
          {sessionLocationLine(session)}
        </Text>
      </View>
    </View>
  );
}

function SessionBody({
  session,
  compactMeta,
  copy,
  timeAgo,
}: {
  session: UserSessionResponse;
  compactMeta?: boolean;
  copy: ReturnType<typeof useProfileCopy>['sessions'];
  timeAgo: string;
}) {
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.md }}>
      <SessionDeviceBlock session={session} />
      <SessionSeparator />
      <SessionMetaGrid session={session} compact={compactMeta} copy={copy} timeAgo={timeAgo} />
    </View>
  );
}

function OtherSessionItem({
  session,
  revoking,
  onRevoke,
  compactMeta,
  copy,
  timeAgo,
}: {
  session: UserSessionResponse;
  revoking?: boolean;
  onRevoke: () => void;
  compactMeta?: boolean;
  copy: ReturnType<typeof useProfileCopy>['sessions'];
  timeAgo: string;
}) {
  const { spacing } = useAppTheme();

  return (
    <View style={[styles.otherSessionRow, { gap: spacing.md }]}>
      <View style={[styles.otherSessionMain, { gap: spacing.md }]}>
        <SessionDeviceBlock session={session} />
        <SessionMetaGrid session={session} compact={compactMeta} copy={copy} timeAgo={timeAgo} />
      </View>
      <AppSecondaryButton
        label={copy.revoke}
        icon={ActionIcons.delete}
        onPress={onRevoke}
        loading={revoking}
        size={ACTION_SIZE}
        noTopMargin
      />
    </View>
  );
}

export function SessionManagementSheet({
  visible,
  onClose,
  loadSessions,
  onRevokeSession,
  onRevokeOthers,
}: Props) {
  const { colors, spacing, typography, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const profileCopy = useProfileCopy();
  const copy = profileCopy.sessions;
  const { width } = useWindowDimensions();
  const compactMeta = width < 420;

  const [sessions, setSessions] = useState<UserSessionResponse[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [revokingAll, setRevokingAll] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setSessions(await loadSessions());
    } catch {
      setError(true);
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [loadSessions]);

  useEffect(() => {
    if (!visible) {
      setConfirm(null);
      return;
    }
    void refresh();
  }, [refresh, visible]);

  const currentSession = useMemo(() => sessions.find((s) => s.is_current), [sessions]);
  const otherSessions = useMemo(() => sessions.filter((s) => !s.is_current), [sessions]);
  const pendingSession = confirm?.kind === 'revoke-one' ? otherSessions.find((s) => s.id === confirm.sessionId) : null;

  const handleRevokeOne = async () => {
    if (confirm?.kind !== 'revoke-one') return;
    setBusyId(confirm.sessionId);
    try {
      await onRevokeSession(confirm.sessionId);
      setConfirm(null);
      await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const handleRevokeAll = async () => {
    setRevokingAll(true);
    try {
      await onRevokeOthers();
      setConfirm(null);
      await refresh();
    } finally {
      setRevokingAll(false);
    }
  };

  return (
    <>
      <AdaptiveOverlay
        visible={visible}
        title={copy.title}
        subtitle={copy.description}
        onClose={onClose}
        size="sideSheetXl"
        presentation="sideSheet"
        scrollable
        contentStyle={{ gap: spacing.lg, paddingBottom: spacing.sm }}>
        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.sm }]}>{copy.loading}</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={[typography.body, { color: colors.danger, fontWeight: '500' }]}>{copy.loadFailed}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs }]}>{copy.loadFailedHint}</Text>
            <View style={{ marginTop: spacing.md }}>
              <AppSecondaryButton label={t('common.retry')} onPress={() => void refresh()} size={ACTION_SIZE} noTopMargin />
            </View>
          </View>
        ) : (
          <>
            {currentSession ? (
              <SessionPanelCard title={copy.currentTitle} subtitle={copy.currentDescription} titleRight={<ActiveBadge label={copy.currentBadge} />}>
                <SessionBody
                  session={currentSession}
                  compactMeta={compactMeta}
                  copy={copy}
                  timeAgo={formatSessionTimeAgo(currentSession.last_activity, t)}
                />
              </SessionPanelCard>
            ) : null}

            {otherSessions.length > 0 ? (
              <SessionPanelCard
                title={copy.otherTitle}
                subtitle={copy.otherDescription(otherSessions.length)}
                titleRight={
                  <AppSecondaryButton
                    label={revokingAll ? copy.revoking : copy.revokeAll}
                    icon={LogOut}
                    onPress={() => setConfirm({ kind: 'revoke-all' })}
                    disabled={revokingAll}
                    loading={revokingAll}
                    size={ACTION_SIZE}
                    noTopMargin
                  />
                }>
                {otherSessions.map((session, index) => (
                  <View key={session.id} style={{ gap: spacing.md }}>
                    <OtherSessionItem
                      session={session}
                      compactMeta={compactMeta}
                      revoking={busyId === session.id}
                      onRevoke={() => setConfirm({ kind: 'revoke-one', sessionId: session.id })}
                      copy={copy}
                      timeAgo={formatSessionTimeAgo(session.last_activity, t)}
                    />
                    {index < otherSessions.length - 1 ? <SessionSeparator /> : null}
                  </View>
                ))}
              </SessionPanelCard>
            ) : currentSession ? (
              <SessionPanelCard>
                <View style={styles.emptyState}>
                  <Text style={[typography.body, { color: colors.textMuted }]}>{copy.noOtherSessions}</Text>
                  <Text style={[typography.caption, { color: colors.textMuted, marginTop: spacing.xs, textAlign: 'center' }]}>
                    {copy.onlyThisDevice}
                  </Text>
                </View>
              </SessionPanelCard>
            ) : (
              <SessionPanelCard>
                <View style={styles.emptyState}>
                  <Text style={[typography.body, { color: colors.textMuted }]}>{copy.noneFound}</Text>
                </View>
              </SessionPanelCard>
            )}
          </>
        )}
      </AdaptiveOverlay>

      <ConfirmOverlay
        visible={confirm?.kind === 'revoke-one'}
        title={copy.confirmRevokeTitle}
        subtitle={copy.confirmRevokeDescription}
        confirmLabel={copy.confirmRevokeAction}
        cancelLabel={copy.cancel}
        loading={busyId !== null}
        destructive
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleRevokeOne()}>
        {pendingSession ? (
          <View style={[styles.confirmDetail, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>{pendingSession.device_info}</Text>
            <Text style={[typography.caption, { color: colors.textMuted, marginTop: 4 }]}>{sessionLocationLine(pendingSession)}</Text>
          </View>
        ) : null}
      </ConfirmOverlay>

      <ConfirmOverlay
        visible={confirm?.kind === 'revoke-all'}
        title={copy.confirmRevokeAllTitle}
        subtitle={copy.confirmRevokeAllDescription}
        confirmLabel={copy.confirmRevokeAllAction}
        cancelLabel={copy.cancel}
        loading={revokingAll}
        destructive
        onClose={() => setConfirm(null)}
        onConfirm={() => void handleRevokeAll()}>
        {otherSessions.length > 0 ? (
          <View style={[styles.confirmDetail, { backgroundColor: colors.surfaceMuted, borderRadius: surfaceRadius.card }]}>
            <Text style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
              {copy.confirmRevokeAllCount(otherSessions.length)}
            </Text>
          </View>
        ) : null}
      </ConfirmOverlay>
    </>
  );
}

const styles = StyleSheet.create({
  panelCard: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelHeader: {},
  panelTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  panelTitle: {
    fontSize: 16,
  },
  panelTitleRight: {
    flexShrink: 0,
  },
  panelBody: {},
  separator: {
    height: StyleSheet.hairlineWidth,
    width: '100%',
  },
  center: {
    minHeight: 160,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  deviceRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  deviceName: {
    fontWeight: '500',
    fontSize: 15,
  },
  metaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  metaGridCompact: {
    flexDirection: 'column',
    gap: 12,
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    minWidth: 150,
    flex: 1,
  },
  metaLabel: {
    fontSize: 12,
    lineHeight: 16,
  },
  metaValue: {
    fontWeight: '500',
    fontSize: 14,
    lineHeight: 20,
  },
  otherSessionRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  otherSessionMain: {
    flex: 1,
    minWidth: 0,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 28,
  },
  confirmDetail: {
    padding: 12,
  },
});
