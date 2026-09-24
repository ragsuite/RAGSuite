import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Check, KeyRound, Plug, Power, PowerOff } from 'lucide-react-native';
import { ActionIcons } from '@/shared/constants/action-icons';

import { ConfigurationCreateButton, ConfigurationOutlineButton } from '@/features/configuration/components/configuration-actions';
import { ConfigurationPanelCard } from '@/features/configuration/components/ConfigurationPanelCard';
import { ConfigurationPrimaryTabs } from '@/features/configuration/components/ConfigurationTabs';
import { ConfigurationSheet } from '@/features/configuration/components/ConfigurationSheet';
import { ConfigurationSkeleton } from '@/features/configuration/components/ConfigurationSkeleton';
import { useConfigurationLayout } from '@/features/configuration/utils/configuration-layout';
import { formatApiKeyDate, formatRequestCount } from '@/features/configuration/utils/configuration-display';
import {
  buildMcpClaudeDesktopSnippet,
  buildMcpCursorSnippet,
  buildMcpManusSnippet,
  buildMcpVsCodeSnippet,
  buildMcpWindsurfSnippet,
  getMcpConnectionFields,
  resolveMcpEndpointUrl,
  type McpHostId,
} from '@/features/configuration/utils/curl-snippets';
import {
  ChatGptMark,
  ClaudeMark,
  CursorMark,
  ManusMark,
  OtherMark,
  VsCodeMark,
  WindsurfMark,
  type HostMarkProps,
} from '@/features/mcp/components/host-marks';
import {
  getWebParityTabLabelStyle,
  getWebParityTabPressableStyle,
  getWebParityTabStyle,
  WEB_PARITY_TAB_HEIGHT_PRIMARY,
} from '@/shared/components/surfaces/web-parity-tab-styles';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { AppButton } from '@/shared/components/app-button';
import { AppSelectField } from '@/shared/components/app-select-field';
import { AppTextField } from '@/shared/components/app-text-field';
import { AdaptiveActionMenu, type MenuAnchor } from '@/shared/components/adaptive/adaptive-action-menu';
import { ConfirmOverlay } from '@/shared/components/adaptive/confirm-overlay';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { FeatureScreenScroll } from '@/shared/components/feature-screen-scroll';
import { PageSectionHeader } from '@/shared/components/surfaces/page-section-header';
import { TableHeaderLabel } from '@/shared/components/brand';
import { ListPaginationFooter } from '@/shared/components/list-pagination-footer';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { useOffsetPagination } from '@/shared/hooks/use-offset-pagination';
import { TOUCH_TARGET_MIN } from '@/shared/constants/layout';
import { API_CONFIG } from '@/network/apiUrl';
import { deleteApi, get, patch, post } from '@/network/request';
import { useToast } from '@/shared/toast/use-toast';
import { copyText } from '@/shared/utils/copy-text';

type PageTab = 'key' | 'connect';

type WorkspaceStatus = {
  mcp_url?: string;
};

type McpKeyRow = {
  id: string;
  name: string;
  masked_key?: string | null;
  is_active: boolean;
  created_at?: string | null;
  last_used_at?: string | null;
  request_count?: number;
};

type CreatedKey = {
  key_id?: string | null;
  secret?: string | null;
  mcp_url?: string;
};

const HOSTS: {
  id: McpHostId;
  labelKey: string;
  Mark: React.ComponentType<HostMarkProps>;
  /** Monochrome marks follow the theme so they stay visible on light and dark tabs. */
  themeColor?: boolean;
}[] = [
  { id: 'cursor', labelKey: 'configuration.mcp.host.cursor', Mark: CursorMark, themeColor: true },
  { id: 'claude', labelKey: 'configuration.mcp.host.claude', Mark: ClaudeMark },
  { id: 'manus', labelKey: 'configuration.mcp.host.manus', Mark: ManusMark },
  { id: 'vscode', labelKey: 'configuration.mcp.host.vscode', Mark: VsCodeMark },
  { id: 'windsurf', labelKey: 'configuration.mcp.host.windsurf', Mark: WindsurfMark, themeColor: true },
  { id: 'chatgpt', labelKey: 'configuration.mcp.host.chatgpt', Mark: ChatGptMark },
  { id: 'other', labelKey: 'configuration.mcp.host.other', Mark: OtherMark },
];

