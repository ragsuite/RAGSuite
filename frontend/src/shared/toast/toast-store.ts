import type { NormalizedToastInput, ToastId, ToastInput, ToastOptions, ToastRecord, ToastVariant } from '@/shared/toast/toast.types';

export const DEFAULT_TOAST_DURATION_MS = 5_000;
export const TOAST_DEDUPE_WINDOW_MS = 1_800;
export const MAX_TOASTS = 5;

function normalizeVariant(variant: ToastInput extends string ? never : ToastVariant | 'destructive' | undefined): ToastVariant {
  if (variant === 'destructive') return 'error';
  return variant ?? 'default';
}

export function normalizeToastInput(input: ToastInput, options?: ToastOptions): NormalizedToastInput {
  if (typeof input === 'string') {
    return {
      id: options?.id,
      title: undefined,
      description: input,
      variant: 'default',
      durationMs: options?.durationMs,
    };
  }

  return {
    id: options?.id ?? input.id,
    title: input.title,
    description: input.description ?? input.title ?? '',
    variant: normalizeVariant(input.variant),
    durationMs: options?.durationMs ?? input.durationMs,
  };
}

type CreateToastOptions = {
  id?: ToastId;
  now?: number;
  durationMs?: number;
};

export function createToastRecord(input: NormalizedToastInput, options: CreateToastOptions = {}): ToastRecord {
  const now = options.now ?? Date.now();
  const durationMs = options.durationMs ?? input.durationMs ?? DEFAULT_TOAST_DURATION_MS;

  return {
    id: options.id ?? input.id ?? createToastId(now),
    title: input.title,
    description: input.description,
    variant: input.variant,
    durationMs,
    remainingMs: durationMs,
    createdAt: now,
    startedAt: now,
    paused: false,
  };
}

export function findDuplicateToastId(
  toasts: ToastRecord[],
  input: NormalizedToastInput,
  now = Date.now(),
  dedupeWindowMs = TOAST_DEDUPE_WINDOW_MS,
): ToastId | null {
  const duplicate = toasts.find((toast) => (
    toast.variant === input.variant &&
    toast.title === input.title &&
    toast.description === input.description &&
    now - toast.createdAt <= dedupeWindowMs
  ));

  return duplicate?.id ?? null;
}

let toastSequence = 0;

function createToastId(now: number): ToastId {
  toastSequence += 1;
  return `toast-${now}-${toastSequence}`;
}
