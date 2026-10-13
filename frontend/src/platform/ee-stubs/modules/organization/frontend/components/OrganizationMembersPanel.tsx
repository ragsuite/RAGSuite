import { Search } from 'lucide-react-native';
import React, { useCallback, useMemo, useState } from 'react';
import { Platform, StyleSheet, TextInput, View } from 'react-native';

import {
  EditMemberSheet,
  InviteMemberSheet,
} from '@/features/organization/components/OrganizationMemberSheets';
import { OrganizationMemberRow } from '@/features/organization/components/OrganizationMemberRow';
import type {
  OrgProject,
  OrgProjectAssignment,
  OrgUser,
  OrganizationRole,
} from '@/features/organization/types/organization.types';
import { useTranslation } from '@/i18n';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { ListPaginationFooter } from '@/shared/components/list-pagination-footer';
import { PaginatedTablePanel } from '@/shared/components/paginated-table-panel';
import { ActionIcons } from '@/shared/constants/action-icons';
import { TOOLBAR_CONTROL_HEIGHT } from '@/shared/constants/layout';
import type { PageSizeOption } from '@/shared/constants/pagination';
import { TableHeaderLabel } from '@/shared/components/brand/table-header-label';
import { useConfirm } from '@/shared/confirm/confirm-provider';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { ORG_MEMBERS_TABLE } from '@/features/organization/utils/organization-members-table';
import { focusFieldShellStyle, webSuppressInputOutline } from '@/shared/utils/focus-ring-style';
import { getToolbarSearchInputStyle } from '@/shared/utils/input-text-style';
import { searchInputAutofillProps } from '@/shared/utils/search-input-autofill';

type FeedbackFn = (message: string, type?: 'success' | 'error') => void;

type Props = {
  currentUserId?: number;
  users: OrgUser[];
  total: number;
  projects: OrgProject[];
  loading: boolean;
  error: string | null;
  query: string;
  roleFilter: string;
  onQueryChange: (value: string) => void;
  onRoleFilterChange: (value: string) => void;
  onRetry: () => void;
  onInvite: (input: {
    username: string;
    email: string;
    role: OrganizationRole;
  }) => Promise<void>;
  onUpdateUser: (
    userId: number,
    input: { username?: string; email?: string; role?: OrganizationRole; isActive?: boolean },
  ) => Promise<void>;
  onDeactivate: (userId: number) => Promise<void>;
  onLoadAssignments: (userId: number) => Promise<{
    assignments: OrgProjectAssignment[];
    canCreateProjects: boolean;
  }>;
  onSaveAssignments: (
    userId: number,
    assignments: OrgProjectAssignment[],
    canCreateProjects: boolean,
  ) => Promise<void>;
  onFeedback: FeedbackFn;
  showInviteAction?: boolean;
  inviteOpen?: boolean;
  onInviteOpenChange?: (open: boolean) => void;
  page: number;
  pageSize: PageSizeOption;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: PageSizeOption) => void;
};

