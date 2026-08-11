import type { ErrorResponse } from '@/types/api.types';

export const COMMON_ERROR_RESPONSE: ErrorResponse = {
  status: false,
  message: 'Something went wrong. Please try again.',
};

type ValidationErrorItem = {
  msg?: string;
  message?: string;
};

export function extractApiErrorMessage(data: unknown, fallback = COMMON_ERROR_RESPONSE.message): string {
  if (!data || typeof data !== 'object') {
    return fallback;
  }

  const record = data as Record<string, unknown>;

  if (typeof record.message === 'string' && record.message.trim()) {
    return record.message;
  }

  if (typeof record.detail === 'string' && record.detail.trim()) {
    return record.detail;
  }

  if (Array.isArray(record.detail) && record.detail.length > 0) {
    const first = record.detail[0] as ValidationErrorItem;
    if (typeof first?.msg === 'string' && first.msg.trim()) {
      return first.msg;
    }
    if (typeof first?.message === 'string' && first.message.trim()) {
      return first.message;
    }
  }

  return fallback;
}

export function getApiErrorMessage(error: unknown, fallback = COMMON_ERROR_RESPONSE.message): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
}

export function isUnauthorizedStatus(status?: number): boolean {
  return status === 401 || status === 410 || status === 423;
}
