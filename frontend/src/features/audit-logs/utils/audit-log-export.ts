import type {
  AuditLogExportFormat,
  AuditLogExportResult,
} from '@/features/audit-logs/types/audit-log.types';
import { sanitizeSuggestedFilename } from '@/shared/utils/content-disposition';
import { downloadTextFile } from '@/shared/utils/download-text-file';

export function buildAuditLogExportFilename(
  format: AuditLogExportFormat,
  suggested?: string | null,
): string {
  if (suggested?.trim()) {
    return sanitizeSuggestedFilename(suggested);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `audit-logs-${stamp}.${format}`;
}

export function mimeTypeForAuditLogExport(format: AuditLogExportFormat): string {
  return format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
}

/** Browser download (web) or native share / save sheet. */
export async function deliverAuditLogExport(result: AuditLogExportResult): Promise<boolean> {
  if (!result.content.trim()) return false;
  const delivered = await downloadTextFile({
    content: result.content,
    filename: result.filename,
    mimeType: result.mimeType,
  });
  return delivered.success;
}
