import { Platform } from 'react-native';

import type { FeedbackModerationExportParams } from '@/features/feedback-moderation/types/feedback-moderation.api.types';
import type { FeedbackVoteFilter } from '@/features/feedback-moderation/types/feedback-moderation.types';
import {
  FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
  FEEDBACK_MODERATION_EXPORT_MAX_ROWS,
} from '@/features/feedback-moderation/utils/feedback-options';
import { downloadTextFile } from '@/shared/utils/download-text-file';
import { copyText } from '@/shared/utils/copy-text';
import {
  filenameFromContentDisposition,
  sanitizeSuggestedFilename,
} from '@/shared/utils/content-disposition';

export { filenameFromContentDisposition };

export type FeedbackExportFormat = 'csv' | 'json';

export type FeedbackExportDelivery = 'download' | 'share' | 'clipboard' | 'failed';

export type FeedbackModerationExportResult = {
  content: string;
  filename: string;
  mimeType: string;
  format: FeedbackExportFormat;
};

export type FeedbackModerationExportQuery = {
  fmt: FeedbackExportFormat;
  q?: string;
  voteFilter?: FeedbackVoteFilter;
  messageType?: FeedbackModerationExportParams['messageType'];
  dateFrom?: string;
  dateTo?: string;
  maxRows?: number;
};

const CLIPBOARD_FALLBACK_MAX_CHARS = 500_000;
const NATIVE_CLIPBOARD_FALLBACK_MAX_CHARS = 32_000;

export function buildFeedbackModerationExportParams(
  query: FeedbackModerationExportQuery,
): FeedbackModerationExportParams {
  return {
    fmt: query.fmt,
    messageType: query.messageType ?? FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
    maxRows: query.maxRows ?? FEEDBACK_MODERATION_EXPORT_MAX_ROWS,
    q: query.q,
    voteFilter: query.voteFilter,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

export function buildFeedbackExportFilename(format: FeedbackExportFormat, suggested?: string | null): string {
  if (suggested?.trim()) {
    return sanitizeSuggestedFilename(suggested);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `feedback-moderation-${stamp}.${format}`;
}

export function mimeTypeForFeedbackExport(format: FeedbackExportFormat): string {
  return format === 'json' ? 'application/json;charset=utf-8' : 'text/csv;charset=utf-8';
}

export async function deliverFeedbackModerationExport(
  result: FeedbackModerationExportResult,
): Promise<FeedbackExportDelivery> {
  const fileResult = await downloadTextFile({
    content: result.content,
    filename: result.filename,
    mimeType: result.mimeType,
  });

  if (fileResult.success) {
    return fileResult.method ?? (Platform.OS === 'web' ? 'download' : 'share');
  }

  if (result.content.length > (Platform.OS === 'web' ? CLIPBOARD_FALLBACK_MAX_CHARS : NATIVE_CLIPBOARD_FALLBACK_MAX_CHARS)) {
    return 'failed';
  }

  const copied = await copyText(result.content);
  return copied ? 'clipboard' : 'failed';
}

export function feedbackExportSuccessMessage(
  format: FeedbackExportFormat,
  delivery: Exclude<FeedbackExportDelivery, 'failed'>,
): string | null {
  const label = format.toUpperCase();

  if (delivery === 'download') {
    return `Downloaded ${label} export.`;
  }

  if (delivery === 'clipboard') {
    return `Copied ${label} export to clipboard.`;
  }

  // Native share sheet is the UX — no inline banner needed on phone.
  return null;
}

export function feedbackExportFailureMessage(delivery: FeedbackExportDelivery, contentLength: number): string {
  const nativeLimit = Platform.OS !== 'web' && contentLength > NATIVE_CLIPBOARD_FALLBACK_MAX_CHARS;
  const webLimit = Platform.OS === 'web' && contentLength > CLIPBOARD_FALLBACK_MAX_CHARS;
  if (delivery === 'failed' && (nativeLimit || webLimit)) {
    return 'Could not open the save/share sheet. Try again or use the web app for large exports.';
  }
  return 'Export failed. Please try again.';
}
