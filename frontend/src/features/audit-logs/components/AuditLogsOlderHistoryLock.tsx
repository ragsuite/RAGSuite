import React from 'react';
import { StyleSheet, View } from 'react-native';

import { AuditLogEventRow } from '@/features/audit-logs/components/AuditLogEventRow';
import { AUDIT_LOCKED_MOCK_EVENTS } from '@/features/audit-logs/utils/audit-log-locked-mock';
import { useTranslation } from '@/i18n';
import { EnterpriseLockedPreview } from '@/platform/ee-locked';
import { useAppTheme } from '@/shared/hooks/use-app-theme';

type Props = {
  retentionDays: number;
  /** `table`: last block inside the audit table body; `card`: last item of the card list. */
  layout: 'table' | 'card';
};

/** Community-only teaser at the end of the audit list: events past the window need Enterprise. */
export function AuditLogsOlderHistoryLock({ retentionDays, layout }: Props) {
  const { t } = useTranslation();
  const { spacing } = useAppTheme();
  const inTable = layout === 'table';

  return (
    <View style={inTable ? null : { marginTop: spacing.sm }}>
      <EnterpriseLockedPreview
        featureName={t('enterprise.locked.features.auditHistory')}
        message={t('enterprise.locked.messages.auditHistory', { count: retentionDays })}
        style={styles.preview}
        mockStyle={inTable ? styles.tableMock : null}>
        <View style={inTable ? null : { gap: spacing.sm }}>
          {AUDIT_LOCKED_MOCK_EVENTS.map((event) => (
            <AuditLogEventRow key={event.id} event={event} layout={layout} />
          ))}
        </View>
      </EnterpriseLockedPreview>
    </View>
  );
}

const styles = StyleSheet.create({
  preview: {
    flex: 0,
    minHeight: 340,
  },
  tableMock: {
    padding: 0,
  },
});