export function OrganizationMembersPanel({
  currentUserId,
  users,
  total,
  projects: _projects,
  loading,
  error,
  query,
  roleFilter,
  onQueryChange,
  onRoleFilterChange,
  onRetry,
  onInvite,
  onUpdateUser,
  onDeactivate,
  onLoadAssignments: _onLoadAssignments,
  onSaveAssignments: _onSaveAssignments,
  onFeedback,
  showInviteAction = false,
  inviteOpen: inviteOpenProp,
  onInviteOpenChange,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
}: Props) {
  const { t } = useTranslation();
  const { confirm } = useConfirm();
  const { colors, spacing, surfaceRadius, typography } = useAppTheme();
  const isNativeMobile = Platform.OS !== 'web';
  const [searchFocused, setSearchFocused] = useState(false);

  const [inviteOpenInternal, setInviteOpenInternal] = useState(false);
  const inviteOpen = inviteOpenProp ?? inviteOpenInternal;
  const setInviteOpen = onInviteOpenChange ?? setInviteOpenInternal;
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [busy, setBusy] = useState(false);

  const roleOptions = useMemo(
    () => [
      { key: '', label: t('org.members.filter.allRoles') },
      { key: 'org_admin', label: t('org.members.role.orgAdmin') },
      { key: 'member', label: t('org.members.role.member') },
    ],
    [t],
  );

  const listIsEmpty = !loading && users.length === 0;

  const handleDeactivateMember = useCallback(
    (user: OrgUser) => {
      if (user.role === 'org_admin' && user.id === currentUserId) {
        onFeedback(t('org.members.errors.selfProtected'), 'error');
        return;
      }
      void (async () => {
        const ok = await confirm({
          title: t('org.members.confirm.deactivate.title'),
          message: t('org.members.confirm.deactivate.message', { name: user.username }),
          cancelLabel: t('common.cancel'),
          confirmLabel: t('org.members.confirm.deactivate.confirm'),
          destructive: true,
        });
        if (!ok) return;
        try {
          setBusy(true);
          await onDeactivate(user.id);
          onFeedback(t('org.toast.userDeactivated'));
        } catch (err) {
          onFeedback(err instanceof Error ? err.message : t('org.toast.error'), 'error');
        } finally {
          setBusy(false);
        }
      })();
    },
    [confirm, currentUserId, onDeactivate, onFeedback, t],
  );

  const handleDeleteMember = useCallback(
    (user: OrgUser) => {
      if (user.role === 'org_admin' && user.id === currentUserId) {
        onFeedback(t('org.members.errors.selfProtected'), 'error');
        return;
      }
      if (user.isActive) return;
      void (async () => {
        const ok = await confirm({
          title: t('org.members.confirm.delete.title'),
          message: t('org.members.confirm.delete.message', { name: user.username }),
          cancelLabel: t('common.cancel'),
          confirmLabel: t('org.members.confirm.delete.confirm'),
          destructive: true,
        });
        if (!ok) return;
        try {
          setBusy(true);
          await onDeactivate(user.id);
          onFeedback(t('org.toast.userDeleted'));
        } catch (err) {
          onFeedback(err instanceof Error ? err.message : t('org.toast.error'), 'error');
        } finally {
          setBusy(false);
        }
      })();
    },
    [confirm, currentUserId, onDeactivate, onFeedback, t],
  );

  const tableHeader = (
    <View
      style={[
        styles.headerRow,
        {
          backgroundColor: colors.surfaceMuted,
          borderBottomColor: colors.border,
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm,
        },
      ]}>
      <TableHeaderLabel style={styles.headerIdentity}>
        {t('org.members.col.user')}
      </TableHeaderLabel>
      <TableHeaderLabel style={styles.headerRole} align="center">
        {t('org.members.col.role')}
      </TableHeaderLabel>
      <TableHeaderLabel style={styles.headerStatus} align="center">
        {t('org.members.col.status')}
      </TableHeaderLabel>
      <TableHeaderLabel style={styles.headerActions} align="center">
        {t('org.members.col.actions')}
      </TableHeaderLabel>
    </View>
  );

  const paginationFooter = (
    <ListPaginationFooter
      page={page}
      pageSize={pageSize}
      total={total}
      totalPages={totalPages}
      loading={loading}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      itemLabel={t('org.members.pagination.itemLabel')}
      compact={isNativeMobile}
    />
  );

  return (
    <View style={{ gap: spacing.sm }}>
      <View style={[isNativeMobile ? styles.filtersNative : styles.filters, { gap: spacing.sm }]}>
        <View style={isNativeMobile ? [styles.searchRow, { gap: spacing.xs }] : styles.searchRowWeb}>
        <View
          style={[
            styles.searchWrap,
            isNativeMobile ? styles.searchWrapNative : null,
            {
              height: TOOLBAR_CONTROL_HEIGHT,
              minHeight: TOOLBAR_CONTROL_HEIGHT,
              borderRadius: surfaceRadius.input,
              backgroundColor: colors.surface,
              paddingHorizontal: spacing.sm,
              ...focusFieldShellStyle(searchFocused, colors.primary, colors.border),
            },
          ]}>
          <Search size={16} color={searchFocused ? colors.primary : colors.textMuted} />
          <TextInput
            {...searchInputAutofillProps}
            accessibilityLabel={t('org.members.searchPlaceholder')}
            placeholder={t('org.members.searchPlaceholder')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={onQueryChange}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
            returnKeyType="search"
            clearButtonMode="while-editing"
            style={[
              getToolbarSearchInputStyle(typography.body, TOOLBAR_CONTROL_HEIGHT),
              styles.searchInput,
              { color: colors.text },
              Platform.OS === 'web' ? styles.searchInputWeb : null,
              webSuppressInputOutline(),
            ]}
          />
        </View>
        {showInviteAction && isNativeMobile ? (
          <AppButton
            size="compact"
            variant="cta"
            iconOnly
            label={t('org.members.invite')}
            icon={ActionIcons.add}
            onPress={() => setInviteOpen(true)}
          />
        ) : null}
        </View>
        <View style={isNativeMobile ? styles.roleFilterNative : styles.roleFilterWeb}>
          <AppSelectField
            label=""
            value={roleFilter}
            onChange={onRoleFilterChange}
            options={roleOptions}
            variant="inline"
            controlHeight={TOOLBAR_CONTROL_HEIGHT}
          />
        </View>
      </View>

      <StatePanel loading={loading} error={error} onRetry={onRetry}>
        {isNativeMobile ? (
          <View style={{ gap: spacing.sm }}>
            {listIsEmpty ? (
              <EmptyStateView
                title={t('org.members.empty')}
                description={t('org.members.emptyHint')}
                variant="inline"
                actionLabel={t('org.members.invite')}
                onAction={() => setInviteOpen(true)}
              />
            ) : (
              users.map((user) => (
                <OrganizationMemberRow
                  key={user.id}
                  user={user}
                  showAssignProjects={false}
                  disableDeactivate={user.role === 'org_admin' && user.id === currentUserId}
                  disableDelete={user.role === 'org_admin' && user.id === currentUserId}
                  onEdit={() => setEditUser(user)}
                  onDeactivate={() => handleDeactivateMember(user)}
                  onDelete={() => handleDeleteMember(user)}
                />
              ))
            )}
            {!listIsEmpty ? paginationFooter : null}
          </View>
        ) : (
          <PaginatedTablePanel
            panelRadius={surfaceRadius.card}
            topSpacing={0}
            scrollResetKey={`${page}-${pageSize}-${query}-${roleFilter}`}
            header={tableHeader}
            footer={!listIsEmpty ? paginationFooter : undefined}>
            {listIsEmpty ? (
              <EmptyStateView
                title={t('org.members.empty')}
                description={t('org.members.emptyHint')}
                variant="inline"
                actionLabel={t('org.members.invite')}
                onAction={() => setInviteOpen(true)}
              />
            ) : (
              users.map((user, index) => (
                <OrganizationMemberRow
                  key={user.id}
                  user={user}
                  isLast={index === users.length - 1}
                  showAssignProjects={false}
                  disableDeactivate={user.role === 'org_admin' && user.id === currentUserId}
                  disableDelete={user.role === 'org_admin' && user.id === currentUserId}
                  onEdit={() => setEditUser(user)}
                  onDeactivate={() => handleDeactivateMember(user)}
                  onDelete={() => handleDeleteMember(user)}
                />
              ))
            )}
          </PaginatedTablePanel>
        )}
      </StatePanel>

      <InviteMemberSheet
        visible={inviteOpen}
        busy={busy}
        onClose={() => setInviteOpen(false)}
        onSubmit={async (input) => {
          setBusy(true);
          try {
            await onInvite(input);
            setInviteOpen(false);
            onFeedback(t('org.toast.userInvited'));
          } catch (err) {
            onFeedback(err instanceof Error ? err.message : t('org.toast.error'), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />

      <EditMemberSheet
        user={editUser}
        busy={busy}
        onClose={() => setEditUser(null)}
        onSubmit={async (input) => {
          if (!editUser) return;
          setBusy(true);
          try {
            await onUpdateUser(editUser.id, input);
            setEditUser(null);
            onFeedback(t('org.toast.userUpdated'));
          } catch (err) {
            onFeedback(err instanceof Error ? err.message : t('org.toast.error'), 'error');
          } finally {
            setBusy(false);
          }
        }}
      />

    </View>
  );
}

const styles = StyleSheet.create({
  filters: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
  },
  filtersNative: {
    flexDirection: 'column',
    alignItems: 'stretch',
  },
  searchWrap: {
    flex: 1,
    minWidth: 180,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    gap: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  searchRowWeb: {
    flex: 1,
    minWidth: 180,
  },
  searchWrapNative: {
    flex: 1,
    width: undefined,
    minWidth: 0,
  },
  roleFilterWeb: {
    minWidth: 160,
  },
  roleFilterNative: {
    width: '100%',
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
  },
  searchInputWeb: {
    outlineStyle: 'none',
  } as unknown as object,
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: ORG_MEMBERS_TABLE.rowGap,
    borderBottomWidth: 1,
  },
  headerIdentity: {
    flex: ORG_MEMBERS_TABLE.identityFlex,
    minWidth: ORG_MEMBERS_TABLE.identityMinWidth,
  },
  headerRole: {
    width: ORG_MEMBERS_TABLE.roleWidth,
    flexShrink: 0,
  },
  headerStatus: {
    width: ORG_MEMBERS_TABLE.statusWidth,
    flexShrink: 0,
  },
  headerActions: {
    width: ORG_MEMBERS_TABLE.actionsWidth,
    flexShrink: 0,
  },
});
