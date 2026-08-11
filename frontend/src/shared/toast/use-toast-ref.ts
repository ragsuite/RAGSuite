import { useCallback, useEffect, useRef, type MutableRefObject } from 'react';

import type { ToastInput, ToastOptions, ToastId } from '@/shared/toast/toast.types';
import { useToast } from '@/shared/toast/use-toast';

export type ToastNotifyFn = (input: ToastInput, options?: ToastOptions) => ToastId;

/**
 * Stable ref to the latest toast function for use in data-fetch hooks.
 * Avoids listing `toast` in useCallback/useEffect deps when toast identity may change.
 */
export function useToastRef(): MutableRefObject<ToastNotifyFn> {
  const { toast } = useToast();
  const ref = useRef(toast);

  useEffect(() => {
    ref.current = toast;
  });

  return ref;
}

/**
 * Stable toast function identity for useCallback/useEffect dependency arrays.
 * Prefer this over `useToast().toast` when toast is listed in hook deps.
 */
export function useStableToast(): ToastNotifyFn {
  const toastRef = useToastRef();
  return useCallback(
    (input: ToastInput, options?: ToastOptions) => toastRef.current(input, options),
    [toastRef],
  );
}
