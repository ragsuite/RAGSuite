import {
  buildFeedbackModerationExportParams,
  type FeedbackModerationExportQuery,
  type FeedbackModerationExportResult,
} from '@/features/feedback-moderation/utils/feedback-export';
import type { FeedbackModerationListParams } from '@/features/feedback-moderation/types/feedback-moderation.api.types';
import type {
  FeedbackDetail,
  FeedbackListItem,
  FeedbackModerationRecord,
  FeedbackSummary,
  FeedbackVoteFilter,
  SaveModerationInput,
} from '@/features/feedback-moderation/types/feedback-moderation.types';
import { normalizeFeedbackDetailRow } from '@/features/feedback-moderation/utils/feedback-api';
import type { FeedbackEntriesPagePayload } from '@/features/feedback-moderation/utils/feedback-api';
import {
  mapFeedbackDetail,
  mapFeedbackListItem,
  mapFeedbackSummary,
} from '@/features/feedback-moderation/utils/feedback-mapper';
import {
  FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
  FEEDBACK_MODERATION_PAGE_SIZE,
} from '@/features/feedback-moderation/utils/feedback-options';
import { handleGetChatMessage } from '@/network/actions/chat-history.actions';
import { handleGetSearchMessage } from '@/network/actions/search-config.actions';
import {
  handleExportFeedbackModeration,
  handleGetFeedbackModerationSummary,
  handleListFeedbackModerationEntries,
  handlePatchFeedbackModeration,
} from '@/network/actions/feedback-moderation.actions';
import { API_CONFIG } from '@/network/apiUrl';

export const FEEDBACK_MODERATION_API = {
  summary: API_CONFIG.FEEDBACK_MODERATION_SUMMARY,
  entries: API_CONFIG.FEEDBACK_MODERATION_ENTRIES,
  export: API_CONFIG.FEEDBACK_MODERATION_EXPORT,
  message: API_CONFIG.chatMessage,
  moderation: API_CONFIG.feedbackModerationMessage,
} as const;

export type FeedbackListQuery = {
  query?: string;
  voteFilter?: FeedbackVoteFilter;
  limit?: number;
  offset?: number;
  messageType?: FeedbackModerationListParams['messageType'];
  projectId?: string | null;
};

export type FeedbackListResponse = {
  items: FeedbackListItem[];
  total: number;
  hasMore: boolean;
  limit: number;
  offset: number;
};

function buildListParams(params: FeedbackListQuery): FeedbackModerationListParams {
  return {
    limit: params.limit ?? FEEDBACK_MODERATION_PAGE_SIZE,
    offset: params.offset ?? 0,
    messageType: params.messageType ?? FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
    q: params.query,
    voteFilter: params.voteFilter,
  };
}

function buildListResponse(page: FeedbackEntriesPagePayload): FeedbackListResponse {
  const loaded = page.offset + page.items.length;
  const hasMore = loaded < page.total;
  return {
    items: page.items.map(mapFeedbackListItem),
    limit: page.limit,
    offset: page.offset,
    hasMore,
    total: page.total,
  };
}

export async function fetchFeedbackSummary(
  messageType = FEEDBACK_MODERATION_DEFAULT_MESSAGE_TYPE,
): Promise<FeedbackSummary> {
  const payload = await handleGetFeedbackModerationSummary(messageType);
  return mapFeedbackSummary(payload);
}

export async function fetchFeedbackList(params?: FeedbackListQuery): Promise<FeedbackListResponse> {
  const listParams = buildListParams(params ?? {});
  const page = await handleListFeedbackModerationEntries(listParams);
  return buildListResponse(page);
}

export async function fetchFeedbackById(
  messageId: string,
  projectId?: string | null,
  messageType?: string | null,
): Promise<FeedbackDetail | null> {
  const raw =
    messageType === 'search'
      ? await handleGetSearchMessage(messageId)
      : await handleGetChatMessage(messageId, projectId ?? undefined);
  const payload = normalizeFeedbackDetailRow(raw);
  if (!payload) return null;
  return mapFeedbackDetail(payload);
}

export async function saveFeedbackModeration(
  messageId: string,
  input: SaveModerationInput,
): Promise<FeedbackModerationRecord> {
  return handlePatchFeedbackModeration(messageId, {
    internal_notes: input.internalNotes.trim() || null,
    reviewed: input.reviewed,
    flagged: input.flagged,
    flag_reason: input.flagged ? input.flagReason?.trim() || null : null,
  });
}

export async function exportFeedbackModeration(
  query: FeedbackModerationExportQuery,
): Promise<FeedbackModerationExportResult> {
  return handleExportFeedbackModeration(buildFeedbackModerationExportParams(query));
}

export { buildFeedbackModerationExportParams } from '@/features/feedback-moderation/utils/feedback-export';
export type {
  FeedbackModerationExportQuery,
  FeedbackModerationExportResult,
} from '@/features/feedback-moderation/utils/feedback-export';

export function applyModerationToListItem(
  item: FeedbackListItem,
  moderation: FeedbackModerationRecord,
): FeedbackListItem {
  return {
    ...item,
    reviewed: moderation.reviewed,
    flagged: moderation.flagged,
  };
}
