import { API_CONFIG } from '@/network/apiUrl';
import { get, put } from '@/network/request';

export type RetentionEligibleCounts = {
  chat_messages: number;
  query_logs: number;
  analytics_days: number;
  audit_events: number;
};

export type RetentionPreview = {
  cutoff_at?: string | null;
  eligible_counts: RetentionEligibleCounts;
  new_data_expires_at?: string | null;
  days_until_new_data_expires: number;
  oldest_interaction_at?: string | null;
  days_until_oldest_expires?: number | null;
  next_purge_estimate_at?: string | null;
  auto_delete_active: boolean;
};

export type RetentionPolicyResponse = {
  auto_delete: boolean;
  retention_days: number;
  retention_updated_at?: string | null;
  retention_last_purge_at?: string | null;
  min_days: number;
  max_days: number;
  default_days: number;
  preview?: RetentionPreview;
};

export type RetentionPolicyUpdatePayload = {
  auto_delete: boolean;
  retention_days: number;
  confirmation?: string;
};

export type DeletionReceiptResponse = {
  id: string;
  org_id: number;
  project_id?: string | null;
  trigger_type: string;
  initiated_by_user_id?: number | null;
  initiated_at: string;
  completed_at?: string | null;
  status: string;
  summary: string;
  manifest: Record<string, unknown>;
};

function unwrapBody<T>(body: unknown): T {
  if (body && typeof body === 'object' && 'data' in body) {
    return (body as { data: T }).data;
  }
  return body as T;
}

export async function handleGetRetentionPolicy(): Promise<RetentionPolicyResponse> {
  const body = await get<RetentionPolicyResponse>(API_CONFIG.COMPLIANCE_RETENTION);
  return unwrapBody<RetentionPolicyResponse>(body);
}

export async function handleUpdateRetentionPolicy(
  payload: RetentionPolicyUpdatePayload,
): Promise<RetentionPolicyResponse> {
  const body = await put<RetentionPolicyUpdatePayload, RetentionPolicyResponse>(
    API_CONFIG.COMPLIANCE_RETENTION,
    payload,
  );
  return unwrapBody<RetentionPolicyResponse>(body);
}

export async function handleListDeletionReceipts(params?: {
  limit?: number;
  offset?: number;
  trigger_type?: string;
}): Promise<{ items: DeletionReceiptResponse[]; total: number }> {
  const body = await get<{ items: DeletionReceiptResponse[]; total: number }>(
    API_CONFIG.COMPLIANCE_DELETION_RECEIPTS,
    { params },
  );
  return unwrapBody<{ items: DeletionReceiptResponse[]; total: number }>(body);
}

export async function handleGetDeletionReceipt(receiptId: string): Promise<DeletionReceiptResponse> {
  const body = await get<DeletionReceiptResponse>(API_CONFIG.complianceDeletionReceipt(receiptId));
  return unwrapBody<DeletionReceiptResponse>(body);
}
