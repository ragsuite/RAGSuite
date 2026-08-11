export type ToastId = string;

export type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info';

export type ToastInputVariant = ToastVariant | 'destructive';

export type ToastInput = string | {
  id?: ToastId;
  title?: string;
  description?: string;
  variant?: ToastInputVariant;
  durationMs?: number;
};

export type NormalizedToastInput = {
  id?: ToastId;
  title?: string;
  description: string;
  variant: ToastVariant;
  durationMs?: number;
};

export type ToastOptions = {
  id?: ToastId;
  durationMs?: number;
};

export type ToastRecord = {
  id: ToastId;
  title?: string;
  description: string;
  variant: ToastVariant;
  durationMs: number;
  remainingMs: number;
  createdAt: number;
  startedAt: number;
  paused: boolean;
};
