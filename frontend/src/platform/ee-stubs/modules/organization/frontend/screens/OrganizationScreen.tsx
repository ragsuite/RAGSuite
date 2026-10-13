import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { AppKeyboardScreenScroll } from '@/shared/components/app-keyboard-screen-scroll';
import { Redirect } from 'expo-router';
import { useScrollBottomPadding } from '@/shared/hooks/use-scroll-bottom-padding';

import { useSession } from '@/features/auth/providers/session-provider';
import { OrganizationMembersPanel } from '@/features/organization/components/OrganizationMembersPanel';
import type { OrgUser } from '@/features/organization/types/organization.types';
import {
  handleDeactivateOrgUser,
  handleInviteOrgUser,
  handleListOrgUsers,
  handleUpdateOrgUser,
} from '@/features/organization/services/organization.service';
import { useOrgAdminAccess } from '@/features/organization/providers/org-admin-access-provider';
import type { SettingsFeedback } from '@/features/settings/types/settings.types';
import { useTranslation } from '@/i18n';
import {
  EnterpriseLockedPreview,
  OrganizationSsoMock,
} from '@/platform/ee-locked';
import { AppButton } from '@/shared/components/app-button';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { ActionIcons } from '@/shared/constants/action-icons';
import type { PageSizeOption } from '@/shared/constants/pagination';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useFeatureScreenLayout } from '@/shared/hooks/use-feature-screen-layout';
import { useOffsetPagination } from '@/shared/hooks/use-offset-pagination';
import { ToastFeedbackBridge } from '@/shared/toast/toast-feedback-bridge';

export type OrganizationPanelKey = 'users' | 'sso';

type Props = {
  panel?: OrganizationPanelKey | string;
};

