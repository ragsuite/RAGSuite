import type {
  FeedbackModerationExportParams,
  FeedbackModerationListParams,
  FeedbackModerationPatchBody,
} from '@/features/feedback-moderation/types/feedback-moderation.api.types';
import {
  parseFeedbackEntriesPageResponse,
  parseFeedbackModerationPatchResponse,
  parseFeedbackSummaryResponse,
} from '@/features/feedback-moderation/utils/feedback-api';
import type { FeedbackEntriesPagePayload } from '@/features/feedback-moderation/utils/feedback-api';
import type {
  FeedbackModerationRecord,
  FeedbackSummaryPayload,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import type {
  FeedbackModerationExportResult,
} from '@/features/feedback-moderation/utils/feedback-export';
import {
  buildFeedbackExportFilename,
  filenameFromContentDisposition,
  mimeTypeForFeedbackExport,
} from '@/features/feedback-moderation/utils/feedback-export';
import { FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE } from '@/features/feedback-moderation/utils/feedback-options';
import { API_CONFIG } from '@/network/apiUrl';
import { get, getText, patch } from '@/network/request';

function voteFilterToFeedbackParam(
  voteFilter: FeedbackModerationListParams['voteFilter'],
): boolean | undefined {
  if (voteFilter === 'positive') return true;
  if (voteFilter === 'negative') return false;
  return undefined;
}

function appendSharedFilters(
  search: URLSearchParams,
  params: Pick<
    FeedbackModerationListParams,
    | 'q'
    | 'voteFilter'
    | 'sessionId'
    | 'userId'
    | 'reason'
    | 'dateFrom'
    | 'dateTo'
    | 'reviewed'
    | 'flagged'
    | 'minConfidence'
    | 'maxConfidence'
    | 'minTotalMs'
    | 'maxTotalMs'
    | 'llmModel'
    | 'sourceContains'
  >,
) {
  if (params.q?.trim()) search.set('q', params.q.trim());
  const feedback = voteFilterToFeedbackParam(params.voteFilter);
  if (feedback != null) search.set('feedback', String(feedback));
  if (params.sessionId?.trim()) search.set('session_id', params.sessionId.trim());
  if (params.userId != null) search.set('user_id', String(params.userId));
  if (params.reason?.trim()) search.set('reason', params.reason.trim());
  if (params.dateFrom) search.set('date_from', params.dateFrom);
  if (params.dateTo) search.set('date_to', params.dateTo);
  if (params.reviewed != null) search.set('reviewed', String(params.reviewed));
  if (params.flagged != null) search.set('flagged', String(params.flagged));
  if (params.minConfidence != null) search.set('min_confidence', String(params.minConfidence));
  if (params.maxConfidence != null) search.set('max_confidence', String(params.maxConfidence));
  if (params.minTotalMs != null) search.set('min_total_ms', String(params.minTotalMs));
  if (params.maxTotalMs != null) search.set('max_total_ms', String(params.maxTotalMs));
  if (params.llmModel?.trim()) search.set('llm_model', params.llmModel.trim());
  if (params.sourceContains?.trim()) search.set('source_contains', params.sourceContains.trim());
}

function buildListQuery(params: FeedbackModerationListParams): string {
  const search = new URLSearchParams();
  search.set('limit', String(params.limit));
  search.set('offset', String(params.offset));
  search.set('message_type', params.messageType ?? FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE);
  appendSharedFilters(search, params);
  return `${API_CONFIG.FEEDBACK_MODERATION_ENTRIES}?${search.toString()}`;
}

function buildExportQuery(params: FeedbackModerationExportParams): string {
  const search = new URLSearchParams();
  search.set('fmt', params.fmt);
  search.set('message_type', params.messageType ?? FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE);
  if (params.maxRows != null) search.set('max_rows', String(params.maxRows));
  appendSharedFilters(search, params);
  return `${API_CONFIG.FEEDBACK_MODERATION_EXPORT}?${search.toString()}`;
}

export async function handleGetFeedbackModerationSummary(
  messageType = FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
): Promise<FeedbackSummaryPayload> {
  const search = new URLSearchParams({ message_type: messageType });
  const response = await get<unknown>(`${API_CONFIG.FEEDBACK_MODERATION_SUMMARY}?${search.toString()}`);
  const summary = parseFeedbackSummaryResponse(response);
  if (!summary) {
    throw new Error('errors.feedback.invalidSummaryResponse');
  }
  return summary;
}

export async function handleListFeedbackModerationEntries(
  params: FeedbackModerationListParams,
): Promise<FeedbackEntriesPagePayload> {
  const response = await get<unknown>(buildListQuery(params));
  const page = parseFeedbackEntriesPageResponse(response);
  if (!page) {
    throw new Error('errors.feedback.invalidEntriesResponse');
  }
  return page;
}

export async function handlePatchFeedbackModeration(
  messageId: string,
  body: FeedbackModerationPatchBody,
): Promise<FeedbackModerationRecord> {
  const response = await patch<FeedbackModerationPatchBody, unknown>(
    API_CONFIG.feedbackModerationMessage(messageId),
    body,
  );
  const moderation = parseFeedbackModerationPatchResponse(response);
  if (!moderation) {
    return {
      internal_notes: body.internal_notes ?? null,
      reviewed: body.reviewed ?? false,
      flagged: body.flagged ?? false,
      flag_reason: body.flag_reason ?? null,
      updated_at: new Date().toISOString(),
    };
  }
  return moderation;
}

export async function handleExportFeedbackModeration(
  params: FeedbackModerationExportParams,
): Promise<FeedbackModerationExportResult> {
  const { body, contentType, contentDisposition } = await getText(buildExportQuery(params));
  const format = params.fmt;
  const suggestedName = filenameFromContentDisposition(contentDisposition);

  return {
    content: body,
    format,
    filename: buildFeedbackExportFilename(format, suggestedName),
    mimeType: contentType?.split(';')[0]?.trim() || mimeTypeForFeedbackExport(format),
  };
}