const HOST_STEP_COUNTS: Record<McpHostId, number> = {
  cursor: 4,
  claude: 4,
  manus: 4,
  vscode: 4,
  windsurf: 4,
  chatgpt: 4,
  other: 3,
};

const COPY_FIELD_HOSTS = new Set<McpHostId>(['chatgpt', 'other']);

function asKeyList(data: unknown): McpKeyRow[] | null {
  if (Array.isArray(data)) return data as McpKeyRow[];
  return null;
}

function asCreatedKey(data: unknown): CreatedKey | null {
  if (!data || typeof data !== 'object' || !('key_id' in data)) return null;
  return data as CreatedKey;
}

function asReveal(data: unknown): string {
  if (data && typeof data === 'object' && 'key' in data && typeof (data as { key?: unknown }).key === 'string') {
    return (data as { key: string }).key;
  }
  return '';
}

function asStatus(data: unknown): WorkspaceStatus | null {
  if (!data || typeof data !== 'object') return null;
  return data as WorkspaceStatus;
}

function CopyRow({
  label,
  displayValue,
  copyValue,
  copied,
  onCopy,
  caption,
}: {
  label: string;
  displayValue: string;
  copyValue: string;
  copied: boolean;
  onCopy: (value: string) => void;
  caption?: string;
}) {
  const { colors, spacing, typography, surfaceRadius, fonts } = useAppTheme();
  const { t } = useTranslation();
  const CopyIcon = copied ? Check : ActionIcons.copy;

  return (
    <View style={{ gap: spacing.xs }}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[
          styles.copyRow,
          {
            borderColor: colors.border,
            borderRadius: surfaceRadius.input,
            backgroundColor: colors.surfaceMuted,
            paddingLeft: spacing.md,
          },
        ]}>
        <Text
          selectable
          numberOfLines={3}
          style={[typography.citation, styles.copyValue, { color: colors.text, fontFamily: fonts.mono }]}>
          {displayValue}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.copy')}
          onPress={() => onCopy(copyValue)}
          style={styles.copyBtn}>
          <CopyIcon size={18} color={copied ? colors.success : colors.textMuted} />
        </Pressable>
      </View>
      {caption ? (
        <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 16 }]}>{caption}</Text>
      ) : null}
    </View>
  );
}

