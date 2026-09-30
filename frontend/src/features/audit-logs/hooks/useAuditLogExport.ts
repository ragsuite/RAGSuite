import { useCallback, useRef, useState } from 'react';

import { exportAuditEvents } from '@/features/audit-logs/services/audit-log.service';
import type {
  AuditLogExportFormat,
  AuditLogFilterParams,
} from '@/features/audit-logs/types/audit-log.types';
import { deliverAuditLogExport } from '@/features/audit-logs/utils/audit-log-export';
import { useTranslation } from '@/i18n';
import { useToastRef } from '@/shared/toast/use-toast-ref';

/** CSV / JSON export of the currently filtered audit log (Enterprise endpoint). */
export function useAuditLogExport(filters: AuditLogFilterParams) {
  const { t } = useTranslation();
  const toastRef = useToastRef();
  const [exporting, setExporting] = useState(false);
  const inFlight = useRef(false);

  const handleExport = useCallback(
    async (format: AuditLogExportFormat) => {
      if (inFlight.current) return;
      inFlight.current = true;
      setExporting(true);
      try {
        const result = await exportAuditEvents({
          ...filters,
          q: filters.q?.trim() || undefined,
          format,
        });
        const delivered = await deliverAuditLogExport(result);
        toastRef.current({
          description: delivered ? t('audit.toast.export.success') : t('audit.toast.export.error'),
          variant: delivered ? 'success' : 'error',
        });
      } catch {
        toastRef.current({ description: t('audit.toast.export.error'), variant: 'error' });
      } finally {
        inFlight.current = false;
        setExporting(false);
      }
    },
    [filters, t, toastRef],
  );

  return { exporting, handleExport };
}