export function OrganizationScreen({ panel = 'users' }: Props) {
  const { session } = useSession();
  const { t } = useTranslation();
  const { colors, spacing, typography } = useAppTheme();
  const scrollBottomPadding = useScrollBottomPadding();
  const { contentMaxWidth, horizontalPadding, isWeb } = useFeatureScreenLayout();
  const isNativeMobile = Platform.OS !== 'web';
  const { canAccess, isChecking, status, errorMessage } = useOrgAdminAccess();

  const isAdmin = Boolean(session?.user.isAdmin);
  const currentUserId = Number(session?.user.id);
  const hasOrgAdminAccess = isAdmin && canAccess;

  const [users, setUsers] = useState<OrgUser[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<SettingsFeedback>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const loadRequestIdRef = useRef(0);

  const filterResetKey = useMemo(
    () => JSON.stringify({ debouncedQuery, roleFilter }),
    [debouncedQuery, roleFilter],
  );

  const { page, pageSize, offset, totalPages, setPage, setPageSize } = useOffsetPagination({
    defaultPageSize: 20 as PageSizeOption,
    storageKey: 'org-members',
    total,
    filterResetKey,
  });

  const showFeedback = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setFeedback({ message, type });
  }, []);

  useEffect(() => {
    const handle = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(handle);
  }, [query]);

  const loadMembers = useCallback(async () => {
    return handleListOrgUsers({
      q: debouncedQuery || undefined,
      role: roleFilter || undefined,
      limit: pageSize,
      offset,
    });
  }, [debouncedQuery, offset, pageSize, roleFilter]);

  const loadPanel = useCallback(
    async (soft = false) => {
      const requestId = ++loadRequestIdRef.current;
      if (!soft) setLoading(true);
      setError(null);
      try {
        const list = await loadMembers();
        if (requestId === loadRequestIdRef.current) {
          setUsers(list.users);
          setTotal(list.total);
        }
      } catch (err) {
        if (requestId === loadRequestIdRef.current) {
          setError(err instanceof Error ? err.message : t('org.toast.error'));
        }
      } finally {
        if (requestId === loadRequestIdRef.current) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [loadMembers, t],
  );

  useEffect(() => {
    if (!hasOrgAdminAccess || panel !== 'users') return;
    void loadPanel();
  }, [hasOrgAdminAccess, loadPanel, panel]);

  const onInvite = useCallback(
    async (input: { username: string; email: string; role: OrgUser['role'] }) => {
      await handleInviteOrgUser({
        username: input.username,
        email: input.email,
        role: input.role,
      });
      const list = await loadMembers();
      setUsers(list.users);
      setTotal(list.total);
    },
    [loadMembers],
  );

  const onUpdateUser = useCallback(
    async (
      userId: number,
      input: { username?: string; email?: string; role?: OrgUser['role']; isActive?: boolean },
    ) => {
      await handleUpdateOrgUser(userId, input);
      const list = await loadMembers();
      setUsers(list.users);
      setTotal(list.total);
    },
    [loadMembers],
  );

  const onDeactivate = useCallback(
    async (userId: number) => {
      await handleDeactivateOrgUser(userId);
      const list = await loadMembers();
      setUsers(list.users);
      setTotal(list.total);
    },
    [loadMembers],
  );

  if (panel === 'sso') {
    return (
      <EnterpriseLockedPreview
        featureName={t('enterprise.locked.features.sso', { defaultValue: 'SSO / SAML / OIDC' })}
        message={t('enterprise.locked.messages.sso', {
          defaultValue:
            'SSO / SAML / OIDC is available in RAGSuite Enterprise. Use Projects for workspace admin in Community.',
        })}>
        <OrganizationSsoMock />
      </EnterpriseLockedPreview>
    );
  }

  if (!isAdmin) {
    return <Redirect href="/(app)/(tabs)" />;
  }

  if (isChecking) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppKeyboardScreenScroll
          contentContainerStyle={[
            styles.content,
            contentShellStyle(isNativeMobile, horizontalPadding, contentMaxWidth, spacing, scrollBottomPadding),
          ]}
        />
      </View>
    );
  }

  if (status === 'forbidden') {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <AppKeyboardScreenScroll
          contentContainerStyle={[
            styles.content,
            contentShellStyle(isNativeMobile, horizontalPadding, contentMaxWidth, spacing, scrollBottomPadding),
          ]}>
          <Text style={[typography.body, { color: colors.danger }]}>
            {errorMessage || t('org.toast.error')}
          </Text>
        </AppKeyboardScreenScroll>
      </View>
    );
  }

  const pageHeader = isWeb ? (
    <PageSectionHeader
      title={t('org.members.title')}
      subtitle={t(total === 1 ? 'org.members.subtitleOne' : 'org.members.subtitle', { count: total })}
      action={
        <AppButton
          size="compact"
          variant="cta"
          label={t('org.members.invite')}
          icon={ActionIcons.add}
          onPress={() => setInviteOpen(true)}
        />
      }
    />
  ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <AppKeyboardScreenScroll
        contentContainerStyle={[
          styles.content,
          contentShellStyle(isNativeMobile, horizontalPadding, contentMaxWidth, spacing, scrollBottomPadding),
        ]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadPanel(true);
            }}
          />
        }>
        {pageHeader}

        <OrganizationMembersPanel
          currentUserId={Number.isFinite(currentUserId) ? currentUserId : undefined}
          users={users}
          total={total}
          projects={[]}
          loading={loading}
          error={error}
          query={query}
          roleFilter={roleFilter}
          onQueryChange={setQuery}
          onRoleFilterChange={setRoleFilter}
          onRetry={() => void loadPanel()}
          showInviteAction={!isWeb}
          inviteOpen={inviteOpen}
          onInviteOpenChange={setInviteOpen}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          onInvite={onInvite}
          onUpdateUser={onUpdateUser}
          onDeactivate={onDeactivate}
          onLoadAssignments={async () => ({ assignments: [], canCreateProjects: false })}
          onSaveAssignments={async () => undefined}
          onFeedback={showFeedback}
        />
      </AppKeyboardScreenScroll>

      <ToastFeedbackBridge feedback={feedback} onDismiss={() => setFeedback(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  content: {
    width: '100%',
  },
});

function contentShellStyle(
  isNativeMobile: boolean,
  horizontalPadding: number | undefined,
  contentMaxWidth: number | undefined,
  spacing: { sm: number; md: number },
  scrollBottomPadding: number,
) {
  return {
    paddingHorizontal: isNativeMobile ? spacing.sm : horizontalPadding ?? spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: scrollBottomPadding,
    maxWidth: contentMaxWidth,
    alignSelf: 'center' as const,
    gap: spacing.sm,
  };
}