function HostTabs({
  active,
  onChange,
  compact,
}: {
  active: McpHostId;
  onChange: (host: McpHostId) => void;
  compact: boolean;
}) {
  const { t } = useTranslation();
  const { colors, spacing, radius, surfaceRadius, isWebParitySurfaces, typography, mode } = useAppTheme();
  const markColor = mode === 'dark' ? '#F4F4F5' : '#1C1C1C';

  const row = (
    <View
      accessibilityRole="tablist"
      style={[styles.hostRow, compact ? styles.hostRowScroll : null, { gap: spacing.xs }]}>
      {HOSTS.map((host) => {
        const selected = host.id === active;
        const label = t(host.labelKey);
        const labelColor = getWebParityTabStyle({
          active: selected,
          pressed: false,
          colors,
          surfaceRadius,
          brandRadius: radius.sm,
          useWebParity: isWebParitySurfaces,
          colorMode: mode,
        }).textColor;
        return (
          <Pressable
            key={host.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={label}
            onPress={() => onChange(host.id)}
            style={({ pressed, hovered }) => {
              const chrome = getWebParityTabStyle({
                active: selected,
                pressed,
                hovered,
                colors,
                surfaceRadius,
                brandRadius: radius.sm,
                useWebParity: isWebParitySurfaces,
                colorMode: mode,
              });
              return [
                styles.hostTab,
                getWebParityTabPressableStyle(chrome, WEB_PARITY_TAB_HEIGHT_PRIMARY),
                { paddingHorizontal: spacing.md, gap: spacing.xs },
              ];
            }}>
            <host.Mark size={22} color={host.themeColor ? markColor : undefined} />
            <Text style={[typography.body, getWebParityTabLabelStyle(labelColor, typography.body)]}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (!compact) return row;

  return (
    <AppScrollView horizontal showsHorizontalScrollIndicator={false}>
      {row}
    </AppScrollView>
  );
}

function KeyActionsButton({
  name,
  disabled,
  onOpen,
}: {
  name: string;
  disabled: boolean;
  onOpen: (anchor: MenuAnchor) => void;
}) {
  const { colors, surfaceRadius } = useAppTheme();
  const { t } = useTranslation();
  const anchorRef = useRef<View>(null);

  return (
    <View ref={anchorRef} collapsable={false}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('api-keys.actions')}
        accessibilityHint={name}
        disabled={disabled}
        onPress={() => {
          anchorRef.current?.measureInWindow((left, top, width, height) => {
            onOpen({ top, left, width, height });
          });
        }}
        style={({ pressed, hovered }) => [
          styles.menuBtn,
          {
            borderRadius: surfaceRadius.button,
            backgroundColor: pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : 'transparent',
            opacity: disabled ? 0.55 : 1,
          },
        ]}>
        <ActionIcons.more size={18} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}

export function McpScreen() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { colors, spacing, typography, surfaceRadius, fonts, isWebParitySurfaces } = useAppTheme();
  const {
    isWeb,
    showWebPageHeader,
    isCompactWebHeader,
    contentMaxWidth,
    horizontalPadding,
    isHeaderStacked,
    useCardLayout,
    useTableHorizontalScroll,
    tableMinWidth,
  } = useConfigurationLayout();
  const [pageTab, setPageTab] = useState<PageTab>('key');
  const [hostTab, setHostTab] = useState<McpHostId>('cursor');
  const [keys, setKeys] = useState<McpKeyRow[]>([]);
  const [mcpUrlFromServer, setMcpUrlFromServer] = useState('');
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [secret, setSecret] = useState('');
  const [freshSecret, setFreshSecret] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [pendingDelete, setPendingDelete] = useState<McpKeyRow | null>(null);
  const [actionMenu, setActionMenu] = useState<{ row: McpKeyRow; anchor: MenuAnchor } | null>(null);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const deletingKeyIdRef = useRef('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [listData, statusData] = await Promise.all([
        get<McpKeyRow[]>(API_CONFIG.MCP_WORKSPACE_KEYS),
        get<WorkspaceStatus>(API_CONFIG.MCP_WORKSPACE_KEY),
      ]);
      const rows = asKeyList(listData);
      if (!rows) {
        setError(t('mcp.page.error'));
        return;
      }
      setKeys(rows);
      const status = asStatus(statusData);
      if (status?.mcp_url) setMcpUrlFromServer(status.mcp_url);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.page.error'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeKeys = useMemo(() => keys.filter((row) => row.is_active), [keys]);
  const selectedIsActive = activeKeys.some((row) => row.id === selectedKeyId);
  const { page, pageSize, offset, totalPages, setPage, setPageSize } = useOffsetPagination({
    defaultPageSize: 10,
    storageKey: 'mcp-keys',
    total: keys.length,
    filterResetKey: '',
  });
  const pagedKeys = useMemo(
    () => keys.slice(offset, offset + pageSize),
    [keys, offset, pageSize],
  );

  useEffect(() => {
    const selectable = activeKeys.filter((row) => row.id !== deletingKeyIdRef.current);
    if (!selectable.length) {
      if (selectedKeyId) setSelectedKeyId('');
      return;
    }
    if (!selectable.some((row) => row.id === selectedKeyId)) {
      setSelectedKeyId(selectable[0].id);
    }
  }, [activeKeys, selectedKeyId]);

  useEffect(() => {
    if (!selectedKeyId || !selectedIsActive) {
      setSecret('');
      return;
    }
    // The Keys tab does not need the secret. Fetching it there races a delete
    // and the removed key comes back as 404.
    if (pageTab !== 'connect') return;
    const keyId = selectedKeyId;
    let cancelled = false;
    void (async () => {
      try {
        const data = await get<{ key?: string }>(API_CONFIG.mcpWorkspaceKeyReveal(keyId));
        const token = asReveal(data);
        if (!cancelled) setSecret(token);
      } catch (err) {
        if (cancelled) return;
        setSecret('');
        const status = (err as { status?: number }).status;
        if (status === 404) return;
        setError(err instanceof Error ? err.message : t('mcp.page.error'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageTab, selectedIsActive, selectedKeyId, t]);

  const mcpUrl = resolveMcpEndpointUrl(mcpUrlFromServer);
  const snippetKey = secret || 'Your_API_key';
  const fields = useMemo(() => getMcpConnectionFields(mcpUrl, snippetKey), [mcpUrl, snippetKey]);
  const fieldById = useMemo(() => {
    const map = Object.fromEntries(fields.map((field) => [field.id, field]));
    return map as Record<(typeof fields)[number]['id'], (typeof fields)[number]>;
  }, [fields]);

  const hostSnippet = useMemo(() => {
    if (hostTab === 'cursor') return buildMcpCursorSnippet(mcpUrl, snippetKey);
    if (hostTab === 'claude') return buildMcpClaudeDesktopSnippet(mcpUrl, snippetKey);
    if (hostTab === 'vscode') return buildMcpVsCodeSnippet(mcpUrl, snippetKey);
    if (hostTab === 'windsurf') return buildMcpWindsurfSnippet(mcpUrl, snippetKey);
    if (COPY_FIELD_HOSTS.has(hostTab)) return '';
    return buildMcpManusSnippet(mcpUrl, snippetKey);
  }, [hostTab, mcpUrl, snippetKey]);

  const copy = async (value: string, id: string) => {
    const ok = await copyText(value);
    if (!ok) {
      toast(t('api-keys.curl.copyFailed'));
      return;
    }
    setCopiedId(id);
    toast(t('api-keys.curl.copied'));
    setTimeout(() => setCopiedId(null), 1500);
  };

  const createKey = async () => {
    const name = createName.trim();
    if (!name) return;
    setCreating(true);
    setError('');
    try {
      const data = asCreatedKey(await post<{ name: string }, CreatedKey>(API_CONFIG.MCP_WORKSPACE_KEY, { name }));
      if (!data?.secret) {
        setError(t('mcp.page.error'));
        return;
      }
      setFreshSecret(data.secret);
      setCreateOpen(false);
      setCreateName('');
      await load();
      if (data.key_id) setSelectedKeyId(data.key_id);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.page.error'));
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (row: McpKeyRow) => {
    setBusyId(row.id);
    setError('');
    try {
      await patch<{ is_active: boolean }, McpKeyRow>(API_CONFIG.mcpWorkspaceKey(row.id), {
        is_active: !row.is_active,
      });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('mcp.page.error'));
    } finally {
      setBusyId('');
    }
  };

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    const deletingId = pendingDelete.id;
    deletingKeyIdRef.current = deletingId;
    setBusyId(deletingId);
    setError('');
    if (selectedKeyId === deletingId) setSelectedKeyId('');
    try {
      await deleteApi(API_CONFIG.mcpWorkspaceKey(deletingId));
      setPendingDelete(null);
      await load();
    } catch (err) {
      if (!selectedKeyId || selectedKeyId === deletingId) setSelectedKeyId(deletingId);
      setError(err instanceof Error ? err.message : t('mcp.page.error'));
    } finally {
      deletingKeyIdRef.current = '';
      setBusyId('');
    }
  };

  const steps = Array.from({ length: HOST_STEP_COUNTS[hostTab] }, (_, index) =>
    t(`mcp.page.steps.${hostTab}.${index + 1}`),
  );

  const accessDisplay = secret ? fieldById.authorization.displayValue : 'Bearer <YOUR_RAGSUITE_API_KEY>';
  const accessCopy = secret ? fieldById.authorization.copyValue : 'Bearer <YOUR_RAGSUITE_API_KEY>';

  const header = (
    <>
      {showWebPageHeader ? (
        <PageSectionHeader
          variant={isCompactWebHeader ? 'compact' : 'page'}
          title={t('nav.mcp')}
          subtitle={t('mcp.page.subtitle')}
        />
      ) : null}
      <View style={{ marginBottom: spacing.lg }}>
        <ConfigurationPrimaryTabs
          tabs={[
            { key: 'key', label: t('mcp.page.tab.key') },
            { key: 'connect', label: t('mcp.page.tab.connect') },
          ]}
          activeTab={pageTab}
          onChange={setPageTab}
        />
      </View>
    </>
  );

  const tableHeaders = [
    { key: 'name', label: t('api-keys.name') },
    { key: 'key', label: t('api-keys.key') },
    { key: 'created', label: t('api-keys.created') },
    { key: 'lastUsed', label: t('api-keys.lastUsed') },
    { key: 'requests', label: t('api-keys.requests') },
    { key: 'status', label: t('mcp.page.col.status') },
    { key: 'actions', label: t('api-keys.actions') },
  ] as const;

  const renderKeyActions = (row: McpKeyRow) => (
    <KeyActionsButton
      name={row.name}
      disabled={busyId === row.id}
      onOpen={(anchor) => setActionMenu({ row, anchor })}
    />
  );

  const keyTable = (
    <View style={useTableHorizontalScroll ? { minWidth: tableMinWidth } : undefined}>
      <View
        style={[
          styles.tableHeader,
          {
            borderTopColor: colors.border,
            borderBottomColor: colors.border,
            backgroundColor: colors.surfaceMuted,
            paddingHorizontal: spacing.md,
            minHeight: isWebParitySurfaces ? 48 : undefined,
            paddingVertical: isWebParitySurfaces ? 0 : spacing.sm,
          },
        ]}>
        {tableHeaders.map(({ key, label }) => (
          <TableHeaderLabel
            key={key}
            align={key === 'actions' ? 'right' : 'left'}
            style={[
              styles.headerCell,
              key === 'key' ? styles.keyHeader : null,
              key === 'actions' ? styles.actionsHeader : null,
            ]}>
            {label}
          </TableHeaderLabel>
        ))}
      </View>
      {pagedKeys.map((row, index) => (
        <View
          key={row.id}
          style={[
            styles.tableRow,
            {
              borderBottomColor: colors.border,
              borderBottomWidth: index === pagedKeys.length - 1 ? 0 : 1,
              paddingHorizontal: spacing.md,
              paddingVertical: spacing.sm,
            },
          ]}>
          <Text style={[typography.body, styles.cell, { color: colors.text }]} numberOfLines={1}>
            {row.name}
          </Text>
          <Text
            style={[typography.caption, styles.cell, styles.keyCell, { color: colors.textMuted, fontFamily: fonts.mono }]}
            numberOfLines={1}>
            {row.masked_key || '—'}
          </Text>
          <Text style={[typography.caption, styles.cell, { color: colors.textMuted }]}>
            {formatApiKeyDate(row.created_at || null)}
          </Text>
          <Text style={[typography.caption, styles.cell, { color: colors.textMuted }]}>
            {formatApiKeyDate(row.last_used_at || null)}
          </Text>
          <Text style={[typography.caption, styles.cell, { color: colors.text }]}>
            {formatRequestCount(row.request_count || 0)}
          </Text>
          <Text style={[typography.caption, styles.cell, { color: row.is_active ? colors.success : colors.textMuted }]}>
            {row.is_active ? t('mcp.page.status.active') : t('mcp.page.status.inactive')}
          </Text>
          <View style={[styles.cell, styles.actionsCell]}>{renderKeyActions(row)}</View>
        </View>
      ))}
    </View>
  );

  const keyCards = (
    <View style={{ gap: spacing.sm }}>
      {pagedKeys.map((row) => (
        <View
          key={row.id}
          style={[
            styles.keyCard,
            {
              borderColor: colors.border,
              borderRadius: surfaceRadius.card,
              padding: spacing.md,
              gap: spacing.xs,
            },
          ]}>
          <View style={styles.cardTitleRow}>
            <Text style={[typography.body, styles.cardTitle, { color: colors.text }]} numberOfLines={1}>
              {row.name}
            </Text>
            {renderKeyActions(row)}
          </View>
          <Text style={[typography.caption, { color: colors.textMuted, fontFamily: fonts.mono }]}>
            {row.masked_key || '—'}
          </Text>
          <Text style={[typography.caption, { color: row.is_active ? colors.success : colors.textMuted }]}>
            {row.is_active ? t('mcp.page.status.active') : t('mcp.page.status.inactive')}
            {' · '}
            {formatRequestCount(row.request_count || 0)}
          </Text>
        </View>
      ))}
    </View>
  );

  const keysPagination =
    keys.length > 0 ? (
      <View style={{ borderTopWidth: 1, borderTopColor: colors.border }}>
        <ListPaginationFooter
          page={page}
          pageSize={pageSize}
          total={keys.length}
          totalPages={totalPages}
          loading={loading}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </View>
    ) : null;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <FeatureScreenScroll
        backgroundColor={colors.background}
        contentMaxWidth={contentMaxWidth}
        horizontalPadding={horizontalPadding ?? spacing.sm}
        topPadding={isWeb ? (isCompactWebHeader ? spacing.md : spacing.lg) : spacing.sm}
        bottomPaddingExtra={56}
        header={header}>
        <ConfigurationPanelCard
          icon={pageTab === 'key' ? KeyRound : Plug}
          title={pageTab === 'key' ? t('mcp.page.tab.key') : t('mcp.page.tab.connect')}
          subtitle={pageTab === 'key' ? t('mcp.page.keyHelp') : t('mcp.page.subtitle')}
          flushBody={pageTab === 'key' && !error && !freshSecret && keys.length > 0 && !useCardLayout}
          headerAction={
            pageTab === 'key' ? (
              <ConfigurationCreateButton
                label={t('mcp.page.createKey')}
                onPress={() => setCreateOpen(true)}
                fullWidth={isHeaderStacked}
              />
            ) : null
          }>
          {error ? (
            <Text style={[typography.body, { color: colors.danger, lineHeight: 20 }]}>{error}</Text>
          ) : null}

          {pageTab === 'key' ? (
            <View style={{ gap: spacing.sm }}>
              {freshSecret ? (
                <CopyRow
                  label={t('mcp.page.secretOnce')}
                  displayValue={freshSecret}
                  copyValue={freshSecret}
                  copied={copiedId === 'secret'}
                  onCopy={(value) => void copy(value, 'secret')}
                />
              ) : null}
              {loading && keys.length === 0 ? (
                <ConfigurationSkeleton rows={3} />
              ) : keys.length === 0 ? (
                <EmptyStateView
                  title={t('mcp.page.emptyTitle')}
                  description={t('mcp.page.emptyBody')}
                  icon={KeyRound}
                  variant="inline"
                />
              ) : useCardLayout ? (
                <View>
                  {keyCards}
                  <View style={{ marginHorizontal: -spacing.md, marginTop: spacing.md, marginBottom: -spacing.md }}>
                    {keysPagination}
                  </View>
                </View>
              ) : useTableHorizontalScroll ? (
                <View style={{ marginHorizontal: -spacing.md, marginBottom: -spacing.md }}>
                  <AppScrollView horizontal showsHorizontalScrollIndicator>
                    {keyTable}
                  </AppScrollView>
                  {keysPagination}
                </View>
              ) : (
                <View style={{ marginHorizontal: -spacing.md, marginBottom: -spacing.md }}>
                  {keyTable}
                  {keysPagination}
                </View>
              )}
            </View>
          ) : activeKeys.length === 0 ? (
            <EmptyStateView
              title={t('mcp.page.noActiveTitle')}
              description={t('mcp.page.noActiveBody')}
              icon={Plug}
              actionLabel={t('mcp.page.goToKeys')}
              onAction={() => setPageTab('key')}
              variant="inline"
            />
          ) : (
            <View style={{ gap: spacing.sm }}>
              <AppSelectField
                label={t('mcp.page.selectKey')}
                value={selectedKeyId}
                options={activeKeys.map((row) => ({
                  key: row.id,
                  label: `${row.name} · ${row.masked_key || ''}`,
                }))}
                onChange={setSelectedKeyId}
                placeholder={t('mcp.page.selectPlaceholder')}
              />
              <HostTabs active={hostTab} onChange={setHostTab} compact={useCardLayout} />
              {steps.map((step, index) => (
                <Text
                  key={`${hostTab}-${index}`}
                  style={[typography.body, { color: colors.textMuted, lineHeight: 20 }]}>
                  {index + 1}. {step}
                </Text>
              ))}
              {hostTab === 'manus' ? (
                <View
                  style={[
                    styles.callout,
                    {
                      borderColor: colors.border,
                      borderRadius: surfaceRadius.card,
                      backgroundColor: colors.surfaceMuted,
                      padding: spacing.md,
                    },
                  ]}>
                  <Text style={[typography.body, { color: colors.text, lineHeight: 20 }]}>
                    {t('mcp.page.manusNote')}
                  </Text>
                </View>
              ) : null}
              {COPY_FIELD_HOSTS.has(hostTab) ? (
                <View style={{ gap: spacing.sm }}>
                  <CopyRow
                    label={t('mcp.page.address')}
                    displayValue={fieldById.url.displayValue}
                    copyValue={fieldById.url.copyValue}
                    copied={copiedId === `${hostTab}-url`}
                    onCopy={(value) => void copy(value, `${hostTab}-url`)}
                  />
                  <CopyRow
                    label={t('mcp.page.accessKey')}
                    displayValue={accessDisplay}
                    copyValue={accessCopy}
                    copied={copiedId === `${hostTab}-auth`}
                    onCopy={(value) => void copy(value, `${hostTab}-auth`)}
                  />
                </View>
              ) : (
                <IntegrationCodeBlock
                  code={hostSnippet}
                  accessibilityLabel={t('mcp.page.copySetup')}
                  copied={copiedId === `snippet-${hostTab}`}
                  onCopy={() => void copy(hostSnippet, `snippet-${hostTab}`)}
                  copyButtonLabel={t('mcp.page.copySetup')}
                />
              )}
            </View>
          )}
        </ConfigurationPanelCard>
      </FeatureScreenScroll>

      <ConfigurationSheet
        visible={createOpen}
        size="form"
        title={t('mcp.page.createTitle')}
        subtitle={t('mcp.page.keyHelp')}
        onClose={() => {
          if (!creating) setCreateOpen(false);
        }}
        footer={
          <View style={[styles.sheetFooter, { gap: spacing.sm }]}>
            <ConfigurationOutlineButton
              label={t('common.cancel')}
              onPress={() => setCreateOpen(false)}
              disabled={creating}
            />
            <AppButton
              variant="cta"
              size="compact"
              label={t('mcp.page.createKey')}
              icon={KeyRound}
              loading={creating}
              disabled={!createName.trim() || creating}
              onPress={() => void createKey()}
            />
          </View>
        }>
        <AppTextField
          label={t('mcp.page.name')}
          value={createName}
          onChangeText={setCreateName}
          placeholder={t('mcp.page.name')}
        />
      </ConfigurationSheet>

      <AdaptiveActionMenu
        visible={Boolean(actionMenu)}
        title={t('api-keys.actions')}
        anchor={actionMenu?.anchor}
        onClose={() => setActionMenu(null)}
        items={
          actionMenu
            ? [
                {
                  key: 'toggle',
                  label: actionMenu.row.is_active ? t('mcp.page.makeInactive') : t('mcp.page.makeActive'),
                  icon: actionMenu.row.is_active ? PowerOff : Power,
                  disabled: busyId === actionMenu.row.id,
                  onPress: () => {
                    const row = actionMenu.row;
                    setActionMenu(null);
                    void toggleActive(row);
                  },
                },
                {
                  key: 'delete',
                  label: t('common.delete'),
                  tone: 'danger',
                  icon: ActionIcons.delete,
                  disabled: busyId === actionMenu.row.id,
                  onPress: () => {
                    setPendingDelete(actionMenu.row);
                    setActionMenu(null);
                  },
                },
              ]
            : []
        }
      />

      <ConfirmOverlay
        visible={Boolean(pendingDelete)}
        title={t('mcp.page.deleteTitle')}
        subtitle={pendingDelete ? t('mcp.page.deleteBody', { name: pendingDelete.name }) : ''}
        cancelLabel={t('common.cancel')}
        confirmLabel={t('common.delete')}
        loading={Boolean(pendingDelete) && busyId === pendingDelete?.id}
        variant="danger"
        onClose={() => {
          if (!busyId) setPendingDelete(null);
        }}
        onConfirm={() => void confirmDelete()}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    minHeight: TOUCH_TARGET_MIN,
  },
  copyValue: { flex: 1, minWidth: 0 },
  copyBtn: {
    minWidth: TOUCH_TARGET_MIN,
    minHeight: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callout: { borderWidth: StyleSheet.hairlineWidth },
  hostRow: { flexDirection: 'row', flexWrap: 'wrap' },
  hostRowScroll: { flexWrap: 'nowrap' },
  hostTab: { flexDirection: 'row', alignItems: 'center' },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerCell: { flex: 1, minWidth: 0 },
  keyHeader: { flex: 1.6, minWidth: 140 },
  actionsHeader: { flex: 0.45, minWidth: 72 },
  cell: { flex: 1, minWidth: 0 },
  keyCell: { flex: 1.6, minWidth: 140 },
  actionsCell: { flex: 0.45, minWidth: 72, alignItems: 'flex-end' },
  menuBtn: {
    width: TOUCH_TARGET_MIN,
    height: TOUCH_TARGET_MIN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  keyCard: { borderWidth: StyleSheet.hairlineWidth },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  cardTitle: { flex: 1, minWidth: 0 },
  sheetFooter: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap' },
});
