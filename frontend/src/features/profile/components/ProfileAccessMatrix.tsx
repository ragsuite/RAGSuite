import { FolderOpen } from 'lucide-react-native';
import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View, type ViewProps } from 'react-native';

import {
  buildAccessMatrix,
  type AccessCellLevel,
} from '@/features/profile/utils/profile-access-matrix';
import type { Project } from '@/features/projects/types/projects.types';
import { useTranslation } from '@/i18n';
import { AppScrollView } from '@/shared/components/app-scroll-view';
import { EmptyStateView } from '@/shared/components/dashboard/empty-state-view';
import { StatePanel } from '@/shared/components/dashboard/state-panel';
import { StatusBadge, type StatusBadgeTone } from '@/shared/components/status-badge';
import { useAppTheme } from '@/shared/hooks/use-app-theme';
import { getWebScrollbarStyle } from '@/shared/utils/themed-scrollbar';

type Props = {
  projects: Project[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
};

const PROJECT_COL_WIDTH = 180;
const CELL_WIDTH = 108;
const GROUP_HEADER_H = 30;
const LEAF_HEADER_H = 38;
const LINE = 1;
const HEADER_H = GROUP_HEADER_H + LINE + LEAF_HEADER_H;
const BODY_H = 40;

function levelTone(level: Exclude<AccessCellLevel, 'none'>): StatusBadgeTone {
  return level === 'write' || level === 'admin' ? 'success' : 'muted';
}

function AccessLevelBadge({ level }: { level: Exclude<AccessCellLevel, 'none'> }) {
  const { t } = useTranslation();
  const label = level === 'admin' ? t('profile.access.cell.admin') : t(`org.permissions.level.${level}`);
  return <StatusBadge label={label} tone={levelTone(level)} size="compact" preserveCase />;
}

function GridLine({ color }: { color: string }) {
  return <View style={{ height: LINE, backgroundColor: color, width: '100%' }} />;
}

export function ProfileAccessMatrix({ projects, loading = false, error = null, onRetry }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, surfaceRadius, mode } = useAppTheme();
  const matrix = useMemo(() => buildAccessMatrix(projects), [projects]);
  const showAdminLegend = matrix.rows.some((row) => row.isAdmin);
  const headerFill = colors.surfaceMuted;
  const line = colors.border;
  const colEdge = { borderRightWidth: LINE, borderRightColor: line };
  const headerLabel = [typography.caption, { color: colors.text, fontWeight: '600' as const, textAlign: 'center' as const }];
  const leafLabel = [
    typography.caption,
    { color: colors.text, textAlign: 'center' as const, fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  ];
  const stickyProject =
    Platform.OS === 'web' ? ({ position: 'sticky', left: 0, zIndex: 2 } as const) : null;
  const tableWidth = PROJECT_COL_WIDTH + matrix.columns.length * CELL_WIDTH;
  const scrollerStyle = [
    styles.sheet,
    { borderColor: line, borderRadius: surfaceRadius.input, backgroundColor: colors.surface },
    Platform.OS === 'web'
      ? ({ overflowX: 'auto', overflowY: 'hidden', ...getWebScrollbarStyle(mode, 'overlay') } as const)
      : null,
  ];

  const table = (
    <View style={[styles.table, { width: tableWidth, minWidth: tableWidth }]}>
      <View
        style={[
          styles.frozenCol,
          stickyProject,
          { width: PROJECT_COL_WIDTH, minWidth: PROJECT_COL_WIDTH, backgroundColor: colors.surface },
        ]}>
        <View style={[styles.headerCell, colEdge, { height: HEADER_H, backgroundColor: headerFill }]}>
          <Text style={headerLabel}>{t('profile.access.projectColumn')}</Text>
        </View>
        <GridLine color={line} />
        {matrix.rows.map((row, rowIndex) => {
          const zebra = rowIndex % 2 === 1 ? colors.surfaceMuted : colors.surface;
          return (
            <View key={row.projectId}>
              <View
                style={[styles.bodyCell, styles.projectBody, colEdge, { height: BODY_H, backgroundColor: zebra }]}>
                <Text numberOfLines={1} style={[typography.body, { color: colors.text, fontWeight: '500' }]}>
                  {row.projectName}
                </Text>
              </View>
              <GridLine color={line} />
            </View>
          );
        })}
      </View>
      <View>
        <View style={[styles.headerRow, { height: HEADER_H, backgroundColor: headerFill }]}>
          {matrix.groups.map((group, groupIndex) => {
            const start = matrix.groups.slice(0, groupIndex).reduce((sum, item) => sum + item.span, 0);
            const leaves = matrix.columns.slice(start, start + group.span);
            const groupWidth = group.span * CELL_WIDTH;
            const groupEdge = groupIndex < matrix.groups.length - 1 ? colEdge : null;
            return (
              <View
                key={`${group.labelKey}-${groupIndex}`}
                style={[styles.colLock, { width: groupWidth, height: HEADER_H, overflow: 'hidden' }]}>
                {group.span > 1 ? (
                  <>
                    <View style={[styles.headerCell, groupEdge, { height: GROUP_HEADER_H }]}>
                      <Text numberOfLines={1} style={headerLabel}>{t(group.labelKey)}</Text>
                    </View>
                    <GridLine color={line} />
                    <View style={[styles.headerRow, { height: LEAF_HEADER_H, backgroundColor: colors.surface }]}>
                      {leaves.map((column, leafIndex) => (
                        <View
                          key={column.key}
                          style={[
                            styles.colLock,
                            styles.headerCell,
                            start + leafIndex < matrix.columns.length - 1 ? colEdge : null,
                            { width: CELL_WIDTH, height: LEAF_HEADER_H, backgroundColor: colors.surface },
                          ]}>
                          <Text numberOfLines={1} style={leafLabel}>{t(column.labelKey)}</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={[styles.headerCell, groupEdge, { height: HEADER_H }]}>
                    <Text numberOfLines={2} style={headerLabel}>{t(group.labelKey)}</Text>
                  </View>
                )}
              </View>
            );
          })}
        </View>
        <GridLine color={line} />
        {matrix.rows.map((row, rowIndex) => {
          const zebra = rowIndex % 2 === 1 ? colors.surfaceMuted : colors.surface;
          return (
            <View key={row.projectId}>
              <View style={[styles.bodyRow, { height: BODY_H, backgroundColor: zebra }]}>
                {row.cells.map((cell, cellIndex) => (
                  <View
                    key={`${row.projectId}-${matrix.columns[cellIndex].key}`}
                    style={[
                      styles.colLock,
                      styles.bodyCell,
                      cellIndex < matrix.columns.length - 1 ? colEdge : null,
                      { width: CELL_WIDTH, height: BODY_H, backgroundColor: zebra },
                    ]}>
                    {cell === 'none' ? (
                      <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.access.cell.none')}</Text>
                    ) : (
                      <View>
                        <AccessLevelBadge level={cell} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
              <GridLine color={line} />
            </View>
          );
        })}
      </View>
    </View>
  );

  return (
    <StatePanel loading={loading} error={error} onRetry={onRetry}>
      {matrix.rows.length === 0 ? (
        <EmptyStateView
          icon={FolderOpen}
          title={t('profile.access.empty.title')}
          description={t('profile.access.empty.body')}
          variant="panel"
        />
      ) : (
        <View style={{ gap: spacing.sm }}>
          <View style={[styles.toolbar, { gap: spacing.sm }]}>
            <Text style={[typography.caption, { color: colors.textMuted, flexShrink: 1 }]}>
              {t('profile.access.summary', {
                projects: matrix.projectCount,
                modules: matrix.grantedModuleCount,
              })}
            </Text>
            <View style={[styles.legend, { gap: spacing.sm }]}>
              <View style={[styles.legendItem, { gap: spacing.xxs }]}>
                <AccessLevelBadge level="read" />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.access.legend.read')}</Text>
              </View>
              <View style={[styles.legendItem, { gap: spacing.xxs }]}>
                <AccessLevelBadge level="write" />
                <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.access.legend.write')}</Text>
              </View>
              {showAdminLegend ? (
                <View style={[styles.legendItem, { gap: spacing.xxs }]}>
                  <AccessLevelBadge level="admin" />
                  <Text style={[typography.caption, { color: colors.textMuted }]}>{t('profile.access.fullAdmin')}</Text>
                </View>
              ) : null}
              <Text style={[typography.caption, { color: colors.textMuted }]}>
                {t('profile.access.cell.none')} {t('org.permissions.level.none')}
              </Text>
            </View>
          </View>
          {Platform.OS === 'web' ? (
            <View
              style={scrollerStyle}
              {...({ dataSet: { ragsuiteScrollbar: 'overlay' } } as ViewProps)}>
              {table}
            </View>
          ) : (
            <AppScrollView horizontal nestedScrollEnabled scrollbarVariant="overlay" style={scrollerStyle}>
              {table}
            </AppScrollView>
          )}
        </View>
      )}
    </StatePanel>
  );
}

const styles = StyleSheet.create({
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  legend: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  sheet: { borderWidth: 1, width: '100%' },
  table: { flexDirection: 'row' },
  frozenCol: { flexGrow: 0, flexShrink: 0 },
  headerRow: { flexDirection: 'row', alignItems: 'stretch' },
  bodyRow: { flexDirection: 'row', alignItems: 'stretch' },
  colLock: { flexGrow: 0, flexShrink: 0, boxSizing: 'border-box' },
  headerCell: { paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box' },
  bodyCell: { paddingHorizontal: 8, justifyContent: 'center', alignItems: 'center', boxSizing: 'border-box' },
  projectBody: { alignItems: 'flex-start', paddingHorizontal: 12 },
});
