import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CrawlStatusBadge } from '@/features/crawl/components/CrawlStatusBadge';
import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';
import { AUDIT_TABLE_COLUMN_LAYOUT } from '@/features/audit-logs/utils/audit-log-options';
import {
  formatAuditActor,
  formatAuditProject,
  formatAuditResource,
  formatAuditStatusLabel,
  formatAuditSummary,
  formatAuditTimestamp,
  statusBadgeTone,
} from '@/features/audit-logs/utils/audit-log-display';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  event: AuditEvent;
  layout: 'table' | 'card';
  selected?: boolean;
  onPress?: (event: AuditEvent) => void;
};

function MetaCell({ label, value }: { label: string; value: string }) {
  const { colors, typography } = useAppTheme();
  return (
    <View style={styles.metaCell}>
      <Text style={[typography.caption, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[typography.caption, typography.numeric, { color: colors.text, fontWeight: '500' }]} numberOfLines={2}>
        {value}
      </Text>
    </View>
  );
}

function StatusBadge({ event }: { event: AuditEvent }) {
  const label = formatAuditStatusLabel(event.status);
  const tone = statusBadgeTone(event.status);
  return <CrawlStatusBadge label={label} tone={tone} />;
}

export function AuditLogEventRow({ event, layout, selected = false, onPress }: Props) {
  const { t } = useTranslation();
  const { colors, spacing, typography, elevation, fonts, surfaceRadius, isWebParitySurfaces } = useAppTheme();
  const panelRadius = surfaceRadius.card;
  const actor = formatAuditActor(event);
  const time = formatAuditTimestamp(event.timestamp);
  const resource = formatAuditResource(event);
  const project = formatAuditProject(event);

  if (layout === 'table') {
    return (
      <Pressable
        onPress={() => onPress?.(event)}
        accessibilityRole="button"
        accessibilityLabel={`${event.action}, ${actor}, ${time}`}
        style={({ pressed, hovered }) => [
          styles.tableRow,
          {
            borderBottomColor: colors.border,
            backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
          },
        ]}>
        <Text
          style={[
            styles.tableCell,
            typography.caption,
            {
              color: colors.text,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[0].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[0].minWidth,
              fontFamily: fonts.mono,
            },
          ]}
          numberOfLines={2}>
          {event.event_type}
        </Text>
        <Text
          style={[
            styles.tableCell,
            typography.caption,
            {
              color: colors.text,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[1].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[1].minWidth,
            },
          ]}
          numberOfLines={1}>
          {actor}
        </Text>
        <Text
          style={[
            styles.tableCell,
            typography.caption,
            {
              color: colors.text,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[2].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[2].minWidth,
            },
          ]}
          numberOfLines={1}>
          {project}
        </Text>
        <Text
          style={[
            styles.tableCell,
            typography.body,
            {
              color: colors.text,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[3].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[3].minWidth,
            },
          ]}
          numberOfLines={2}>
          {event.action}
        </Text>
        <Text
          style={[
            styles.tableCell,
            typography.caption,
            {
              color: colors.textMuted,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[4].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[4].minWidth,
            },
          ]}
          numberOfLines={2}>
          {resource}
        </Text>
        <Text
          style={[
            styles.tableCell,
            typography.caption,
            typography.numeric,
            {
              color: colors.textMuted,
              flex: AUDIT_TABLE_COLUMN_LAYOUT[5].flex,
              minWidth: AUDIT_TABLE_COLUMN_LAYOUT[5].minWidth,
            },
          ]}
          numberOfLines={2}>
          {time}
        </Text>
        <View style={[styles.tableCell, { flex: AUDIT_TABLE_COLUMN_LAYOUT[6].flex, minWidth: AUDIT_TABLE_COLUMN_LAYOUT[6].minWidth }]}>
          <StatusBadge event={event} />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => onPress?.(event)}
      accessibilityRole="button"
      accessibilityLabel={`${event.summary}, ${actor}`}
      style={({ pressed, hovered }) => [
        styles.card,
        elevation.card,
        {
          borderColor: selected ? colors.primary : colors.border,
          borderRadius: panelRadius,
          backgroundColor: selected || pressed ? colors.surfaceMuted : hovered ? colors.surfaceHover : colors.surface,
          padding: spacing.sm,
          gap: spacing.xs,
        },
      ]}>
      <View style={styles.cardTop}>
        <Text
          style={[
            typography.caption,
            { color: colors.text, fontFamily: fonts.mono },
          ]}>
          {event.event_type}
        </Text>
        <StatusBadge event={event} />
      </View>
      <Text style={[typography.subtitle, { color: colors.text }]}>{event.action}</Text>
      <Text style={[typography.body, { color: colors.textMuted }]} numberOfLines={2}>
        {formatAuditSummary(event.summary)}
      </Text>
      <View style={styles.metaRow}>
        <MetaCell label={t('audit.col.actor')} value={actor} />
        <MetaCell label={t('audit.col.project')} value={project} />
      </View>
      <View style={styles.metaRow}>
        <MetaCell label={t('audit.col.resource')} value={resource} />
        <MetaCell label={t('audit.col.timestamp')} value={time} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tableRow: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    paddingHorizontal: 10,
    flexDirection: 'row',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: 8,
    minWidth: 760,
  },
  tableCell: {
    flexShrink: 1,
  },
  card: {
    borderWidth: 1,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  metaCell: {
    flex: 1,
    gap: 2,
    minWidth: 120,
  },
});
