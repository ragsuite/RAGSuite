import type { ToastInput, ToastInputVariant, ToastOptions, ToastVariant } from '@/shared/toast/toast.types';
import { DEFAULT_TOAST_DURATION_MS } from '@/shared/toast/toast-store';

export type ToastifyToastType = 'default' | 'success' | 'error' | 'warning' | 'info';

const TOASTIFY_VARIANT_MAP: Record<ToastVariant, ToastifyToastType> = {
  default: 'default',
  success: 'success',
  error: 'error',
  warning: 'warning',
  info: 'info',
};

export function getToastifyType(variant?: ToastInputVariant): ToastifyToastType {
  if (!variant) return 'default';
  if (variant === 'destructive') return 'error';
  return TOASTIFY_VARIANT_MAP[variant];
}

export function getToastifyDuration(input: ToastInput, options?: ToastOptions): number {
  if (options?.durationMs !== undefined) return options.durationMs;
  if (typeof input !== 'string' && input.durationMs !== undefined) return input.durationMs;
  return DEFAULT_TOAST_DURATION_MS;
}

export function getToastifyId(input: ToastInput, options?: ToastOptions): string | undefined {
  if (options?.id) return options.id;
  if (typeof input !== 'string') return input.id;
  return undefined;
}

export function formatToastifyMessage(input: ToastInput): string {
  if (typeof input === 'string') return input;

  const title = input.title;
  const description = input.description;

  if (title && description) return `${title}\n${description}`;
  return title || description || '';
}
