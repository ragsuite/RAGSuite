import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { AuditEvent } from '@/features/audit-logs/types/audit-log.types';
import {
  categoryLabel,
  formatAuditActor,
  formatAuditProject,
  formatAuditResource,
  formatAuditStatusLabel,
  formatAuditTimestamp,
} from '@/features/audit-logs/utils/audit-log-display';
import { IntegrationCodeBlock } from '@/shared/components/integration-code-block';
import { useTranslation } from '@/i18n';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  event: AuditEvent;
  copiedDetails?: boolean;
  onCopyDetails?: () => void;
};

function DetailField({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { colors, typography, fonts } = useAppTheme();
  return (
    <View style={styles.field}>
      <Text style={[typography.caption, styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[
          typography.caption,
          styles.fieldValue,
          {
            color: colors.text,
            fontWeight: '500',
            fontFamily: mono ? fonts.mono : undefined,
          },
        ]}>
        {value}
      </Text>
    </View>
  );
}

export function AuditLogEventDetailContent({ event, copiedDetails = false, onCopyDetails }: Props) {
  const { colors, spacing, typography } = useAppTheme();
  const { t } = useTranslation();
  const na = t('history.detail.na');
  const hasDetails = Boolean(event.details && Object.keys(event.details).length > 0);
  const detailsJson = hasDetails ? JSON.stringify(event.details, null, 2) : '';

  return (
    <View style={{ gap: spacing.sm }}>
      <Text style={[typography.caption, { color: colors.textMuted, lineHeight: 20 }]}>{event.summary}</Text>

      <View style={styles.fieldList}>
        <DetailField label={t('audit.col.eventType')} value={event.event_type} mono />
        <DetailField label={t('audit.filter.category')} value={categoryLabel(event.category)} />
        <DetailField label={t('audit.col.actor')} value={formatAuditActor(event)} />
        <DetailField label={t('audit.col.project')} value={formatAuditProject(event)} />
        <DetailField label={t('audit.col.action')} value={event.action} />
        <DetailField label={t('audit.col.timestamp')} value={formatAuditTimestamp(event.timestamp)} />
        <DetailField label={t('audit.col.status')} value={formatAuditStatusLabel(event.status)} />
        <DetailField label={t('audit.col.severity')} value={event.severity} />
        <DetailField label={t('audit.detail.ip')} value={event.ip_address ?? na} />
        <DetailField label={t('audit.detail.device')} value={event.user_agent ?? na} />
        {event.resource_type ? (
          <DetailField label={t('audit.col.resource')} value={formatAuditResource(event)} mono />
        ) : null}
      </View>

      {hasDetails ? (
        <View style={{ gap: spacing.xs, paddingTop: spacing.xxs }}>
          <Text style={[typography.cardTitle, { color: colors.text }]}>{t('audit.detail.raw')}</Text>
          <IntegrationCodeBlock
            code={detailsJson}
            accessibilityLabel={t('audit.detail.raw')}
            copied={copiedDetails}
            onCopy={() => onCopyDetails?.()}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fieldList: {
    gap: 2,
  },
  field: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    paddingVertical: 3,
    width: '100%',
  },
  fieldLabel: {
    minWidth: 112,
    flexShrink: 0,
    lineHeight: 20,
  },
  fieldValue: {
    flex: 1,
    minWidth: 0,
    lineHeight: 20,
  },
});
